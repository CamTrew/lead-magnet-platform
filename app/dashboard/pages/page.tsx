import { redirect } from 'next/navigation';
import { requireDashboardBase } from '@/lib/auth';
import { listLeadMagnetSummaries } from '@/lib/platform-store';
import { isSetupComplete } from '@/lib/setup';
import { PagesClient } from '@/components/dashboard/pages-client';

export default async function PagesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const payload = await requireDashboardBase();
  if (!isSetupComplete(payload.account)) {
    redirect('/dashboard?setup=incomplete');
  }

  const leadMagnets = await listLeadMagnetSummaries(payload.account.id);
  const query = await searchParams;

  return (
    <PagesClient
      initialData={payload}
      initialLeadMagnets={leadMagnets}
      openCreateInitially={query.new === '1'}
    />
  );
}
