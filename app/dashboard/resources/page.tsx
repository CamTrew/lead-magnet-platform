import { HostedResourcesClient } from '@/components/dashboard/hosted-resources-client';
import { requireDashboardBase } from '@/lib/auth';
import { listHostedResources } from '@/lib/platform-store';

export const dynamic = 'force-dynamic';

export default async function HostedResourcesPage() {
  const payload = await requireDashboardBase();
  const resources = await listHostedResources(payload.account.id);

  return (
    <HostedResourcesClient
      accountId={payload.account.id}
      initialResources={resources}
    />
  );
}
