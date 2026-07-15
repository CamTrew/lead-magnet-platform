import { requireDashboardPayload } from '@/lib/auth';
import { BrandClient } from '@/components/dashboard/brand-client';

export default async function BrandPage() {
  const payload = await requireDashboardPayload();

  return <BrandClient initialData={payload} />;
}
