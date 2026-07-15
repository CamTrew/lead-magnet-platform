import { requireDashboardPayload } from '@/lib/auth';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const payload = await requireDashboardPayload();

  return <DashboardClient initialData={payload} />;
}
