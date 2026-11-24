import { resolveCampaignHostedResource } from '@/lib/platform-store';
import { z } from "zod";
import { getPublicCampaign } from "@/lib/platform-store";
import { renderCampaignPdf } from "@/lib/campaign-render";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!z.string().uuid().safeParse(token).success)
    return new Response(null, { status: 404 });
  const campaign = await getPublicCampaign(token);
  if (!campaign) return new Response(null, { status: 404 });
  if ( 'hostedResource' in campaign.content.resource) {
    try {
      const file = await resolveCampaignHostedResource(campaign.account_id, campaign.content.resource.hostedResource);
      return new Response(null, { status: 307, headers: { Location: file.publicUrl, 'Cache-Control': 'private, no-store' } });
    } catch { return new Response('File not found', { status: 404 }); }
  }
  const bytes = await renderCampaignPdf(campaign.content);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="your-resource.pdf"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
