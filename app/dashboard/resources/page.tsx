import { HostedResourcesClient } from '@/components/dashboard/hosted-resources-client';
import { requireDashboardBase } from '@/lib/auth';
import { assistantEnabled } from '@/lib/assistant-auth';
import { GeneratedResources } from '@/components/dashboard/generated-resources';
import { listHostedResources, listGeneratedHostedResources } from '@/lib/platform-store';

export const dynamic = 'force-dynamic';

export default async function HostedResourcesPage() {
  const payload = await requireDashboardBase();
  const [resources, generated] = await Promise.all([
    listHostedResources(payload.account.id),
    assistantEnabled() ? listGeneratedHostedResources(payload.account.id) : Promise.resolve([]),
  ]);

  return (
    <HostedResourcesClient
      accountId={payload.account.id}
      initialResources={resources}
      generatedCount={generated.length}
      generatedResources={<GeneratedResources resources={generated} />}
    />
  );
}
