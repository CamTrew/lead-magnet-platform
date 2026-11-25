import { CAMPAIGN_COMPLETION_GUIDANCE, campaignNextStep } from "./campaign-content";
import { platformLeadMagnetPath } from './platform-username';
import {
  getAccountWithSecrets,
  getAccountPlatformUsername,
  getCampaign,
  saveCampaignPackage,
  resolveCampaignHostedResource,
  findLeadMagnetForAccount,
  markCampaignPublished,
  updateLeadMagnet,
  updateLeadMagnetFollowUpSync,
  withLeadMagnetMutationLock,
} from "./platform-store";
import { resolveResendApiKey, resolveResendFromEmail } from "./platform-resend";
import { syncLeadMagnetFollowUpAutomation } from "./follow-up-sequences";
import { invalidatePublishedLeadMagnetCache } from "./public-lead-magnet-cache";
import { assistantOrigin } from "./assistant-auth";
import { log } from "./logger";
import { isSetupComplete } from "./setup";

export async function publishCampaign(accountId: string, id: string) {
  const campaign = await getCampaign(accountId, id);
  if (!campaign?.lead_magnet_id) throw new Error("Campaign not found.");
  return withLeadMagnetMutationLock(
    accountId,
    campaign.lead_magnet_id,
    async () => {
      let magnet = await findLeadMagnetForAccount(
        accountId,
        campaign.lead_magnet_id!,
      );
      const account = await getAccountWithSecrets(accountId);
      if (!magnet || !account) throw new Error("Campaign not found.");
      if ('hostedResource' in campaign.content.resource) await resolveCampaignHostedResource(accountId, campaign.content.resource.hostedResource);
      if (!isSetupComplete(account))
        throw new Error(
          "Choose your Magnets username in the dashboard before publishing.",
        );
      if (!resolveResendApiKey(account) || !resolveResendFromEmail(account))
        throw new Error(
          "Email delivery is not configured. Your campaign is saved as a draft.",
        );
      if (
        !magnet.downloadLink ||
        !magnet.emailBody ||
        !magnet.emailSubject ||
        !magnet.subtitle ||
        !magnet.formHeading ||
        !magnet.bullets.length
      )
        throw new Error(
          "Finish the resource, page, and delivery email before publishing.",
        );
      if (!magnet.published) {
        // Prepare the automation before the page can accept a real signup.
        if (magnet.followUpEnabled) {
          const synced = await syncLeadMagnetFollowUpAutomation(
            account,
            magnet,
          );
          magnet =
            (await updateLeadMagnetFollowUpSync(accountId, magnet.id, {
              followUpEmails: synced.emails,
              resendFollowUpAutomationId: synced.automationId,
              resendFollowUpRenderVersion: synced.renderVersion,
            })) || magnet;
        }
        await markCampaignPublished(accountId, id);
        await updateLeadMagnet(
          accountId,
          magnet.id,
          { ...magnet, published: true },
          { versionSource: "manual" },
        );
        invalidatePublishedLeadMagnetCache();
      }
      // Campaigns may also be published from the existing page editor.
      await markCampaignPublished(accountId, id);
      const url = `${assistantOrigin()}${platformLeadMagnetPath(account.username, magnet.slug, magnet.id)}`;
      return {
        url,
        publicUrl: url,
        audienceUrl: `${assistantOrigin()}/dashboard/signups`,
        reviewUrl: `${assistantOrigin()}/create?campaign=${id}`,
        nextStep: campaignNextStep(magnet),
        message: CAMPAIGN_COMPLETION_GUIDANCE,
        editorUrl: `${assistantOrigin()}/dashboard/pages/${magnet.id}`,
      };
    },
  );
}

/** Only label a URL live when the owning page is currently published. */
export async function campaignLinks(accountId: string, campaign: import('./platform-store').CampaignRecord, origin: string, includeNextStep = false) {
  const [magnet, username] = await Promise.all([
    campaign.lead_magnet_id ? findLeadMagnetForAccount(accountId, campaign.lead_magnet_id) : Promise.resolve(null),
    getAccountPlatformUsername(accountId),
  ]);
  return {
    ...(includeNextStep ? { nextStep: magnet?.published ? campaignNextStep(magnet) : null } : {}),
    status: magnet?.published ? 'published' : 'draft',
    reviewUrl: `${origin}/create?campaign=${campaign.id}`,
    editorUrl: magnet ? `${origin}/dashboard/pages/${magnet.id}` : null,
    audienceUrl: `${origin}/dashboard/signups`,
    publicUrl: magnet?.published ? `${origin}${platformLeadMagnetPath(username, magnet.slug, magnet.id)}` : null,
  };
}

/** Creation publishes by default; retries never republish a deliberately unpublished page. */
export async function createAndPublishCampaign(...args: Parameters<typeof saveCampaignPackage>) {
  const campaign = await saveCampaignPackage(...args);
  let publicationError: string | null = null;
  if (!campaign.published_at) {
    try {
      await publishCampaign(args[0], campaign.id);
    } catch (error) {
      log.warn("campaign.auto-publish", { route: "campaign.auto-publish", extra: { error } });
      const message = error instanceof Error ? error.message : '';
      publicationError = [
        "Choose your Magnets username in the dashboard before publishing.",
        "Email delivery is not configured. Your campaign is saved as a draft.",
        "Finish the resource, page, and delivery email before publishing.",
      ].includes(message) ? message : "Your campaign is saved, but publishing did not finish. Open it in Magnets to retry.";
    }
  }
  return { campaign: (await getCampaign(args[0], campaign.id)) || campaign, publicationError };
}
