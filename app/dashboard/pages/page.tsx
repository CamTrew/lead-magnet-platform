import { redirect } from 'next/navigation';
import { requireDashboardPayload } from '@/lib/auth';
import { isSetupComplete } from '@/lib/setup';
import { PagesClient } from '@/components/dashboard/pages-client';

export default async function PagesPage() {
  const payload = await requireDashboardPayload();
  if (!isSetupComplete(payload.account)) {
    redirect('/dashboard?setup=incomplete');
  }

  return <PagesClient initialData={payload} />;
}
