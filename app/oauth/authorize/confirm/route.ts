import {
  enforceRateLimits,
  RateLimitError,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { readAssistantBody } from "@/lib/assistant-request";
import { getCurrentDashboardBase } from "@/lib/auth";
import {
  assistantEnabled,
  assistantOrigin,
  newAssistantToken,
  tokenHash,
  validateAuthorization,
  secureOAuthResponse,
} from "@/lib/assistant-auth";
import { createAssistantGrant } from "@/lib/platform-store";
export async function POST(request: Request) {
  if (!assistantEnabled()) return new Response(null, { status: 404 });
  if (request.headers.get("origin") !== assistantOrigin())
    return secureOAuthResponse({ error: "invalid_request" }, 403);
  const payload = await getCurrentDashboardBase();
  if (!payload) return secureOAuthResponse({ error: "unauthorized" }, 401);
  try {
    await enforceRateLimits([
      {
        scope: "assistant:consent",
        identifier: payload.account.id,
        limit: 20,
        windowSeconds: 3600,
      },
    ]);
    const { args } = await validateAuthorization(
      Object.fromEntries(
        new URLSearchParams(await readAssistantBody(request, 10000)),
      ),
    );
    const code = newAssistantToken();
    await createAssistantGrant({
      accountId: payload.account.id,
      clientId: args.client_id,
      resource: args.resource,
      redirectUri: args.redirect_uri,
      challenge: args.code_challenge,
      codeHash: tokenHash(code),
    });
    const url = new URL(args.redirect_uri);
    url.searchParams.set("code", code);
    url.searchParams.set("state", args.state);
    url.searchParams.set("iss", assistantOrigin());
    return new Response(null, {
      status: 303,
      headers: {
        Location: url.toString(),
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    return secureOAuthResponse({ error: "invalid_request" }, 400);
  }
}
