import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getAssistantClient } from "./platform-store";
export const ASSISTANT_SCOPE = "campaigns:create";
export const WORKSPACE_ASSISTANT_SCOPE = "workspace:manage";
export function assistantScopeForResource(resource: string) {
  if (resource === `${assistantOrigin()}/mcp`) return ASSISTANT_SCOPE;
  if (resource === `${assistantOrigin()}/mcp/workspace`) return WORKSPACE_ASSISTANT_SCOPE;
  throw new Error('Invalid resource.');
}
export function assistantOrigin() {
  const value =
    process.env.MAGNETS_ASSISTANT_ORIGIN || process.env.NEXT_PUBLIC_SITE_URL;
  if (!value)
    throw new Error(
      "Configure the assistant origin before enabling connections.",
    );
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !(url.hostname === "127.0.0.1" || url.hostname === "localhost")
  )
    throw new Error("Assistant origin must use HTTPS.");
  return url.origin;
}
export function assistantEnabled() {
  return (
    process.env.MAGNETS_CREATION_ENABLED === "1" &&
    process.env.MAGNETS_STAGING_PREVIEW !== "1"
  );
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newAssistantToken = () =>
  `mag_${randomBytes(32).toString("base64url")}`;
export const pkceChallenge = (verifier: string) =>
  createHash("sha256").update(verifier).digest("base64url");
export const authorizationSchema = z.object({
  client_id: z.string().uuid(),
  redirect_uri: z.string().url().max(2048),
  response_type: z.literal("code"),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code_challenge_method: z.literal("S256"),
  state: z.string().min(1).max(2048),
  resource: z.string().url(),
  scope: z.enum([ASSISTANT_SCOPE, WORKSPACE_ASSISTANT_SCOPE]).optional(),
});
export async function validateAuthorization(input: unknown) {
  const args = authorizationSchema.parse(input);
  const scope = assistantScopeForResource(args.resource);
  if (args.scope && args.scope !== scope) throw new Error('Scope does not match resource.');
  const client = await getAssistantClient(args.client_id);
  if (!client || !client.redirect_uris.includes(args.redirect_uri))
    throw new Error("Unregistered redirect URI.");
  return { args: { ...args, scope }, client };
}
export function secureOAuthResponse(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
  });
}
