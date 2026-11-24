import { readAssistantBody } from "@/lib/assistant-request";
import { z } from "zod";
import {
  assistantEnabled,
  assistantScopeForResource,
  newAssistantToken,
  pkceChallenge,
  secureOAuthResponse,
  tokenHash,
} from "@/lib/assistant-auth";
import { exchangeAssistantGrant } from "@/lib/platform-store";
import {
  enforceRateLimits,
  requestIp,
  RateLimitError,
  rateLimitResponse,
} from "@/lib/rate-limit";
const schema = z
  .object({
    grant_type: z.enum(["authorization_code", "refresh_token"]),
    client_id: z.string().uuid(),
    resource: z.string().url(),
    code: z.string().max(200).optional(),
    redirect_uri: z.string().url().max(2048).optional(),
    code_verifier: z
      .string()
      .regex(/^[A-Za-z0-9._~-]{43,128}$/)
      .optional(),
    refresh_token: z.string().max(200).optional(),
  })
  .strict();
export async function POST(request: Request) {
  if (!assistantEnabled()) return new Response(null, { status: 404 });
  try {
    await enforceRateLimits([
      {
        scope: "assistant:token",
        identifier: requestIp(request as Parameters<typeof requestIp>[0]),
        limit: 60,
        windowSeconds: 60,
      },
    ]);
    const raw = await readAssistantBody(request, 10000);
    const input = schema.parse(Object.fromEntries(new URLSearchParams(raw)));
    const scope = assistantScopeForResource(input.resource);
    const isCode = input.grant_type === "authorization_code";
    if (
      isCode
        ? !input.code || !input.redirect_uri || !input.code_verifier
        : !input.refresh_token
    )
      throw new Error("Invalid grant");
    const access = newAssistantToken(),
      refresh = newAssistantToken();
    const exchanged = await exchangeAssistantGrant({
      kind: isCode ? "code" : "refresh",
      clientId: input.client_id,
      resource: input.resource,
      hash: tokenHash((isCode ? input.code : input.refresh_token)!),
      redirectUri: input.redirect_uri,
      challenge: input.code_verifier
        ? pkceChallenge(input.code_verifier)
        : undefined,
      accessHash: tokenHash(access),
      refreshHash: tokenHash(refresh),
    });
    if (!exchanged) return secureOAuthResponse({ error: "invalid_grant" }, 400);
    return secureOAuthResponse({
      access_token: access,
      refresh_token: refresh,
      token_type: "Bearer",
      expires_in: 3600,
      scope,
    });
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    return secureOAuthResponse({ error: "invalid_grant" }, 400);
  }
}
