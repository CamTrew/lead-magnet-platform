import { z } from "zod";
import { getPublicCampaign } from "@/lib/platform-store";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!z.string().uuid().safeParse(token).success)
    return new Response(null, { status: 404 });
  const campaign = await getPublicCampaign(token);
  if (!campaign?.cover_data) return new Response(null, { status: 404 });
  const bytes = Buffer.from(campaign.cover_data, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
