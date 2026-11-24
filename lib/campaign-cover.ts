import { invalidatePublishedLeadMagnetCache } from './public-lead-magnet-cache';
import sharp from 'sharp';
import { assistantOrigin } from './assistant-auth';
import { saveCampaignCover } from './platform-store';

export async function attachCampaignCover(accountId: string, campaignId: string, imageBase64: string, brandVersion?: string, confirmLiveEdit = false) {
  if (imageBase64.length > 1400000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) throw new Error('Use base64 PNG, JPEG or WebP image bytes.');
  const bytes = Buffer.from(imageBase64, 'base64');
  if (bytes.length > 1024 * 1024) throw new Error('Image must be under 1 MB.');
  const info = await sharp(bytes, { limitInputPixels: 16000000 }).metadata();
  if (!['png', 'jpeg', 'webp'].includes(info.format || '')) throw new Error('Use PNG, JPEG or WebP.');
  const png = await sharp(bytes, { limitInputPixels: 16000000 })
    .rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  if (png.length > 2 * 1024 * 1024) throw new Error('Use a smaller cover image.');
  if (!await saveCampaignCover(accountId, campaignId, png.toString('base64'), assistantOrigin(), brandVersion, confirmLiveEdit)) throw new Error('Campaign not found.');
  invalidatePublishedLeadMagnetCache();
  return { attached: true };
}
