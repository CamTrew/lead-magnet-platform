import { requireDashboardBase } from '@/lib/auth';
import { findLatestPublishedLeadMagnetForAccount } from '@/lib/platform-store';
import { BrandClient } from '@/components/dashboard/brand-client';

export default async function BrandPage() {
  const payload = await requireDashboardBase();
  const previewLeadMagnet = await findLatestPublishedLeadMagnetForAccount(payload.account.id);

  return <BrandClient initialData={payload} previewLeadMagnet={previewLeadMagnet} />;
}
