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
  proxyEmailImagesInBody,
  publicEmailImageUrl,
  verifyEmailImageToken,
} from '../lib/email-image-proxy';
import { verifyFollowUpStopToken } from '../lib/follow-up-opt-out';
import { renderEmailTextFallback, renderPlainEmailHtml } from '../lib/resend';
import type { AccountSettings, LeadMagnet } from '../lib/types';

type JsonRecord = Record<string, unknown>;

type CapturedRequest = {
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

  requests.push({ method, pathname: url.pathname, body });

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

  return jsonResponse({ message: `Unexpected Resend request: ${method} ${url.pathname}` }, 500);
}) as typeof fetch;

const now = new Date('2026-07-08T10:00:00.000Z').toISOString();

const account: AccountSettings = {
  id: 'account_smoke',
  ownerUserId: 'user_smoke',
  subdomain: 'get',
  domain: 'example.com',
  logoUrl: '',
  logoText: 'Smoke Test',
  brand: {
    primary: '#2b0fff',
    accent: '#f8f5ff',
    success: '#22c55e',
    highlightIntensity: 100,
  },
  resendFromEmail: 'Smoke Test <hello@send.example.com>',
  resendApiKey: 're_smoke_test',
  beehiivApiKey: '',
  beehiivPublicationId: '',
  substackPublication: '',
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
      body: 'Hi {name}, here is the link again:\n\n![Audit preview](https://cdn.example.com/audit-preview.png)\n\n{download_link}',
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
  published: true,
  createdAt: now,
  updatedAt: now,
};

async function run() {
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
  assert.match(String(templateBody.html), /alt="Audit preview"/);
  assert.match(String(templateBody.html), /Stop this sequence/);
  assert.match(String(templateBody.html), /\{\{\{STOP_SEQUENCE_URL\}\}\}/);
  assert.match(String(templateBody.text), /\{\{\{DOWNLOAD_LINK\}\}\}/);
  assert.match(String(templateBody.text), /Audit preview: https:\/\/cdn\.example\.com\/audit-preview\.png/);
  assert.match(String(templateBody.text), /\{\{\{STOP_SEQUENCE_URL\}\}\}/);

  const normalEmailBody = 'Here is the screenshot:\n\n![Screenshot](https://cdn.example.com/screenshot.jpg)\n\nDone.';
  assert.match(renderPlainEmailHtml(normalEmailBody, 'Preview'), /<img src="https:\/\/cdn\.example\.com\/screenshot\.jpg"/);
  assert.match(renderEmailTextFallback(normalEmailBody), /Screenshot: https:\/\/cdn\.example\.com\/screenshot\.jpg/);

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
  assert.equal(startAutomationPatches.length, 2);
  assert.ok(Array.isArray(startAutomationPatches[0]?.steps));
  assert.deepEqual(startAutomationPatches[1], { status: 'enabled' });
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
        assert.match(error.message, /Full access/);
        return true;
      }
    );
  } finally {
    forbiddenPath = '';
  }

  console.log('Follow-up smoke test passed: mocked Resend setup, automation graph, missing automation repair, permission failure, disable flow, manual cancel, and account-level booking cancel.');
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    globalThis.fetch = originalFetch;
  });
