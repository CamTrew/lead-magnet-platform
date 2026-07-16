import { requireDashboardBase } from '@/lib/auth';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const payload = await requireDashboardBase();

  return <DashboardClient initialData={payload} />;
}
