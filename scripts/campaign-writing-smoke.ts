import { chatgptCreateUrl, claudeCreateUrl, SAVED_LEAD_MAGNET_PROMPT } from '../lib/assistant-provider';
import { withoutLegacyLaunchPost, CAMPAIGN_COMPLETION_GUIDANCE, CAMPAIGN_SHARE_MESSAGE, CAMPAIGN_EDIT_OFFER, campaignNextStep, SIGNUP_FIELD_OFFER, CAMPAIGN_IMAGE_OFFER } from '../lib/campaign-content';
import assert from 'node:assert/strict';
import { exampleCampaign } from '../lib/campaign-example';
import { CAMPAIGN_WRITING_INSTRUCTIONS, campaignPackageSchema, campaignChangesSchema, validateCampaignPackage } from '../lib/campaign-schema';
import { CAMPAIGN_ARTWORK_GUIDANCE } from '../lib/campaign-artwork-guidance';
import { humanVoiceViolations } from '../lib/ai-writing-guardrails';
import { campaignImageBrief } from '../lib/campaign-image-brand';

async function main() {
  validateCampaignPackage(exampleCampaign);
  const legacy = { ...exampleCampaign, linkedinPost: 'Old generated post — should never be returned.' };
  assert.deepEqual(validateCampaignPackage(legacy), exampleCampaign, 'Old imports remain usable without post copy');
  assert.deepEqual(withoutLegacyLaunchPost(legacy), exampleCampaign, 'Read boundaries hide old post copy');
  assert.ok(legacy.linkedinPost, 'Read normalization must not mutate stored input');
  assert.equal('linkedinPost' in campaignPackageSchema.shape, false, 'MCP creation schema must not request posts');
  assert.equal(campaignPackageSchema.safeParse(legacy).success, false, 'New tool calls cannot submit post copy');
  assert.equal(campaignChangesSchema.safeParse({ linkedinPost: 'New post' }).success, false, 'MCP edits cannot add posts');
  assert.ok(CAMPAIGN_WRITING_INSTRUCTIONS.includes(CAMPAIGN_COMPLETION_GUIDANCE));
  assert.ok(CAMPAIGN_COMPLETION_GUIDANCE.includes(CAMPAIGN_SHARE_MESSAGE));
  assert.ok(CAMPAIGN_COMPLETION_GUIDANCE.includes(CAMPAIGN_EDIT_OFFER));
  assert.match(CAMPAIGN_COMPLETION_GUIDANCE, /do not ask whether they are ready to publish/);
  assert.match(CAMPAIGN_COMPLETION_GUIDANCE, /get_campaign and use update_campaign/);
  const handoff = campaignNextStep({ imageUrl: '' });
  assert.ok(handoff.includes(CAMPAIGN_IMAGE_OFFER));
  assert.ok(handoff.includes(SIGNUP_FIELD_OFFER));
  assert.ok(CAMPAIGN_COMPLETION_GUIDANCE.includes(SIGNUP_FIELD_OFFER));
  const configured = campaignNextStep({ signupFields: [{}], imageUrl: 'https://example.org/cover.png' });
  assert.ok(!configured.includes(SIGNUP_FIELD_OFFER) && !configured.includes(CAMPAIGN_IMAGE_OFFER));
  assert.equal(new URL(chatgptCreateUrl()).searchParams.get('prompt'), SAVED_LEAD_MAGNET_PROMPT);
  assert.equal(new URL(claudeCreateUrl()).searchParams.get('q'), SAVED_LEAD_MAGNET_PROMPT);
  assert.equal(new URL(chatgptCreateUrl(false)).searchParams.get('prompt'), 'Help me create a lead magnet with Magnets.');
  assert.match(CAMPAIGN_COMPLETION_GUIDANCE, /In Claude, ask:/);
  assert.match(CAMPAIGN_COMPLETION_GUIDANCE, /In ChatGPT with image generation available, ask:/);
  assert.match(CAMPAIGN_COMPLETION_GUIDANCE, /after publication, never a prerequisite/);
  assert.match(CAMPAIGN_COMPLETION_GUIDANCE, /do not ask again/);
  assert.doesNotMatch(CAMPAIGN_WRITING_INSTRUCTIONS, /Do not[^.]*artwork offers|do not[^.]*append an artwork question/);

  let tested = 0;
  function visit(value: unknown, path: (string | number)[] = []) {
    if (typeof value === 'string' && path[0] !== 'format') {
      for (const dash of ['\u2014', '&mdash;', '&#8212;', '&#x2014;', '\uFE58', '\u2E3A', '\u2E3B']) {
        const copy = structuredClone(exampleCampaign);
        let parent: unknown = copy;
        for (const key of path.slice(0, -1)) parent = (parent as Record<string | number, unknown>)[key];
        (parent as Record<string | number, unknown>)[path.at(-1)!] = `Useful ${dash} practical`;
        assert.throws(() => validateCampaignPackage(copy), /disallowed dash punctuation/, `Must reject ${path.join('.')} with ${dash}`);
        tested++;
      }
    } else if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, [...path, index]));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, entry]) => visit(entry, [...path, key]));
  }
  visit(exampleCampaign);
  assert.ok(humanVoiceViolations({page:{bullets:['Useful — practical']}}).some(value => value.includes('page.bullets.0')));
  assert.ok(humanVoiceViolations({followUps:[{body:'Useful &#x2014; practical'}]}).length);
  assert.equal(humanVoiceViolations({url:'https://example.com/an—existing--path',text:'A well-made checklist.'}).length, 0, 'Preserve URLs and ordinary word hyphens');
  const brief = await campaignImageBrief(exampleCampaign, null);
  assert.match(brief.imageGeneration.prompt, /text drawn inside images/);
  assert.match(brief.imageGeneration.nextStep, /visually inspect/i);
  assert.ok(CAMPAIGN_WRITING_INSTRUCTIONS.includes(CAMPAIGN_ARTWORK_GUIDANCE), 'Server instructions must include the graphic export path');
  assert.equal(brief.imageGeneration.nextStep, CAMPAIGN_ARTWORK_GUIDANCE, 'Fresh brand briefs must retain the same graphic and attachment guidance');
  assert.match(brief.imageGeneration.nextStep, /In Claude, prefer writing a compact SVG graphic/);
  assert.match(brief.imageGeneration.nextStep, /real PNG/);
  assert.match(brief.imageGeneration.nextStep, /not SVG\/HTML source/);
  assert.match(brief.imageGeneration.nextStep, /without attaching; wait for approval/);
  assert.match(brief.imageGeneration.nextStep, /wait for attached:true/);
  console.log(`PASS: ${tested} field/encoding rejection cases, nested copy edits, URL preservation and image inspection guidance.`);
}
main().catch(error => {console.error(error);process.exitCode=1;});
