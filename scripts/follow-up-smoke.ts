import assert from 'node:assert/strict';
import {
  extractCalendarInviteeEmail,
  isCalendarBookingEvent,
} from '../lib/calendar-webhook-payload';
import {
  FollowUpSequenceError,
  startLeadMagnetFollowUpSequence,
  stopAccountFollowUpSequencesForEmail,
  stopLeadMagnetFollowUpSequence,
  syncLeadMagnetFollowUpAutomation,
} from '../lib/follow-up-sequences';
import {
  appendEmailImage,
  parseEmailBodySegments,
  removeEmailBodySegment,
  replaceEmailBodySegment,
} from '../lib/email-body-images';
import {
  insertEmailLink,
  normaliseEmailLinkUrl,
  renderEmailEditorHtml,
} from '../lib/email-body-links';
import {
  proxyEmailImagesInBody,
  publicEmailImageUrl,
  verifyEmailImageToken,
} from '../lib/email-image-proxy';
import { verifyFollowUpStopToken } from '../lib/follow-up-opt-out';
import {
  renderEmailTextFallback,
  renderPlainEmailHtml,
  sendLeadMagnetEmail,
} from '../lib/resend';
import { isEmailDeliveryReady, isPublishingDomainReady, isSetupComplete } from '../lib/setup';
import {
  resolveResendApiKey,
  resolveResendFromEmail,
  usesPlatformResendAccount,
} from '../lib/platform-resend';
import { senderMatchesAccountDomain } from '../lib/dns-records';
import { testPipedriveConnection, upsertPipedrivePerson } from '../lib/pipedrive';
import {
  isValidPlatformUsername,
  normalisePlatformUsername,
  platformUsernameStem,
} from '../lib/platform-username';
import { isValidSlackWebhookUrl, sendSlackSignupNotification } from '../lib/slack';
import type { AccountSettings, LeadMagnet } from '../lib/types';

type JsonRecord = Record<string, unknown>;

type CapturedRequest = {
  authorization: string;
  method: string;
  pathname: string;
  body: JsonRecord | null;
};

const requests: CapturedRequest[] = [];
let templateCount = 0;
let automationCount = 0;
let forbiddenPath = '';
const originalFetch = globalThis.fetch;

function jsonResponse(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function parseJsonBody(body: BodyInit | null | undefined) {
  if (!body) return null;
  if (typeof body !== 'string') {
    throw new Error('Smoke test expected Resend requests to use JSON string bodies.');
  }
  return JSON.parse(body) as JsonRecord;
}

function findRequest(pathname: string, method: string) {
  return requests.find((request) => request.pathname === pathname && request.method === method);
}

function findBody(pathname: string, method: string) {
  const request = findRequest(pathname, method);
  assert.ok(request, `Expected ${method} ${pathname} to be called.`);
  assert.ok(request.body, `Expected ${method} ${pathname} to include a JSON body.`);
  return request.body;
}

function expectRecordArray(value: unknown, label: string) {
  assert.ok(Array.isArray(value), `${label} should be an array.`);
  return value as JsonRecord[];
}

function resetRequests() {
  requests.length = 0;
}

function eventSendBodies() {
  return requests
    .filter((request) => request.pathname === '/events/send' && request.method === 'POST')
    .map((request) => request.body);
}

function automationPatchBodies(automationId: string) {
  return requests
    .filter((request) => request.pathname === `/automations/${automationId}` && request.method === 'PATCH')
    .map((request) => request.body);
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(requestUrl(input));
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const body = parseJsonBody(init?.body);
  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));

  requests.push({
    authorization: headers.get('authorization') || '',
    method,
    pathname: url.pathname,
    body,
  });

  if (url.origin !== 'https://api.resend.com') {
    return jsonResponse({ message: `Unexpected origin ${url.origin}` }, 500);
  }

  if (forbiddenPath && url.pathname === forbiddenPath) {
    return jsonResponse({ message: 'API key does not have permission to access this resource.' }, 403);
  }

  if (method === 'POST' && url.pathname === '/events') {
    return jsonResponse({ id: `event_${requests.length}` });
  }

  if (method === 'POST' && url.pathname === '/templates') {
    templateCount += 1;
    return jsonResponse({ id: `tmpl_${templateCount}` });
  }

  if (method === 'PATCH' && /^\/templates\/[^/]+$/.test(url.pathname)) {
    return jsonResponse({ id: decodeURIComponent(url.pathname.split('/')[2] || '') });
  }

  if (method === 'POST' && /^\/templates\/[^/]+\/publish$/.test(url.pathname)) {
    return jsonResponse({ id: decodeURIComponent(url.pathname.split('/')[2] || '') });
  }

  if (method === 'POST' && url.pathname === '/automations') {
    automationCount += 1;
    return jsonResponse({ id: `auto_${automationCount}` });
  }

  if (method === 'PATCH' && /^\/automations\/[^/]+$/.test(url.pathname)) {
    return jsonResponse({ id: decodeURIComponent(url.pathname.split('/')[2] || '') });
  }

  if (method === 'POST' && url.pathname === '/events/send') {
    return jsonResponse({ id: `event_send_${requests.length}` });
  }

  if (method === 'POST' && url.pathname === '/emails') {
    return jsonResponse({ id: `email_${requests.length}` });
  }

  return jsonResponse({ message: `Unexpected Resend request: ${method} ${url.pathname}` }, 500);
}) as typeof fetch;

const now = new Date('2026-07-08T10:00:00.000Z').toISOString();

const account: AccountSettings = {
  id: 'account_smoke',
  ownerUserId: 'user_smoke',
  username: 'smoke-test',
  subdomain: 'get',
  domain: 'example.com',
  logoUrl: '',
  logoText: 'Smoke Test',
  brand: {
    primary: '#2b0fff',
    accent: '#f8f5ff',
    success: '#22c55e',
    highlightIntensity: 100,
    pageTheme: 'light',
    privacyPolicyUrl: '',
    termsUrl: '',
  },
  resendFromEmail: 'Smoke Test <hello@send.example.com>',
  resendApiKey: 're_smoke_test',
  resendConfigured: true,
  resendManagedByPlatform: false,
  beehiivApiKey: '',
  beehiivPublicationId: '',
  substackPublication: '',
  slackWebhookUrl: '',
  pipedriveApiToken: '',
  resendReturnPath: 'send',
  calendarWebhookEnabled: true,
  calendarWebhookToken: 'calendar_smoke_token',
  calendarProvider: 'calendly',
  calendarApiKey: '',
  calendarWebhookSecret: '',
  calendarWebhookId: '',
  calendarConnectedAt: now,
  domainVerificationToken: 'verify_smoke',
  domainVerifiedAt: now,
  domainAttachedHost: 'get.example.com',
  domainRecommendedCname: 'cname.vercel-dns.com',
  onboardingCompletedAt: now,
  onboarding: {
    businessName: 'Smoke Test',
    businessType: 'SaaS product',
    magnetType: 'Checklist',
    cadence: 'Weekly',
  },
  createdAt: now,
  updatedAt: now,
};

const magnet: LeadMagnet = {
  id: 'magnet_smoke',
  accountId: account.id,
  slug: 'smoke-test',
  title: 'Smoke Test Magnet',
  subtitle: 'Prove follow-ups without real APIs.',
  description: 'A local-only test magnet.',
  bullets: ['First result', 'Second result'],
  bulletsHeading: 'You will learn:',
  ctaText: 'Get the guide',
  formHeading: 'Download now',
  formSubtext: 'Get instant access.',
  imageUrl: '',
  downloadLink: 'https://example.com/download.pdf',
  emailSubject: 'Here is your guide',
  emailBody: 'Download it here: {download_link}',
  emailPreview: 'Your guide is ready.',
  followUpEnabled: true,
  followUpStopOnBooking: true,
  followUpEmails: [
    {
      id: 'email_1',
      delayMinutes: 0,
      delayHours: 0,
      subject: 'First follow-up for {name}',
      preview: 'First preview',
      body: 'Hi {name}, [book a call](https://example.com/book) or use the link below.\n\n![Audit preview](https://cdn.example.com/audit-preview.png)\n\n{download_link}',
      resendTemplateId: '',
    },
    {
      id: 'email_2',
      delayMinutes: 5,
      delayHours: 0,
      subject: 'Second follow-up',
      preview: 'Second preview',
      body: 'Still interested? Grab the resource here: {download_link}',
      resendTemplateId: '',
    },
  ],
  resendFollowUpAutomationId: '',
  resendFollowUpRenderVersion: 0,
  postSignupMode: 'message',
  postSignupRedirectUrl: '',
  postSignupHeading: '',
  postSignupBody: '',
  postSignupVideoUrl: '',
  postSignupCtaLabel: '',
  postSignupCtaUrl: '',
  postSignupQuizEnabled: false,
  postSignupQuizTitle: '',
  postSignupQuizDescription: '',
  postSignupQuizQuestions: [],
  postSignupQuizRoutes: [],
  published: true,
  createdAt: now,
  updatedAt: now,
};

async function run() {
  assert.equal(normalisePlatformUsername('  My-Brand  '), 'my-brand');
  assert.equal(platformUsernameStem('My Brand & Co.'), 'my-brand-co');
  assert.equal(platformUsernameStem(''), 'magnet');
  assert.equal(isValidPlatformUsername('my-brand'), true);
  assert.equal(isValidPlatformUsername('my_brand'), false);
  assert.equal(isValidPlatformUsername('dashboard'), false);

  const platformHostedAccount: AccountSettings = {
    ...account,
    username: 'my-brand',
    domainAttachedHost: '',
  };
  assert.equal(isSetupComplete(platformHostedAccount), true);
  assert.equal(isPublishingDomainReady(platformHostedAccount), false);
  assert.equal(isEmailDeliveryReady(platformHostedAccount), true);

  const customDomainAccount: AccountSettings = {
    ...account,
    username: '',
  };
  assert.equal(isSetupComplete(customDomainAccount), true);
  assert.equal(isPublishingDomainReady(customDomainAccount), true);

  const incompleteAccount: AccountSettings = {
    ...platformHostedAccount,
    username: '',
  };
  assert.equal(isSetupComplete(incompleteAccount), false);
  assert.equal(
    isEmailDeliveryReady({ ...platformHostedAccount, domainVerifiedAt: null }),
    false
  );

  const originalPlatformKey = process.env.MAGNETS_RESEND_API_KEY;
  process.env.MAGNETS_RESEND_API_KEY = 're_platform_smoke';
  const platformManagedAccount = {
    ...platformHostedAccount,
    resendApiKey: '',
    resendConfigured: true,
    resendManagedByPlatform: true,
    resendFromEmail: '',
    resendReturnPath: '',
    domainVerifiedAt: null,
  };
  assert.equal(resolveResendApiKey(platformManagedAccount), 're_platform_smoke');
  assert.equal(usesPlatformResendAccount(platformManagedAccount), true);
  assert.equal(resolveResendFromEmail(platformManagedAccount), 'Magnets <hello@mail.magnets.so>');
  assert.equal(isEmailDeliveryReady(platformManagedAccount), true);

  resetRequests();
  const platformEmail = await sendLeadMagnetEmail({
    account: platformManagedAccount,
    magnet,
    to: 'new-user@example.com',
    name: 'New User',
  });
  assert.deepEqual(platformEmail, { messageId: 'email_1' });
  const platformEmailRequest = findRequest('/emails', 'POST');
  assert.equal(platformEmailRequest?.authorization, 'Bearer re_platform_smoke');
  assert.equal(platformEmailRequest?.body?.from, 'Magnets <hello@mail.magnets.so>');
  assert.equal(platformEmailRequest?.body?.to, 'new-user@example.com');

  const accountKeyWithoutVerifiedSender = {
    ...platformManagedAccount,
    resendApiKey: 're_customer_key',
  };
  assert.equal(
    resolveResendApiKey(accountKeyWithoutVerifiedSender),
    're_platform_smoke',
    'An unverified customer sender must use the platform key with the platform sender.'
  );
  assert.equal(
    usesPlatformResendAccount(accountKeyWithoutVerifiedSender),
    true,
    'An unverified customer key still falls back to the protected platform workspace.'
  );
  assert.equal(resolveResendApiKey(account), 're_smoke_test');
  assert.equal(usesPlatformResendAccount(account), false);

  const unreadableCustomerKeyAccount = {
    ...account,
    resendApiKey: '',
  };
  assert.equal(resolveResendApiKey(unreadableCustomerKeyAccount), 're_platform_smoke');
  assert.equal(resolveResendFromEmail(unreadableCustomerKeyAccount), 'Magnets <hello@mail.magnets.so>');
  assert.equal(usesPlatformResendAccount(unreadableCustomerKeyAccount), true);

  resetRequests();
  const ownedEmail = await sendLeadMagnetEmail({
    account,
    magnet: {
      ...magnet,
      emailBody: 'Hi {name}, read [the guide](https://example.com/guide).\n\n![Guide preview](https://cdn.example.com/guide-preview.png)\n\nOr use {download_link}.',
    },
    to: 'existing-user@example.com',
    name: 'Existing User',
  });
  assert.deepEqual(ownedEmail, { messageId: 'email_1' });
  const ownedEmailRequest = findRequest('/emails', 'POST');
  assert.equal(ownedEmailRequest?.authorization, 'Bearer re_smoke_test');
  assert.equal(ownedEmailRequest?.body?.from, account.resendFromEmail);
  assert.match(String(ownedEmailRequest?.body?.html), /href="https:\/\/example\.com\/guide"[^>]*>the guide<\/a>/);
  assert.match(String(ownedEmailRequest?.body?.html), /<img src="https:\/\/cdn\.example\.com\/guide-preview\.png"/);
  assert.match(String(ownedEmailRequest?.body?.text), /the guide \(https:\/\/example\.com\/guide\)/);
  assert.match(String(ownedEmailRequest?.body?.text), /Guide preview: https:\/\/cdn\.example\.com\/guide-preview\.png/);

  const legacySenderAccount = {
    ...account,
    resendFromEmail: 'Existing sender <hello@example.com>',
    resendReturnPath: '',
  };
  assert.equal(
    senderMatchesAccountDomain(legacySenderAccount),
    true,
    'Existing root-domain senders remain valid when an account predates return paths.'
  );
  assert.equal(resolveResendApiKey(legacySenderAccount), 're_smoke_test');
  assert.equal(resolveResendFromEmail(legacySenderAccount), 'Existing sender <hello@example.com>');

  const legacySubdomainSenderAccount = {
    ...legacySenderAccount,
    resendFromEmail: 'Existing sender <hello@mail.example.com>',
  };
  assert.equal(senderMatchesAccountDomain(legacySubdomainSenderAccount), true);

  assert.equal(
    senderMatchesAccountDomain({
      ...account,
      resendFromEmail: 'Wrong sender <hello@other-example.com>',
      resendReturnPath: '',
    }),
    false,
    'Legacy compatibility must not allow a sender outside the owned domain.'
  );

  assert.equal(
    senderMatchesAccountDomain({
      ...account,
      resendFromEmail: 'Wrong return path <hello@example.com>',
      resendReturnPath: 'send',
    }),
    false,
    'New return-path settings remain exact.'
  );

  if (originalPlatformKey === undefined) {
    delete process.env.MAGNETS_RESEND_API_KEY;
  } else {
    process.env.MAGNETS_RESEND_API_KEY = originalPlatformKey;
  }

  const calBookingRequestedPayload = {
    triggerEvent: 'BOOKING_REQUESTED',
    payload: {
      attendees: [{ email: 'Lead@Example.com' }],
    },
  };
  assert.equal(isCalendarBookingEvent(calBookingRequestedPayload), true);
  assert.equal(extractCalendarInviteeEmail(calBookingRequestedPayload), 'lead@example.com');
  assert.equal(
    isCalendarBookingEvent({
      triggerEvent: 'FORM_SUBMITTED',
      payload: { responses: { email: { value: 'lead@example.com' } } },
    }),
    false
  );

  const synced = await syncLeadMagnetFollowUpAutomation(account, magnet);

  assert.equal(synced.automationId, 'auto_1');
  assert.deepEqual(
    synced.emails.map((email) => email.resendTemplateId),
    ['tmpl_1', 'tmpl_2']
  );

  const eventBodies = requests
    .filter((request) => request.pathname === '/events' && request.method === 'POST')
    .map((request) => request.body);

  assert.deepEqual(eventBodies, [
    { name: 'magnets.lead_magnet.magnet_smoke.signup' },
    { name: 'magnets.lead_magnet.magnet_smoke.booked' },
  ]);

  const templateBody = findBody('/templates', 'POST');
  assert.equal(templateBody.from, account.resendFromEmail);
  assert.equal(templateBody.subject, 'First follow-up for {name}');
  assert.equal(typeof templateBody.html, 'string');
  assert.match(String(templateBody.html), /\{\{\{NAME\}\}\}/);
  assert.match(String(templateBody.html), /<img src="https:\/\/cdn\.example\.com\/audit-preview\.png"/);
  assert.match(String(templateBody.html), /href="https:\/\/example\.com\/book"[^>]*>book a call<\/a>/);
  assert.match(String(templateBody.html), /alt="Audit preview"/);
  assert.match(String(templateBody.html), /Stop this sequence/);
  assert.match(String(templateBody.html), /\{\{\{STOP_SEQUENCE_URL\}\}\}/);
  assert.match(String(templateBody.text), /\{\{\{DOWNLOAD_LINK\}\}\}/);
  assert.match(String(templateBody.text), /Audit preview: https:\/\/cdn\.example\.com\/audit-preview\.png/);
  assert.match(String(templateBody.text), /\{\{\{STOP_SEQUENCE_URL\}\}\}/);

  const normalEmailBody = 'Here is the screenshot:\n\n![Screenshot](https://cdn.example.com/screenshot.jpg)\n\nDone.';
  assert.match(renderPlainEmailHtml(normalEmailBody, 'Preview'), /<img src="https:\/\/cdn\.example\.com\/screenshot\.jpg"/);
  assert.match(renderEmailTextFallback(normalEmailBody), /Screenshot: https:\/\/cdn\.example\.com\/screenshot\.jpg/);

  const linkedEmailBody = 'Read [the guide](https://example.com/guide) or visit https://example.com/help.';
  const linkedEmailHtml = renderPlainEmailHtml(linkedEmailBody, 'Preview');
  const linkedEditorHtml = renderEmailEditorHtml(linkedEmailBody);
  assert.match(linkedEmailHtml, /href="https:\/\/example\.com\/guide"[^>]*>the guide<\/a>/);
  assert.match(linkedEmailHtml, /href="https:\/\/example\.com\/help"[^>]*>https:\/\/example\.com\/help<\/a>\./);
  assert.match(linkedEditorHtml, /href="https:\/\/example\.com\/guide"[^>]*>the guide<\/a>/);
  assert.doesNotMatch(linkedEditorHtml, /\[the guide\]/);
  assert.equal(
    renderEmailTextFallback(linkedEmailBody),
    'Read the guide (https://example.com/guide) or visit https://example.com/help.'
  );
  assert.equal(normaliseEmailLinkUrl('example.com/guide'), 'https://example.com/guide');
  assert.equal(normaliseEmailLinkUrl('javascript:alert(1)'), null);
  assert.deepEqual(insertEmailLink('Read the guide', 5, 14, 'the guide', 'example.com/guide'), {
    cursor: 43,
    text: 'Read [the guide](https://example.com/guide)',
  });
  assert.doesNotMatch(
    renderPlainEmailHtml('[unsafe](javascript:alert(1))', ''),
    /href="javascript:/
  );

  const originalBody = 'First paragraph.\n\nSecond paragraph that must stay.';
  const bodyWithFirstImage = appendEmailImage(originalBody, 'https://cdn.example.com/first.png');
  const bodyWithTwoImages = appendEmailImage(bodyWithFirstImage, 'https://cdn.example.com/second.png');
  assert.ok(bodyWithTwoImages.startsWith(originalBody));
  assert.equal(parseEmailBodySegments(bodyWithTwoImages).filter((segment) => segment.kind === 'image').length, 2);

  const bodyAroundImage = 'Text before.\n\n![Preview](https://cdn.example.com/preview.png)\n\nText after.';
  const editedBody = replaceEmailBodySegment(bodyAroundImage, 2, '\n\nUpdated text after.');
  assert.match(editedBody, /^Text before\./);
  assert.match(editedBody, /!\[Preview\]\(https:\/\/cdn\.example\.com\/preview\.png\)/);
  assert.match(editedBody, /Updated text after\.$/);
  assert.equal(removeEmailBodySegment(editedBody, 1), 'Text before.\n\nUpdated text after.');
  assert.equal(
    replaceEmailBodySegment('Hello', 0, 'Hello world with spaces '),
    'Hello world with spaces '
  );
  assert.equal(
    replaceEmailBodySegment(bodyAroundImage, 2, '\n\nText after with spaces '),
    'Text before.\n\n![Preview](https://cdn.example.com/preview.png)\n\nText after with spaces '
  );

  const privateImageUrl = `https://store.private.blob.vercel-storage.com/lead-magnets/${account.id}/${magnet.id}/email-images/promo.png`;
  const proxiedImageUrl = publicEmailImageUrl(privateImageUrl, 'https://magnets.so');
  assert.match(proxiedImageUrl, /^https:\/\/magnets\.so\/email-images\//);
  const proxyToken = new URL(proxiedImageUrl).pathname.split('/').pop() || '';
  assert.equal(verifyEmailImageToken(proxyToken), privateImageUrl);
  assert.equal(
    proxyEmailImagesInBody({
      accountId: account.id,
      baseUrl: 'https://magnets.so',
      body: `Before.\n\n![Promo](${privateImageUrl})\n\nAfter.`,
      leadMagnetId: magnet.id,
    }),
    `Before.\n\n![Promo](${proxiedImageUrl})\n\nAfter.`
  );

  assert.ok(findRequest('/templates/tmpl_1/publish', 'POST'));
  assert.ok(findRequest('/templates/tmpl_2/publish', 'POST'));

  const automationBody = findBody('/automations', 'POST');
  assert.equal(automationBody.status, 'disabled');
  assert.equal(automationBody.name, 'Magnets follow-up: Smoke Test Magnet');
  assert.deepEqual(findBody('/automations/auto_1', 'PATCH'), { status: 'enabled' });

  const steps = expectRecordArray(automationBody.steps, 'automation steps');
  const connections = expectRecordArray(automationBody.connections, 'automation connections');

  assert.equal(steps.filter((step) => step.type === 'send_email').length, 2);
  assert.ok(
    steps.some(
      (step) =>
        step.key === 'wait_2' &&
        step.type === 'wait_for_event' &&
        (step.config as JsonRecord | undefined)?.event_name === 'magnets.lead_magnet.magnet_smoke.booked' &&
        (step.config as JsonRecord | undefined)?.timeout === '5 minutes'
    )
  );
  assert.ok(
    connections.some(
      (connection) =>
        connection.from === 'wait_2' &&
        connection.to === 'email_2' &&
        connection.type === 'timeout'
    )
  );
  assert.ok(
    !connections.some((connection) => connection.type === 'event_received'),
    'booking events intentionally have no connection to the next email.'
  );
  const sendEmailStep = steps.find((step) => step.type === 'send_email');
  const templateVariables = (((sendEmailStep?.config as JsonRecord | undefined)?.template as JsonRecord | undefined)
    ?.variables || {}) as JsonRecord;
  assert.deepEqual(templateVariables.STOP_SEQUENCE_URL, { var: 'event.stopSequenceUrl' });

  resetRequests();
  const started = await startLeadMagnetFollowUpSequence({
    account,
    magnet: {
      ...magnet,
      followUpEmails: synced.emails,
      resendFollowUpAutomationId: synced.automationId,
      resendFollowUpRenderVersion: synced.renderVersion,
    },
    email: 'Lead@Example.com',
    name: 'Lead',
    store: {
      createFollowUpRun: async (input) => {
        assert.equal(input.accountId, account.id);
        assert.equal(input.leadMagnetId, magnet.id);
        assert.equal(input.email, 'Lead@Example.com');
        return { created: true, runId: 'run_start' };
      },
      markFollowUpRunFailed: async () => undefined,
      hasActiveFollowUpRunForEmail: async () => false,
      stopFollowUpRunForEmail: async () => ({ stopped: false, runId: null }),
      listActiveStopOnBookingFollowUpRunsForEmail: async () => [],
      stopFollowUpRunsForAccountEmail: async () => ({
        stopped: false,
        stoppedCount: 0,
        leadMagnetIds: [],
      }),
      updateLeadMagnetFollowUpSync: async (accountId, leadMagnetId, updates) => {
        assert.equal(accountId, account.id);
        assert.equal(leadMagnetId, magnet.id);
        return {
          ...magnet,
          followUpEmails: updates.followUpEmails,
          resendFollowUpAutomationId: updates.resendFollowUpAutomationId,
        };
      },
    },
  });

  assert.deepEqual(started, { started: true, reason: null });
  const startAutomationPatches = automationPatchBodies('auto_1');
  assert.equal(startAutomationPatches.length, 0);
  const startEvents = eventSendBodies();
  const startPayload = (startEvents[0]?.payload || {}) as JsonRecord;
  assert.equal(typeof startPayload.stopSequenceUrl, 'string');
  assert.deepEqual(startEvents, [
    {
      event: 'magnets.lead_magnet.magnet_smoke.signup',
      email: 'lead@example.com',
      payload: {
        name: 'Lead',
        downloadLink: magnet.downloadLink,
        leadMagnetId: magnet.id,
        leadMagnetTitle: magnet.title,
        stopSequenceUrl: startPayload.stopSequenceUrl,
      },
    },
  ]);
  const stopUrl = String(startPayload.stopSequenceUrl || '');
  assert.match(stopUrl, /^https:\/\/get\.example\.com\/sequence\/stop\?token=/);
  const stopToken = new URL(stopUrl).searchParams.get('token') || '';
  assert.deepEqual(verifyFollowUpStopToken(stopToken), {
    accountId: account.id,
    leadMagnetId: magnet.id,
    email: 'lead@example.com',
  });

  resetRequests();
  let savedRenderVersion = -1;
  const staleRenderResult = await startLeadMagnetFollowUpSequence({
    account,
    magnet: {
      ...magnet,
      followUpEmails: synced.emails,
      resendFollowUpAutomationId: synced.automationId,
      resendFollowUpRenderVersion: 0,
    },
    email: 'existing-template@example.com',
    name: 'Existing Template',
    store: {
      createFollowUpRun: async () => ({ created: false, runId: null }),
      markFollowUpRunFailed: async () => undefined,
      hasActiveFollowUpRunForEmail: async () => false,
      stopFollowUpRunForEmail: async () => ({ stopped: false, runId: null }),
      listActiveStopOnBookingFollowUpRunsForEmail: async () => [],
      stopFollowUpRunsForAccountEmail: async () => ({
        stopped: false,
        stoppedCount: 0,
        leadMagnetIds: [],
      }),
      updateLeadMagnetFollowUpSync: async (_accountId, _leadMagnetId, updates) => {
        savedRenderVersion = updates.resendFollowUpRenderVersion;
        return {
          ...magnet,
          followUpEmails: updates.followUpEmails,
          resendFollowUpAutomationId: updates.resendFollowUpAutomationId,
          resendFollowUpRenderVersion: updates.resendFollowUpRenderVersion,
        };
      },
    },
  });
  assert.deepEqual(staleRenderResult, { started: false, reason: 'duplicate' });
  assert.equal(savedRenderVersion, synced.renderVersion);
  assert.ok(findRequest('/templates/tmpl_1', 'PATCH'));
  assert.ok(findRequest('/templates/tmpl_2', 'PATCH'));
  assert.ok(findRequest('/automations/auto_1', 'PATCH'));
  assert.deepEqual(eventSendBodies(), []);

  resetRequests();
  await syncLeadMagnetFollowUpAutomation(account, {
    ...magnet,
    followUpEnabled: false,
    resendFollowUpAutomationId: 'auto_existing',
  });

  const disabledBody = findBody('/automations/auto_existing', 'PATCH');
  assert.deepEqual(disabledBody, { status: 'disabled' });

  resetRequests();
  const manualStopCalls: JsonRecord[] = [];
  const manualStopped = await stopLeadMagnetFollowUpSequence({
    account,
    leadMagnetId: magnet.id,
    email: 'Lead@Example.com',
    reason: 'manual',
    store: {
      createFollowUpRun: async () => ({ created: false, runId: null }),
      markFollowUpRunFailed: async () => undefined,
      hasActiveFollowUpRunForEmail: async (input) => {
        assert.deepEqual(input, {
          accountId: account.id,
          leadMagnetId: magnet.id,
          email: 'Lead@Example.com',
        });
        return true;
      },
      stopFollowUpRunForEmail: async (input) => {
        manualStopCalls.push(input as unknown as JsonRecord);
        return { stopped: true, runId: 'run_manual' };
      },
      listActiveStopOnBookingFollowUpRunsForEmail: async () => [],
      stopFollowUpRunsForAccountEmail: async () => ({
        stopped: false,
        stoppedCount: 0,
        leadMagnetIds: [],
      }),
      updateLeadMagnetFollowUpSync: async () => null,
    },
  });

  assert.deepEqual(manualStopped, { stopped: true });
  assert.deepEqual(manualStopCalls, [
    {
      accountId: account.id,
      leadMagnetId: magnet.id,
      email: 'Lead@Example.com',
      reason: 'manual',
    },
  ]);
  assert.deepEqual(eventSendBodies(), [
    {
      event: 'magnets.lead_magnet.magnet_smoke.booked',
      email: 'lead@example.com',
      payload: {
        reason: 'manual',
        leadMagnetId: magnet.id,
      },
    },
  ]);

  resetRequests();
  const accountStopCalls: JsonRecord[] = [];
  const accountStopped = await stopAccountFollowUpSequencesForEmail({
    account,
    email: 'lead@example.com',
    reason: 'booked',
    store: {
      createFollowUpRun: async () => ({ created: false, runId: null }),
      markFollowUpRunFailed: async () => undefined,
      hasActiveFollowUpRunForEmail: async () => false,
      stopFollowUpRunForEmail: async () => ({ stopped: false, runId: null }),
      listActiveStopOnBookingFollowUpRunsForEmail: async (input) => {
        assert.deepEqual(input, {
          accountId: account.id,
          email: 'lead@example.com',
        });
        return [magnet.id, 'magnet_second'];
      },
      stopFollowUpRunsForAccountEmail: async (input) => {
        accountStopCalls.push(input as unknown as JsonRecord);
        return {
          stopped: true,
          stoppedCount: 2,
          leadMagnetIds: [magnet.id, 'magnet_second'],
        };
      },
      updateLeadMagnetFollowUpSync: async () => null,
    },
  });

  assert.deepEqual(accountStopped, { stopped: true, stoppedCount: 2 });
  assert.deepEqual(accountStopCalls, [
    {
      accountId: account.id,
      email: 'lead@example.com',
      reason: 'booked',
    },
  ]);
  assert.deepEqual(eventSendBodies(), [
    {
      event: 'magnets.lead_magnet.magnet_smoke.booked',
      email: 'lead@example.com',
      payload: {
        reason: 'booked',
        leadMagnetId: magnet.id,
      },
    },
    {
      event: 'magnets.lead_magnet.magnet_second.booked',
      email: 'lead@example.com',
      payload: {
        reason: 'booked',
        leadMagnetId: 'magnet_second',
      },
    },
  ]);

  resetRequests();
  const inactiveStopped = await stopLeadMagnetFollowUpSequence({
    account,
    leadMagnetId: magnet.id,
    email: 'lead@example.com',
    reason: 'manual',
    store: {
      createFollowUpRun: async () => ({ created: false, runId: null }),
      markFollowUpRunFailed: async () => undefined,
      hasActiveFollowUpRunForEmail: async () => false,
      stopFollowUpRunForEmail: async () => ({ stopped: false, runId: null }),
      listActiveStopOnBookingFollowUpRunsForEmail: async () => [],
      stopFollowUpRunsForAccountEmail: async () => ({
        stopped: false,
        stoppedCount: 0,
        leadMagnetIds: [],
      }),
      updateLeadMagnetFollowUpSync: async () => null,
    },
  });

  assert.deepEqual(inactiveStopped, { stopped: false });
  assert.deepEqual(requests, []);

  resetRequests();
  let savedRepair: JsonRecord | null = null;
  const repairMagnet: LeadMagnet = {
    ...magnet,
    resendFollowUpAutomationId: '',
    followUpEmails: magnet.followUpEmails.map((email) => ({ ...email, resendTemplateId: '' })),
  };
  const duplicateAfterRepair = await startLeadMagnetFollowUpSequence({
    account,
    magnet: repairMagnet,
    email: 'repeat@example.com',
    name: 'Repeat',
    store: {
      createFollowUpRun: async () => ({ created: false, runId: null }),
      markFollowUpRunFailed: async () => undefined,
      hasActiveFollowUpRunForEmail: async () => false,
      stopFollowUpRunForEmail: async () => ({ stopped: false, runId: null }),
      listActiveStopOnBookingFollowUpRunsForEmail: async () => [],
      stopFollowUpRunsForAccountEmail: async () => ({
        stopped: false,
        stoppedCount: 0,
        leadMagnetIds: [],
      }),
      updateLeadMagnetFollowUpSync: async (accountId, leadMagnetId, updates) => {
        assert.equal(accountId, account.id);
        assert.equal(leadMagnetId, magnet.id);
        savedRepair = updates as unknown as JsonRecord;
        return {
          ...repairMagnet,
          followUpEmails: updates.followUpEmails,
          resendFollowUpAutomationId: updates.resendFollowUpAutomationId,
        };
      },
    },
  });

  assert.deepEqual(duplicateAfterRepair, { started: false, reason: 'duplicate' });
  const savedRepairSnapshot = savedRepair as JsonRecord | null;
  assert.ok(savedRepairSnapshot, 'Missing automation should be repaired before duplicate suppression.');
  assert.equal(savedRepairSnapshot.resendFollowUpAutomationId, 'auto_2');
  assert.ok(findRequest('/automations', 'POST'));
  assert.deepEqual(eventSendBodies(), []);

  resetRequests();
  forbiddenPath = '/events';
  try {
    await assert.rejects(
      () => syncLeadMagnetFollowUpAutomation(account, magnet),
      (error) => {
        assert.ok(error instanceof FollowUpSequenceError);
        assert.match(error.message, /Magnets could not create this follow-up sequence yet/);
        return true;
      }
    );
  } finally {
    forbiddenPath = '';
  }

  const platformKeyBeforeSync = process.env.MAGNETS_RESEND_API_KEY;
  process.env.MAGNETS_RESEND_API_KEY = 're_platform_smoke';
  resetRequests();
  try {
    await syncLeadMagnetFollowUpAutomation(
      {
        ...account,
        resendApiKey: '',
        resendConfigured: true,
        resendManagedByPlatform: true,
        resendFromEmail: '',
        resendReturnPath: '',
        domainVerifiedAt: null,
      },
      {
        ...magnet,
        id: 'magnet_platform_key_smoke',
        resendFollowUpAutomationId: '',
        followUpEmails: magnet.followUpEmails.map((email) => ({ ...email, resendTemplateId: '' })),
      }
    );
    const platformRequests: CapturedRequest[] = [...requests];
    assert.ok(platformRequests.length > 0, 'Expected the platform key to sync a follow-up automation.');
    assert.ok(
      platformRequests.every((request) => request.authorization === 'Bearer re_platform_smoke'),
      'Every Resend request should use the Magnets-managed key when no account key exists.'
    );
    const platformTemplate = platformRequests.find(
      (request) => request.pathname === '/templates' && request.method === 'POST'
    );
    assert.equal(platformTemplate?.body?.from, 'Magnets <hello@mail.magnets.so>');
  } finally {
    if (platformKeyBeforeSync === undefined) {
      delete process.env.MAGNETS_RESEND_API_KEY;
    } else {
      process.env.MAGNETS_RESEND_API_KEY = platformKeyBeforeSync;
    }
  }

  const resendFetch = globalThis.fetch;
  const integrationRequests: Array<{
    body: JsonRecord | null;
    method: string;
    pathname: string;
    host: string;
  }> = [];
  let existingPipedrivePerson = false;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(requestUrl(input));
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) as JsonRecord : null;
    integrationRequests.push({ body, method, pathname: url.pathname, host: url.host });

    if (url.hostname === 'hooks.slack.com') {
      return new Response('', { status: 200 });
    }

    if (url.hostname === 'api.pipedrive.com') {
      if (url.pathname === '/api/v1/users/me') return jsonResponse({ success: true, data: { id: 1 } });
      if (url.pathname === '/api/v2/persons/search') {
        return jsonResponse({
          success: true,
          data: existingPipedrivePerson ? { items: [{ item: { id: 42 } }] } : { items: [] },
        });
      }
      if (url.pathname === '/api/v2/persons' && method === 'POST') {
        return jsonResponse({ success: true, data: { id: 43 } });
      }
      if (url.pathname === '/api/v2/persons/42' && method === 'PATCH') {
        return jsonResponse({ success: true, data: { id: 42 } });
      }
    }

    return jsonResponse({ success: false, error: 'Unexpected integration request' }, 500);
  }) as typeof fetch;

  try {
    const integrationAccount: AccountSettings = {
      ...account,
      slackWebhookUrl: 'https://hooks.slack.com/services/T00000000/B00000000/secret_value',
      pipedriveApiToken: 'pipedrive_smoke_token',
    };

    assert.equal(isValidSlackWebhookUrl(integrationAccount.slackWebhookUrl), true);
    assert.equal(isValidSlackWebhookUrl('https://example.com/services/T/B/C'), false);
    await sendSlackSignupNotification({
      account: integrationAccount,
      leadMagnet: magnet,
      email: 'lead@example.com',
      name: 'Lead <Example>',
    });
    await testPipedriveConnection(integrationAccount);
    assert.deepEqual(
      await upsertPipedrivePerson({ account: integrationAccount, email: 'lead@example.com', name: 'Lead Example' }),
      { synced: true, action: 'created' }
    );

    existingPipedrivePerson = true;
    assert.deepEqual(
      await upsertPipedrivePerson({ account: integrationAccount, email: 'lead@example.com', name: 'Lead Updated' }),
      { synced: true, action: 'updated' }
    );

    const slackRequest = integrationRequests.find((request) => request.host === 'hooks.slack.com');
    assert.equal(slackRequest?.method, 'POST');
    assert.match(String(slackRequest?.body?.text), /New signup for Smoke Test Magnet/);
    assert.match(JSON.stringify(slackRequest?.body), /Lead &lt;Example&gt;/);
    assert.ok(
      integrationRequests.some(
        (request) => request.pathname === '/api/v2/persons' && request.method === 'POST'
      )
    );
    assert.ok(
      integrationRequests.some(
        (request) => request.pathname === '/api/v2/persons/42' && request.method === 'PATCH'
      )
    );
  } finally {
    globalThis.fetch = resendFetch;
  }

  console.log('Follow-up smoke test passed: managed Resend sending, automation creation and repair, sequence cancellation, email images, account-level booking cancellation, Slack notifications, and Pipedrive create/update sync.');
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    globalThis.fetch = originalFetch;
  });
