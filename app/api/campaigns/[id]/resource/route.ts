import { resolveCampaignHostedResource } from '@/lib/platform-store';
import { z } from "zod";
import { getCurrentDashboardBase } from "@/lib/auth";
import { assistantEnabled } from "@/lib/assistant-auth";
import { getCampaign } from "@/lib/platform-store";
import { renderCampaignPdf } from "@/lib/campaign-render";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!assistantEnabled()) return new Response(null, { status: 404 });
  const payload = await getCurrentDashboardBase();
  if (!payload) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return new Response(null, { status: 404 });
  const campaign = await getCampaign(payload.account.id, id);
  if (!campaign) return new Response(null, { status: 404 });
  const cover = new URL(request.url).searchParams.get("cover") === "1";
  if (!cover &&  'hostedResource' in campaign.content.resource) {
    try {
      const file = await resolveCampaignHostedResource(campaign.account_id, campaign.content.resource.hostedResource);
      return new Response(null, { status: 307, headers: { Location: file.publicUrl, 'Cache-Control': 'private, no-store' } });
    } catch { return new Response('File not found', { status: 404 }); }
  }
  if (cover && !campaign.cover_data) return new Response(null, { status: 404 });
  const bytes = cover ? Buffer.from(campaign.cover_data, "base64") : await renderCampaignPdf(campaign.content);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": cover ? "image/png" : "application/pdf",
      "Content-Disposition": cover
        ? "inline"
        : 'attachment; filename="lead-magnet.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
