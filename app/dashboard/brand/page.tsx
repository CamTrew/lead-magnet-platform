import { redirect } from 'next/navigation';
import { requireDashboardPayload } from '@/lib/auth';
import { isPublishingDomainReady } from '@/lib/setup';
import { BrandClient } from '@/components/dashboard/brand-client';

export default async function BrandPage() {
  const payload = await requireDashboardPayload();

  if (!isPublishingDomainReady(payload.account)) {
    redirect('/dashboard?setup=domain');
  }

  return <BrandClient initialData={payload} />;
}
