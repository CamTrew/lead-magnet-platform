import { sampleWorkspace, sampleMagnet } from '@/lib/sample-workspace';
import { notFound } from 'next/navigation';
import { PageEditorClient } from '@/components/dashboard/page-editor-client';
import { requireDashboardBase } from '@/lib/auth';
import { assistantEnabled } from '@/lib/assistant-auth';
import { findLeadMagnetForAccount, listCampaignPageLinks } from '@/lib/platform-store';

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (process.env.MAGNETS_STAGING_PREVIEW === '1') {
    if (id !== sampleMagnet.id) notFound();
    return <PageEditorClient initialData={sampleWorkspace} initialLeadMagnet={sampleMagnet} designPreview />;
  }
  const payload = await requireDashboardBase();
  const leadMagnet = await findLeadMagnetForAccount(payload.account.id, id);

  if (!leadMagnet) notFound();

  const campaign = assistantEnabled()
    ? (await listCampaignPageLinks(payload.account.id)).find((item) => item.leadMagnetId === id && item.usesCampaignCover)
    : undefined;
  return <PageEditorClient initialData={payload} initialLeadMagnet={leadMagnet}
    campaignCoverPreview={campaign ? `/api/campaigns/${campaign.id}/resource?cover=1&revision=${campaign.revision}` : undefined} />;
}
