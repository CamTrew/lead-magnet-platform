import { handleAssistantMcp } from "@/lib/assistant-mcp";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = (request: Request) => handleAssistantMcp(request);
export function GET() { return new Response(null, {status:405,headers:{Allow:"POST"}}); }
