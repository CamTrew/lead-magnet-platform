import { senderMatchesAccountDomain } from './dns-records';
import {
  createFollowUpRun as createFollowUpRunInStore,
  followUpSequenceFingerprint,
  hasActiveFollowUpRunForEmail as hasActiveFollowUpRunForEmailInStore,
  listActiveStopOnBookingFollowUpRunsForEmail as listActiveStopOnBookingFollowUpRunsForEmailInStore,
  markFollowUpRunFailed as markFollowUpRunFailedInStore,
  stopFollowUpRunsForAccountEmail as stopFollowUpRunsForAccountEmailInStore,
  stopFollowUpRunForEmail as stopFollowUpRunForEmailInStore,
  updateLeadMagnetFollowUpSync as updateLeadMagnetFollowUpSyncInStore,
} from './platform-store';
import {
  cleanEmailText,
  cleanPreviewText,
  renderEmailTextFallback,
  renderPlainEmailHtml,
  scrubResendErrorMessage,
} from './resend';
import { followUpStopUrl } from './follow-up-opt-out';
import type { AccountSettings, FollowUpEmail, LeadMagnet } from './types';

const RESEND_API_BASE = 'https://api.resend.com';
const MAX_DELAY_MINUTES = 30 * 24 * 60;
const RESEND_NAME_MAX_LENGTH = 50;
const TEMPLATE_VARIABLES = [
  { key: 'NAME', type: 'string' },
  { key: 'DOWNLOAD_LINK', type: 'string' },
  { key: 'STOP_SEQUENCE_URL', type: 'string' },
];
const STOP_SEQUENCE_TEMPLATE_URL = '{{{STOP_SEQUENCE_URL}}}';
const STOP_SEQUENCE_TEXT = `Stop these follow-up emails: ${STOP_SEQUENCE_TEMPLATE_URL}`;
const STOP_SEQUENCE_HTML = `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font:13px/1.5 Arial,sans-serif;color:#6b7280">Don't want these follow-up emails? <a href="${STOP_SEQUENCE_TEMPLATE_URL}" style="color:#374151;text-decoration:underline">Stop this sequence</a>.</div>`;

type ResendObject = {
  id?: string;
  object?: string;
  error?: { code?: string; message?: string; name?: string } | string;
  code?: string;
  message?: string;
  name?: string;
};

type FollowUpRunStore = {
  createFollowUpRun: typeof createFollowUpRunInStore;
  hasActiveFollowUpRunForEmail: typeof hasActiveFollowUpRunForEmailInStore;
  listActiveStopOnBookingFollowUpRunsForEmail: typeof listActiveStopOnBookingFollowUpRunsForEmailInStore;
  markFollowUpRunFailed: typeof markFollowUpRunFailedInStore;
  stopFollowUpRunForEmail: typeof stopFollowUpRunForEmailInStore;
  stopFollowUpRunsForAccountEmail: typeof stopFollowUpRunsForAccountEmailInStore;
  updateLeadMagnetFollowUpSync: typeof updateLeadMagnetFollowUpSyncInStore;
};

const defaultFollowUpRunStore: FollowUpRunStore = {
  createFollowUpRun: createFollowUpRunInStore,
  hasActiveFollowUpRunForEmail: hasActiveFollowUpRunForEmailInStore,
  listActiveStopOnBookingFollowUpRunsForEmail: listActiveStopOnBookingFollowUpRunsForEmailInStore,
  markFollowUpRunFailed: markFollowUpRunFailedInStore,
  stopFollowUpRunForEmail: stopFollowUpRunForEmailInStore,
  stopFollowUpRunsForAccountEmail: stopFollowUpRunsForAccountEmailInStore,
  updateLeadMagnetFollowUpSync: updateLeadMagnetFollowUpSyncInStore,
};

export class FollowUpSequenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FollowUpSequenceError';
  }
}

function ensureResendReady(account: AccountSettings) {
  if (!account.resendApiKey) {
    throw new FollowUpSequenceError('Connect Resend before enabling a follow-up sequence.');
  }
  if (!account.resendFromEmail) {
    throw new FollowUpSequenceError('Set your sender address before enabling a follow-up sequence.');
  }
  if (!account.domainVerifiedAt || !senderMatchesAccountDomain(account)) {
    throw new FollowUpSequenceError('Finish sender domain verification before enabling a follow-up sequence.');
  }
}

function eventName(kind: 'signup' | 'booked', leadMagnetId: string) {
  return `magnets.lead_magnet.${leadMagnetId}.${kind}`;
}

function normaliseDelayMinutes(email: Pick<FollowUpEmail, 'delayHours'> & Partial<Pick<FollowUpEmail, 'delayMinutes'>>) {
  const delayMinutes = Number(email.delayMinutes);
  if (Number.isFinite(delayMinutes)) {
    return Math.max(0, Math.min(MAX_DELAY_MINUTES, Math.round(delayMinutes)));
  }

  const delayHours = Number(email.delayHours);
  if (Number.isFinite(delayHours)) {
    return Math.max(0, Math.min(MAX_DELAY_MINUTES, Math.round(delayHours * 60)));
  }

  return 24 * 60;
}

function durationFromMinutes(minutes: number) {
  const clean = Math.max(0, Math.min(MAX_DELAY_MINUTES, Math.round(minutes)));
  if (clean <= 0) return '0 minutes';
  if (clean % (24 * 60) === 0) {
    const days = clean / (24 * 60);
    return days === 1 ? '1 day' : `${days} days`;
  }
  if (clean % 60 === 0) {
    const hours = clean / 60;
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  return clean === 1 ? '1 minute' : `${clean} minutes`;
}

function normaliseFollowUpEmails(emails: FollowUpEmail[]) {
  return emails.slice(0, 10).map((email, index) => {
    const delayMinutes = normaliseDelayMinutes(email);
    return {
      id: email.id || `email-${index + 1}`,
      delayMinutes,
      delayHours: Math.round(delayMinutes / 60),
      subject: email.subject.trim(),
      preview: cleanPreviewText(email.preview),
      body: cleanEmailText(email.body),
      resendTemplateId: email.resendTemplateId || '',
    };
  });
}

function hasSyncableFollowUpEmails(magnet: LeadMagnet) {
  return normaliseFollowUpEmails(magnet.followUpEmails)
    .some((email) => email.subject && email.body);
}

function needsInitialFollowUpSync(magnet: LeadMagnet) {
  if (!magnet.followUpEnabled || !hasSyncableFollowUpEmails(magnet)) return false;
  if (!magnet.resendFollowUpAutomationId) return true;
  return normaliseFollowUpEmails(magnet.followUpEmails)
    .filter((email) => email.subject && email.body)
    .some((email) => !email.resendTemplateId);
}

function followUpEmailsChanged(a: FollowUpEmail[], b: FollowUpEmail[]) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function replaceTemplateVariables(value: string) {
  return value
    .replace(/{name}/g, '{{{NAME}}}')
    .replace(/{download_link}/g, '{{{DOWNLOAD_LINK}}}');
}

function resendName(label: string, magnet: Pick<LeadMagnet, 'id' | 'slug' | 'title'>, detail?: string) {
  const name = (magnet.title || magnet.slug || magnet.id).replace(/\s+/g, ' ').trim();
  const full = [label, detail, name].filter(Boolean).join(': ');

  if (full.length <= RESEND_NAME_MAX_LENGTH) return full;

  const suffix = ` ${magnet.id.slice(0, 8)}`;
  const maxPrefixLength = RESEND_NAME_MAX_LENGTH - suffix.length;
  return `${full.slice(0, maxPrefixLength).trimEnd()}${suffix}`;
}

function templatePayload(account: AccountSettings, magnet: LeadMagnet, email: FollowUpEmail, index: number) {
  const body = replaceTemplateVariables(email.body);
  const text = renderEmailTextFallback([body, STOP_SEQUENCE_TEXT].filter(Boolean).join('\n\n'));

  return {
    name: resendName('Magnets follow-up email', magnet, String(index + 1)),
    from: account.resendFromEmail,
    subject: email.subject,
    text,
    html: renderPlainEmailHtml(cleanEmailText(body), email.preview, STOP_SEQUENCE_HTML),
    variables: TEMPLATE_VARIABLES,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function extractResendErrorMessage(data: unknown, status: number) {
  if (!isRecord(data)) {
    return `Resend returned ${status}`;
  }

  const parts: string[] = [];
  const error = data.error;

  if (typeof error === 'string') {
    parts.push(error);
  } else if (isRecord(error)) {
    parts.push(stringValue(error.message), stringValue(error.code), stringValue(error.name));
  }

  parts.push(stringValue(data.message), stringValue(data.code), stringValue(data.name));

  const message = parts.filter(Boolean).join(' ');
  return message || `Resend returned ${status}`;
}

function needsFullAccessHelp(path: string, status: number, message: string) {
  const writesAutomationResources = /^\/(automations|templates|events)(\/|$)/.test(path);
  return (
    writesAutomationResources &&
    (status === 401 ||
      status === 403 ||
      /permission|forbidden|unauthori[sz]ed|not authorized|restricted|access/i.test(message))
  );
}

function resendFullAccessMessage() {
  return 'Your Resend API key needs Full access to create follow-up sequences. In Resend, create a Full access API key, paste it in Configure, then save this sequence again.';
}

async function resendRequest<T extends ResendObject>(
  apiKey: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${RESEND_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const raw = await response.text();
  let data: unknown = {};

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { message: raw };
    }
  }

  if (!response.ok) {
    const message = extractResendErrorMessage(data, response.status);
    if (needsFullAccessHelp(path, response.status, message)) {
      throw new FollowUpSequenceError(resendFullAccessMessage());
    }
    throw new FollowUpSequenceError(scrubResendErrorMessage(message));
  }

  return data as T;
}

async function createEvent(apiKey: string, name: string) {
  try {
    await resendRequest(apiKey, '/events', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already|exists|duplicate|conflict/i.test(message)) return;
    throw error;
  }
}

async function publishTemplate(apiKey: string, templateId: string) {
  await resendRequest(apiKey, `/templates/${encodeURIComponent(templateId)}/publish`, {
    method: 'POST',
  });
}

async function upsertTemplate(
  apiKey: string,
  existingId: string,
  payload: ReturnType<typeof templatePayload>
) {
  if (existingId) {
    try {
      const updated = await resendRequest(apiKey, `/templates/${encodeURIComponent(existingId)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await publishTemplate(apiKey, existingId);
      return updated.id || existingId;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/404|not found/i.test(message)) throw error;
    }
  }

  const created = await resendRequest(apiKey, '/templates', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!created.id) {
    throw new FollowUpSequenceError('Resend did not return a template ID.');
  }
  await publishTemplate(apiKey, created.id);
  return created.id;
}

function buildAutomationGraph(account: AccountSettings, magnet: LeadMagnet, emails: FollowUpEmail[]) {
  const startEvent = eventName('signup', magnet.id);
  const bookedEvent = eventName('booked', magnet.id);
  const steps: Array<Record<string, unknown>> = [
    {
      key: 'start',
      type: 'trigger',
      config: { event_name: startEvent },
    },
  ];
  const connections: Array<Record<string, string>> = [];
  let previousKey = 'start';

  emails.forEach((email, index) => {
    const emailKey = `email_${index + 1}`;
    const delayMinutes = normaliseDelayMinutes(email);

    if (delayMinutes > 0) {
      const waitKey = `wait_${index + 1}`;
      const duration = durationFromMinutes(delayMinutes);

      if (magnet.followUpStopOnBooking) {
        steps.push({
          key: waitKey,
          type: 'wait_for_event',
          config: { event_name: bookedEvent, timeout: duration },
        });
        connections.push({ from: previousKey, to: waitKey, type: 'default' });
        connections.push({ from: waitKey, to: emailKey, type: 'timeout' });
      } else {
        steps.push({
          key: waitKey,
          type: 'delay',
          config: { duration },
        });
        connections.push({ from: previousKey, to: waitKey, type: 'default' });
        connections.push({ from: waitKey, to: emailKey, type: 'default' });
      }
    } else {
      connections.push({ from: previousKey, to: emailKey, type: 'default' });
    }

    steps.push({
      key: emailKey,
      type: 'send_email',
      config: {
        template: {
          id: email.resendTemplateId,
          variables: {
            NAME: { var: 'event.name' },
            DOWNLOAD_LINK: { var: 'event.downloadLink' },
            STOP_SEQUENCE_URL: { var: 'event.stopSequenceUrl' },
          },
        },
        from: account.resendFromEmail,
        subject: email.subject,
      },
    });

    previousKey = emailKey;
  });

  return {
    name: resendName('Magnets follow-up', magnet),
    steps,
    connections,
  };
}

async function upsertAutomation(
  apiKey: string,
  existingId: string,
  payload: ReturnType<typeof buildAutomationGraph>
) {
  if (existingId) {
    try {
      const updated = await resendRequest(apiKey, `/automations/${encodeURIComponent(existingId)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      return updated.id || existingId;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/404|not found/i.test(message)) throw error;
    }
  }

  const created = await resendRequest(apiKey, '/automations', {
    method: 'POST',
    body: JSON.stringify({ ...payload, status: 'disabled' }),
  });
  if (!created.id) {
    throw new FollowUpSequenceError('Resend did not return an automation ID.');
  }
  return created.id;
}

async function disableAutomation(apiKey: string, automationId: string) {
  await resendRequest(apiKey, `/automations/${encodeURIComponent(automationId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'disabled' }),
  });
}

async function enableAutomation(apiKey: string, automationId: string) {
  await resendRequest(apiKey, `/automations/${encodeURIComponent(automationId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'enabled' }),
  });
}

async function sendEvent(
  account: AccountSettings,
  leadMagnetId: string,
  kind: 'signup' | 'booked',
  email: string,
  payload: Record<string, string>
) {
  await resendRequest(account.resendApiKey, '/events/send', {
    method: 'POST',
    body: JSON.stringify({
      event: eventName(kind, leadMagnetId),
      email: email.trim().toLowerCase(),
      payload,
    }),
  });
}

export async function syncLeadMagnetFollowUpAutomation(
  account: AccountSettings,
  magnet: LeadMagnet
) {
  const emails = normaliseFollowUpEmails(magnet.followUpEmails);

  if (!magnet.followUpEnabled) {
    if (account.resendApiKey && magnet.resendFollowUpAutomationId) {
      await disableAutomation(account.resendApiKey, magnet.resendFollowUpAutomationId).catch(() => undefined);
    }
    return {
      automationId: magnet.resendFollowUpAutomationId,
      emails,
    };
  }

  ensureResendReady(account);

  const activeEmails = emails.filter((email) => email.subject && email.body);
  if (activeEmails.length === 0) {
    throw new FollowUpSequenceError('Add at least one follow-up email before enabling the sequence.');
  }

  await createEvent(account.resendApiKey, eventName('signup', magnet.id));
  if (magnet.followUpStopOnBooking) {
    await createEvent(account.resendApiKey, eventName('booked', magnet.id));
  }

  const syncedEmails: FollowUpEmail[] = [];
  for (let index = 0; index < activeEmails.length; index += 1) {
    const email = activeEmails[index];
    const templateId = await upsertTemplate(
      account.resendApiKey,
      email.resendTemplateId,
      templatePayload(account, magnet, email, index)
    );
    syncedEmails.push({ ...email, resendTemplateId: templateId });
  }

  const automationId = await upsertAutomation(
    account.resendApiKey,
    magnet.resendFollowUpAutomationId,
    buildAutomationGraph(account, magnet, syncedEmails)
  );
  await enableAutomation(account.resendApiKey, automationId);

  return {
    automationId,
    emails: syncedEmails,
  };
}

async function syncAndPersistFollowUpAutomation(
  account: AccountSettings,
  magnet: LeadMagnet,
  store: FollowUpRunStore
) {
  const synced = await syncLeadMagnetFollowUpAutomation(account, magnet);
  const automationId = synced.automationId || magnet.resendFollowUpAutomationId;
  const changed =
    automationId !== magnet.resendFollowUpAutomationId ||
    followUpEmailsChanged(synced.emails, magnet.followUpEmails);

  if (!changed) {
    return magnet;
  }

  const updated = await store.updateLeadMagnetFollowUpSync(account.id, magnet.id, {
    followUpEmails: synced.emails,
    resendFollowUpAutomationId: automationId,
  });

  return updated || {
    ...magnet,
    followUpEmails: synced.emails,
    resendFollowUpAutomationId: automationId,
  };
}

export function followUpSequenceEndDate(magnet: Pick<LeadMagnet, 'followUpEmails'>) {
  const totalMinutes = normaliseFollowUpEmails(magnet.followUpEmails)
    .reduce((total, email) => total + email.delayMinutes, 0);

  if (totalMinutes <= 0) return new Date();
  return new Date(Date.now() + totalMinutes * 60 * 1000);
}

export async function startLeadMagnetFollowUpSequence({
  account,
  email,
  magnet,
  name,
  store = defaultFollowUpRunStore,
}: {
  account: AccountSettings;
  email: string;
  magnet: LeadMagnet;
  name: string;
  store?: FollowUpRunStore;
}) {
  if (!magnet.followUpEnabled || !hasSyncableFollowUpEmails(magnet)) {
    return { started: false, reason: 'not_configured' as const };
  }

  let syncedMagnet = magnet;
  if (needsInitialFollowUpSync(syncedMagnet)) {
    syncedMagnet = await syncAndPersistFollowUpAutomation(account, syncedMagnet, store);
  }

  if (!syncedMagnet.resendFollowUpAutomationId) {
    return { started: false, reason: 'not_configured' as const };
  }

  const run = await store.createFollowUpRun({
    accountId: account.id,
    leadMagnetId: syncedMagnet.id,
    email,
    name,
    sequenceFingerprint: followUpSequenceFingerprint(syncedMagnet),
    scheduledEndAt: followUpSequenceEndDate(syncedMagnet),
  });

  if (!run.created) {
    return { started: false, reason: 'duplicate' as const };
  }

  try {
    syncedMagnet = await syncAndPersistFollowUpAutomation(account, syncedMagnet, store);
    await sendEvent(account, syncedMagnet.id, 'signup', email, {
      name: name.trim() || 'there',
      downloadLink: syncedMagnet.downloadLink.trim(),
      leadMagnetId: syncedMagnet.id,
      leadMagnetTitle: syncedMagnet.title,
      stopSequenceUrl: followUpStopUrl(account, syncedMagnet.id, email),
    });
  } catch (error) {
    if (run.runId) {
      await store.markFollowUpRunFailed(
        run.runId,
        error instanceof Error ? error.message : 'Could not start Resend automation'
      );
    }
    throw error;
  }

  return { started: true, reason: null };
}

export async function stopLeadMagnetFollowUpSequence({
  account,
  email,
  leadMagnetId,
  reason,
  store = defaultFollowUpRunStore,
}: {
  account: AccountSettings;
  leadMagnetId: string;
  email: string;
  reason: string;
  store?: FollowUpRunStore;
}) {
  const active = await store.hasActiveFollowUpRunForEmail({
    accountId: account.id,
    leadMagnetId,
    email,
  });

  if (!active) {
    return { stopped: false };
  }

  await sendEvent(account, leadMagnetId, 'booked', email, {
    reason,
    leadMagnetId,
  });

  const stopped = await store.stopFollowUpRunForEmail({
    accountId: account.id,
    leadMagnetId,
    email,
    reason,
  });

  return { stopped: stopped.stopped };
}

export async function stopAccountFollowUpSequencesForEmail({
  account,
  email,
  reason,
  store = defaultFollowUpRunStore,
}: {
  account: AccountSettings;
  email: string;
  reason: string;
  store?: FollowUpRunStore;
}) {
  const activeLeadMagnetIds = await store.listActiveStopOnBookingFollowUpRunsForEmail({
    accountId: account.id,
    email,
  });

  if (activeLeadMagnetIds.length === 0) {
    return { stopped: false, stoppedCount: 0 };
  }

  for (const leadMagnetId of activeLeadMagnetIds) {
    await sendEvent(account, leadMagnetId, 'booked', email, {
      reason,
      leadMagnetId,
    });
  }

  const stopped = await store.stopFollowUpRunsForAccountEmail({
    accountId: account.id,
    email,
    reason,
  });

  return {
    stopped: stopped.stopped,
    stoppedCount: stopped.stoppedCount,
  };
}
