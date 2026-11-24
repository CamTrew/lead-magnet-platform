import type { CampaignPackage } from './campaign-schema';

// Shared by the saved delivery email and its studio preview.
export function campaignDeliveryBody(content: CampaignPackage, resourceUrl: string) {
  return content.delivery.body.includes('{resource_url}')
    ? content.delivery.body.replaceAll('{resource_url}', resourceUrl)
    : `${content.delivery.body}\n\nDownload: ${resourceUrl}`;
}
