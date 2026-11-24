import {
  assistantEnabled,
  assistantOrigin,
  ASSISTANT_SCOPE,
  WORKSPACE_ASSISTANT_SCOPE,
} from "@/lib/assistant-auth";
export function GET() {
  if (!assistantEnabled()) return new Response(null, { status: 404 });
  const origin = assistantOrigin();
  return Response.json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [ASSISTANT_SCOPE, WORKSPACE_ASSISTANT_SCOPE],
  });
}
