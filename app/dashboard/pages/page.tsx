import { redirect } from 'next/navigation';
import { requireDashboardBase } from '@/lib/auth';
import { listLeadMagnetSummaries, listCampaignPageLinks } from '@/lib/platform-store';
import { isSetupComplete } from '@/lib/setup';
import { PagesClient } from '@/components/dashboard/pages-client';

export default async function PagesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; assistant?: string }>;
}) {
  const payload = await requireDashboardBase();
  if (!isSetupComplete(payload.account)) {
    redirect('/dashboard?setup=incomplete');
  }

  const assistantCreationEnabled = process.env.MAGNETS_CREATION_ENABLED === '1';
  const [leadMagnets, campaignLinks] = await Promise.all([
    listLeadMagnetSummaries(payload.account.id),
    assistantCreationEnabled ? listCampaignPageLinks(payload.account.id) : Promise.resolve([]),
  ]);
  const query = await searchParams;

  return (
    <PagesClient
      initialData={payload}
      assistantCreationEnabled={assistantCreationEnabled}
      campaignLinks={campaignLinks}
      initialLeadMagnets={leadMagnets}
      openCreateInitially={query.new === '1'}
    />
  );
}
