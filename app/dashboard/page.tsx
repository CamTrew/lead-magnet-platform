import { requireDashboardBase } from '@/lib/auth';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ connection?: string; setup?: string }>;
}) {
  const payload = await requireDashboardBase();
  const query = await searchParams;
  const connectionTargets = [
    'sender',
    'calendar',
    'slack',
    'zapier',
    'pipedrive',
    'kit',
    'newsletter',
    'legal',
  ] as const;
  const openConnectionInitially = connectionTargets.find(
    (target) => target === query.connection
  );

  return (
    <DashboardClient
      initialData={payload}
      openConnectionInitially={openConnectionInitially}
      openCustomDomainInitially={query.setup === 'custom-domain'}
    />
  );
}
