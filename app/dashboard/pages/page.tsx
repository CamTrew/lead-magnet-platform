import { requireDashboardPayload } from '@/lib/auth';
import { PagesClient } from '@/components/dashboard/pages-client';

export default async function PagesPage() {
  const payload = await requireDashboardPayload();

  return <PagesClient initialData={payload} />;
}

