import {
  createFollowUpRun as createFollowUpRunInStore,
  followUpSequenceFingerprint,
  hasActiveFollowUpRunForEmail as hasActiveFollowUpRunForEmailInStore,
  listActiveStopOnBookingFollowUpRunsForEmail as listActiveStopOnBookingFollowUpRunsForEmailInStore,
  markFollowUpRunFailed as markFollowUpRunFailedInStore,
  stopFollowUpRunsForAccountEmail as stopFollowUpRunsForAccountEmailInStore,
  stopFollowUpRunForEmail as stopFollowUpRunForEmailInStore,
} from './platform-store';
import {
  cleanEmailText,
  cleanPreviewText,
  MAGNETS_EMAIL_FOOTER_TEXT,
  renderEmailTextFallback,
  renderFollowUpEmailHtml,
  scrubResendErrorMessage,
} from './resend';
import { followUpStopUrl } from './follow-up-opt-out';
import { resolveResendApiKey, resolveResendFromEmail } from './platform-resend';
import type { AccountSettings, FollowUpEmail, LeadMagnet } from './types';

const RESEND_API_BASE = 'https://api.resend.com';
// AI/MAINTAINER CONTEXT: increment whenever stored Resend templates need to be
// rebuilt with new HTML. This is deliberately separate from a magnet's content
// fingerprint: renderer upgrades and copy edits are different reasons to
// repair an automation. Never reset active run rows merely to refresh markup.
export const FOLLOW_UP_RENDER_VERSION = 9;
const MAX_DELAY_MINUTES = 30 * 24 * 60;
const RESEND_NAME_MAX_LENGTH = 50;
const TEMPLATE_VARIABLES = [
  { key: 'NAME', type: 'string' },
  { key: 'DOWNLOAD_LINK', type: 'string' },
  { key: 'STOP_SEQUENCE_URL', type: 'string' },
];
const STOP_SEQUENCE_TEMPLATE_URL = '{{{STOP_SEQUENCE_URL}}}';
const STOP_SEQUENCE_TEXT = `Stop these follow-up emails: ${STOP_SEQUENCE_TEMPLATE_URL}`;

type ResendObject = {
  id?: string;
  object?: string;
  data?: unknown[];
  name?: string;
  status?: string;
  steps?: unknown[];
  error?: { code?: string; message?: string; name?: string } | string;
  code?: string;
  message?: string;
};

type FollowUpRunStore = {
  createFollowUpRun: typeof createFollowUpRunInStore;
  hasActiveFollowUpRunForEmail: typeof hasActiveFollowUpRunForEmailInStore;
  listActiveStopOnBookingFollowUpRunsForEmail: typeof listActiveStopOnBookingFollowUpRunsForEmailInStore;
  markFollowUpRunFailed: typeof markFollowUpRunFailedInStore;
  stopFollowUpRunForEmail: typeof stopFollowUpRunForEmailInStore;
  stopFollowUpRunsForAccountEmail: typeof stopFollowUpRunsForAccountEmailInStore;
};

const defaultFollowUpRunStore: FollowUpRunStore = {
  createFollowUpRun: createFollowUpRunInStore,
  hasActiveFollowUpRunForEmail: hasActiveFollowUpRunForEmailInStore,
  listActiveStopOnBookingFollowUpRunsForEmail: listActiveStopOnBookingFollowUpRunsForEmailInStore,
  markFollowUpRunFailed: markFollowUpRunFailedInStore,
  stopFollowUpRunForEmail: stopFollowUpRunForEmailInStore,
  stopFollowUpRunsForAccountEmail: stopFollowUpRunsForAccountEmailInStore,
};

export class FollowUpSequenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FollowUpSequenceError';
  }
}

function ensureResendReady(account: AccountSettings) {
  const resendApiKey = resolveResendApiKey(account);
  if (!resendApiKey) {
    throw new FollowUpSequenceError('Sending is not configured for this account yet.');
  }
  const from = resolveResendFromEmail(account);
  if (!from) {
    throw new FollowUpSequenceError('Sending is not configured for this account yet.');
  }

  return { from, resendApiKey };
}

function eventName(kind: 'signup' | 'booked', leadMagnetId: string) {
  // Magnet-scoped event names prevent one sequence's signup/booking event from
  // starting or stopping a different magnet's automation in the same account.
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

export function followUpAutomationNeedsProviderSync(magnet: LeadMagnet) {
  if (!magnet.followUpEnabled || !hasSyncableFollowUpEmails(magnet)) return false;
  if (Number(magnet.resendFollowUpRenderVersion || 0) < FOLLOW_UP_RENDER_VERSION) return true;
  if (!magnet.resendFollowUpAutomationId) return true;
  return normaliseFollowUpEmails(magnet.followUpEmails)
    .filter((email) => email.subject && email.body)
    .some((email) => !email.resendTemplateId);
}

function followUpEmailsChanged(a: FollowUpEmail[], b: FollowUpEmail[]) {
  const contentSignature = (emails: FollowUpEmail[]) => normaliseFollowUpEmails(emails)
    .map((email) => ({
      body: email.body,
      delayMinutes: email.delayMinutes,
      id: email.id,
      preview: email.preview,
      subject: email.subject,
    }));

  // Provider template IDs, legacy delayHours values, and object property order
  // are implementation metadata. Comparing raw JSON made an old editor bundle
  // look like it had changed follow-up copy during an unrelated Delivery edit,
  // which unnecessarily attempted a Resend replacement on every autosave.
  return JSON.stringify(contentSignature(a)) !== JSON.stringify(contentSignature(b));
}

export function followUpAutomationNeedsSync(previous: LeadMagnet | null, next: LeadMagnet) {
  if (!next.followUpEnabled) {
    return Boolean(next.resendFollowUpAutomationId);
  }

  // An older provider render version is upgraded by the dedicated production
  // upgrade job. Do not replace a live Automation merely because somebody
  // edited the landing page or delivery email: those fields are unrelated,
  // and a local environment may intentionally be unable to decrypt production
  // provider credentials. Real follow-up changes still create a replacement.
  if (!previous) return followUpAutomationNeedsProviderSync(next);

  return previous.followUpEnabled !== next.followUpEnabled
    || previous.followUpStopOnBooking !== next.followUpStopOnBooking
    || followUpEmailsChanged(previous.followUpEmails, next.followUpEmails);
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

function templatePayload(
  from: string,
  magnet: LeadMagnet,
  email: FollowUpEmail,
  index: number
) {
  const body = replaceTemplateVariables(email.body);
  const text = renderEmailTextFallback(
    [body, STOP_SEQUENCE_TEXT, MAGNETS_EMAIL_FOOTER_TEXT].filter(Boolean).join('\n\n')
  );

  return {
    name: resendName('Magnets follow-up email', magnet, String(index + 1)),
    from,
    subject: email.subject,
    text,
    html: renderFollowUpEmailHtml(body, email.preview, STOP_SEQUENCE_TEMPLATE_URL),
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
  return 'Magnets could not create this follow-up sequence yet. Contact support so we can finish connecting sending for your account.';
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

function buildAutomationGraph(from: string, magnet: LeadMagnet, emails: FollowUpEmail[]) {
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
        from,
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

async function disableAutomationIfPresent(apiKey: string, automationId: string) {
  try {
    await disableAutomation(apiKey, automationId);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/404|not found/i.test(message)) return false;
    throw error;
  }
}

function automationUsesTrigger(detail: ResendObject, triggerEvent: string) {
  return Array.isArray(detail.steps) && detail.steps.some((value) => {
    if (!isRecord(value) || value.type !== 'trigger' || !isRecord(value.config)) return false;
    return value.config.event_name === triggerEvent;
  });
}

async function findCompetingAutomationIds(
  apiKey: string,
  magnet: LeadMagnet,
  previousAutomationId: string,
  replacementAutomationId: string
) {
  const result = await resendRequest<ResendObject>(apiKey, '/automations');
  const expectedName = resendName('Magnets follow-up', magnet);
  const triggerEvent = eventName('signup', magnet.id);
  const competitors = new Set<string>();

  if (previousAutomationId && previousAutomationId !== replacementAutomationId) {
    competitors.add(previousAutomationId);
  }

  for (const value of result.data || []) {
    if (!isRecord(value)) continue;
    const id = stringValue(value.id);
    if (!id || id === replacementAutomationId || stringValue(value.name) !== expectedName) continue;

    // Names narrow the provider scan, but the event is the authority. Two
    // magnets may legitimately share a title, so never disable by name alone.
    const detail = await resendRequest<ResendObject>(
      apiKey,
      `/automations/${encodeURIComponent(id)}`
    );
    if (automationUsesTrigger(detail, triggerEvent)) competitors.add(id);
  }

  return Array.from(competitors);
}

async function activateReplacementAutomation(
  apiKey: string,
  magnet: LeadMagnet,
  previousAutomationId: string,
  replacementAutomationId: string
) {
  let previousDisabled = false;
  try {
    // Resend keeps existing runs alive after an Automation is stopped, but
    // stops matching events from starting new runs. Reconcile same-event
    // Automations as well as the ID stored locally, since older clients once
    // could overwrite that ID with stale data and orphan an enabled workflow.
    const competitors = await findCompetingAutomationIds(
      apiKey,
      magnet,
      previousAutomationId,
      replacementAutomationId
    );
    for (const automationId of competitors) {
      const disabled = await disableAutomationIfPresent(apiKey, automationId);
      if (automationId === previousAutomationId) previousDisabled = disabled;
    }
    await enableAutomation(apiKey, replacementAutomationId);
  } catch (error) {
    await disableAutomationIfPresent(apiKey, replacementAutomationId).catch(() => undefined);
    if (previousDisabled) {
      await enableAutomation(apiKey, previousAutomationId).catch(() => undefined);
    }
    throw error;
  }
}

async function sendEvent(
  account: AccountSettings,
  leadMagnetId: string,
  kind: 'signup' | 'booked',
  email: string,
  payload: Record<string, string>
) {
  const resendApiKey = resolveResendApiKey(account);
  if (!resendApiKey) {
    throw new FollowUpSequenceError('Sending is not configured for this account yet.');
  }

  await resendRequest(resendApiKey, '/events/send', {
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
  const resendApiKey = resolveResendApiKey(account);

  if (!magnet.followUpEnabled) {
    if (resendApiKey && magnet.resendFollowUpAutomationId) {
      await disableAutomationIfPresent(resendApiKey, magnet.resendFollowUpAutomationId);
    }
    return {
      automationId: '',
      emails,
      renderVersion: FOLLOW_UP_RENDER_VERSION,
    };
  }

  const { from, resendApiKey: readyResendApiKey } = ensureResendReady(account);

  const activeEmails = emails.filter((email) => email.subject && email.body);
  if (activeEmails.length === 0) {
    throw new FollowUpSequenceError('Add at least one follow-up email before enabling the sequence.');
  }

  await createEvent(readyResendApiKey, eventName('signup', magnet.id));
  if (magnet.followUpStopOnBooking) {
    await createEvent(readyResendApiKey, eventName('booked', magnet.id));
  }

  const syncedEmails: FollowUpEmail[] = [];
  for (let index = 0; index < activeEmails.length; index += 1) {
    const email = activeEmails[index];
    // Never republish a template used by an older run. A replacement
    // Automation gets replacement templates so people already in the old
    // sequence continue seeing the exact version they entered.
    const templateId = await upsertTemplate(
      readyResendApiKey,
      '',
      templatePayload(from, magnet, email, index)
    );
    syncedEmails.push({ ...email, resendTemplateId: templateId });
  }

  const automationId = await upsertAutomation(
    readyResendApiKey,
    '',
    buildAutomationGraph(from, magnet, syncedEmails)
  );
  await activateReplacementAutomation(
    readyResendApiKey,
    magnet,
    magnet.resendFollowUpAutomationId,
    automationId
  );

  return {
    automationId,
    emails: syncedEmails,
    renderVersion: FOLLOW_UP_RENDER_VERSION,
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

  const run = await store.createFollowUpRun({
    accountId: account.id,
    leadMagnetId: magnet.id,
    email,
    name,
    sequenceFingerprint: followUpSequenceFingerprint(magnet),
    scheduledEndAt: followUpSequenceEndDate(magnet),
  });

  if (!run.created) {
    return { started: false, reason: 'duplicate' as const };
  }

  try {
    // Automation creation and replacement belongs to the magnet save path.
    // A signup must only emit the event: rebuilding multiple Resend resources
    // here can time out after the submission is already accepted and silently
    // leave the subscriber without a run.
    if (!magnet.resendFollowUpAutomationId) {
      throw new FollowUpSequenceError('The follow-up automation is not ready yet. Save the magnet and try again.');
    }
    await sendEvent(account, magnet.id, 'signup', email, {
      name: name.trim() || 'there',
      downloadLink: magnet.downloadLink.trim(),
      leadMagnetId: magnet.id,
      leadMagnetTitle: magnet.title,
      stopSequenceUrl: followUpStopUrl(account, magnet.id, email),
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
