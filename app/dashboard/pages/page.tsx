import { redirect } from 'next/navigation';
import { requireDashboardBase } from '@/lib/auth';
import { listLeadMagnetSummaries } from '@/lib/platform-store';
import { isSetupComplete } from '@/lib/setup';
import { PagesClient } from '@/components/dashboard/pages-client';

export default async function PagesPage() {
  const payload = await requireDashboardBase();
  if (!isSetupComplete(payload.account)) {
    redirect('/dashboard?setup=incomplete');
  }

  const leadMagnets = await listLeadMagnetSummaries(payload.account.id);

  return <PagesClient initialData={payload} initialLeadMagnets={leadMagnets} />;
}
