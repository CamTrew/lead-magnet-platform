import { notFound } from 'next/navigation';
import { LeadMagnetAnalyticsView } from '@/components/dashboard/lead-magnet-analytics-view';
import { requireDashboardBase } from '@/lib/auth';
import { preferredLeadMagnetUrl } from '@/lib/lead-magnet-metadata';
import { findLeadMagnetForAccount, getLeadMagnetAnalytics } from '@/lib/platform-store';

export const dynamic = 'force-dynamic';

export default async function LeadMagnetAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const payload = await requireDashboardBase();
  const leadMagnet = await findLeadMagnetForAccount(payload.account.id, id);
  if (!leadMagnet) notFound();

  const analytics = await getLeadMagnetAnalytics(payload.account.id, leadMagnet.id);
  return (
    <LeadMagnetAnalyticsView
      analytics={analytics}
      leadMagnet={leadMagnet}
      pageUrl={preferredLeadMagnetUrl(
        payload.account,
        leadMagnet,
        process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so'
      )}
    />
  );
}
