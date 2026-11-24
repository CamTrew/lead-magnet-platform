import { assistantEnabled, assistantOrigin, WORKSPACE_ASSISTANT_SCOPE } from '@/lib/assistant-auth';
export function GET() {
  if (!assistantEnabled()) return new Response(null, {status:404});
  const origin = assistantOrigin();
  return Response.json({resource:`${origin}/mcp/workspace`,authorization_servers:[origin],scopes_supported:[WORKSPACE_ASSISTANT_SCOPE],bearer_methods_supported:['header']});
}
