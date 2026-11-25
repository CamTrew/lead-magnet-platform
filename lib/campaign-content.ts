import { CAMPAIGN_ARTWORK_OFFER } from './campaign-artwork-guidance';

/** Ignore retired generated posts without rewriting existing campaign records. */
export function withoutLegacyLaunchPost<T extends object>(content: T): Omit<T, 'linkedinPost'> {
  const current = { ...content };
  Reflect.deleteProperty(current, 'linkedinPost');
  return current;
}

export const CAMPAIGN_SHARE_MESSAGE = "When you're ready, create an amazing post, include this URL, and start capturing emails.";
export const CAMPAIGN_EDIT_OFFER = "Your lead magnet is live. We can improve it together whenever you like.";
export const CAMPAIGN_IMAGE_OFFER = 'Would you like me to create an image or branded graphic for it?';
export const SIGNUP_FIELD_OFFER = 'Your form collects name and email. What else would you like to ask for, if anything?';

export function campaignNextStep(magnet: { signupFields?: unknown[]; imageUrl: string }) {
  return [
    CAMPAIGN_EDIT_OFFER,
    !magnet.signupFields?.length && SIGNUP_FIELD_OFFER,
    !magnet.imageUrl && CAMPAIGN_IMAGE_OFFER,
    CAMPAIGN_SHARE_MESSAGE,
  ].filter(Boolean).join(' ');
}
export const CAMPAIGN_COMPLETION_GUIDANCE = `When publication succeeds, return the exact publicUrl as a clickable link, say "${CAMPAIGN_EDIT_OFFER}" and add "${CAMPAIGN_SHARE_MESSAGE}" After the first successful publication, if extra fields have not already been specified or declined, ask once: "${SIGNUP_FIELD_OFFER}" If useful, give one example such as a business website. Treat the field question and artwork as independent offers. Accept an answer to either, both or neither. Add fields only when requested. Skip answered offers on retries and subsequent edits. If the page has no artwork and the user has not declined artwork, offer it now: ${CAMPAIGN_ARTWORK_OFFER} Artwork is optional and comes after publication, never a prerequisite. If they decline, keep the image-free page and do not ask again. Keep this handoff short. The page is already published: do not ask whether they are ready to publish, introduce a review gate, or unpublish it for review. If they want improvements, continue in this chat: ask what they want changed if unclear, then read get_campaign and use update_campaign with the current editVersion. Explain that changes affect the live page and set confirmLiveEdit:true only for changes the user authorizes. Never use save_campaign to create a duplicate for an edit. Do not generate, suggest, offer or return a launch post, LinkedIn post or other promotional post copy. Do not add a package summary, extra links or unrelated questions to this completion. Editor and audience links remain available when the user asks for them. If publication fails or publicUrl is absent, explain the problem and give the saved reviewUrl instead; never claim a draft is live or use the live-page edit offer.`;
