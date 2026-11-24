import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentDashboardBase } from "@/lib/auth";
import { listCampaigns, listAssistantGrants, getCreationRequest, getCreationBrand } from "@/lib/platform-store";
import { assistantOrigin } from "@/lib/assistant-auth";
import { isSetupComplete } from "@/lib/setup";
import { CreationWorkspace } from "@/components/creation/creation-workspace";
export const metadata: Metadata = {
  title: "Create your next magnet",
  robots: { index: false, follow: false },
};
export default async function CreatePage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const startNew = (await searchParams).new === '1';
  const preview = process.env.MAGNETS_STAGING_PREVIEW === "1";
  if (!preview && process.env.MAGNETS_CREATION_ENABLED !== "1")
    redirect("/dashboard/pages");
  if (preview)
    return (
      <CreationWorkspace
        preview
        focused
        initialSample={false}
        initialCampaigns={[]}
        initialConnections={[]}
      />
    );
  const payload = await getCurrentDashboardBase();
  if (!payload) redirect("/login?next=/create");
  const [campaigns, connections, savedBrief, brand] = await Promise.all([
    listCampaigns(payload.account.id),
    listAssistantGrants(payload.account.id),
    getCreationRequest(payload.account.id),
    getCreationBrand(payload.account.id),
  ]);
  return (
    <>
      <CreationWorkspace
        preview={false}
        connectionOrigin={assistantOrigin()}
        initialSavedBrief={startNew ? null : savedBrief}
        startNew={startNew}
        initialBrand={brand}
        initialUsername={payload.account.username}
        initialPublishingReady={isSetupComplete(payload.account)}
        creatorName={payload.user.name || "My magnets"}
        focused={startNew || campaigns.length === 0}
        initialCampaigns={JSON.parse(JSON.stringify(campaigns))}
        initialConnections={JSON.parse(JSON.stringify(connections))}
      />
    </>
  );
}
