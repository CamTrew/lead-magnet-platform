import { readAssistantBody } from "@/lib/assistant-request";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assistantEnabled, secureOAuthResponse } from "@/lib/assistant-auth";
import { registerAssistantClient } from "@/lib/platform-store";
import {
  enforceRateLimits,
  requestIp,
  RateLimitError,
  rateLimitResponse,
} from "@/lib/rate-limit";
const schema = z.object({
  client_name: z.string().trim().min(1).max(100).default("Connected assistant"),
  redirect_uris: z
    .array(
      z
        .string()
        .url()
        .max(2048)
        .refine((value) => {
          const u = new URL(value);
          return (
            u.protocol === "https:" && !u.username && !u.password && !u.hash
          );
        }),
    )
    .min(1)
    .max(5),
  token_endpoint_auth_method: z.literal("none").default("none"),
  grant_types: z
    .array(z.enum(["authorization_code", "refresh_token"]))
    .optional(),
  response_types: z.array(z.literal("code")).optional(),
});
export async function POST(request: Request) {
  if (!assistantEnabled()) return new Response(null, { status: 404 });
  try {
    await enforceRateLimits([
      {
        scope: "assistant:register",
        identifier: requestIp(request as Parameters<typeof requestIp>[0]),
        limit: 20,
        windowSeconds: 3600,
      },
    ]);
    if (Number(request.headers.get("content-length")) > 10000)
      return secureOAuthResponse({ error: "invalid_client_metadata" }, 400);
    const input = schema.parse(
      JSON.parse(await readAssistantBody(request, 10000)),
    );
    const id = randomUUID();
    await registerAssistantClient(id, input.client_name, input.redirect_uris);
    return secureOAuthResponse(
      {
        ...input,
        client_id: id,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
      201,
    );
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    return secureOAuthResponse({ error: "invalid_client_metadata" }, 400);
  }
}
