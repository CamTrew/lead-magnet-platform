import { senderMatchesAccountDomain } from './dns-records';
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
  renderPlainEmailHtml,
  scrubResendErrorMessage,
} from './resend';
import type { AccountSettings, FollowUpEmail, LeadMagnet } from './types';

const RESEND_API_BASE = 'https://api.resend.com';
const TEMPLATE_VARIABLES = [
  { key: 'NAME', type: 'string' },
  { key: 'DOWNLOAD_LINK', type: 'string' },
];

type ResendObject = {
  id?: string;
  object?: string;
  error?: { message?: string };
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

function durationFromHours(hours: number) {
  const clean = Math.max(0, Math.min(720, Math.round(hours)));
  if (clean <= 0) return '0 hours';
  if (clean === 1) return '1 hour';
  return `${clean} hours`;
}

function normaliseFollowUpEmails(emails: FollowUpEmail[]) {
  return emails.slice(0, 10).map((email, index) => ({
    id: email.id || `email-${index + 1}`,
    delayHours: Math.max(0, Math.min(720, Math.round(Number(email.delayHours) || 0))),
    subject: email.subject.trim(),
    preview: cleanPreviewText(email.preview),
    body: cleanEmailText(email.body),
    resendTemplateId: email.resendTemplateId || '',
  }));
}

function replaceTemplateVariables(value: string) {
  return value
    .replace(/{name}/g, '{{{NAME}}}')
    .replace(/{download_link}/g, '{{{DOWNLOAD_LINK}}}');
}

function templatePayload(account: AccountSettings, magnet: LeadMagnet, email: FollowUpEmail, index: number) {
  const body = replaceTemplateVariables(email.body);
  const downloadLink = magnet.downloadLink.trim();
  const text = cleanEmailText(
    downloadLink && !body.includes('{{{DOWNLOAD_LINK}}}') && !body.includes(downloadLink)
      ? [body, '{{{DOWNLOAD_LINK}}}'].filter(Boolean).join('\n\n')
      : body
  );

  return {
    name: `Magnets ${magnet.title.slice(0, 48) || magnet.id} follow-up ${index + 1}`,
    from: account.resendFromEmail,
    subject: email.subject,
    text,
    html: renderPlainEmailHtml(text, email.preview),
    variables: TEMPLATE_VARIABLES,
  };
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
  const data = (await response.json().catch(() => ({}))) as T;

  if (!response.ok) {
    const message =
      data.error?.message ||
      data.message ||
      `Resend returned ${response.status}`;
    throw new FollowUpSequenceError(scrubResendErrorMessage(message));
  }

  return data;
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
    const delayHours = Math.max(0, Math.min(720, Math.round(email.delayHours)));

    if (delayHours > 0) {
      const waitKey = `wait_${index + 1}`;
      const duration = durationFromHours(delayHours);

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
          },
        },
        from: account.resendFromEmail,
        subject: email.subject,
      },
    });

    previousKey = emailKey;
  });

  return {
    name: `Magnets follow-up: ${magnet.title.slice(0, 90) || magnet.id}`,
    status: 'enabled',
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
    body: JSON.stringify(payload),
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

  return {
    automationId,
    emails: syncedEmails,
  };
}

export function followUpSequenceEndDate(magnet: Pick<LeadMagnet, 'followUpEmails'>) {
  const totalHours = normaliseFollowUpEmails(magnet.followUpEmails)
    .reduce((total, email) => total + email.delayHours, 0);

  if (totalHours <= 0) return new Date();
  return new Date(Date.now() + totalHours * 60 * 60 * 1000);
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
  if (!magnet.followUpEnabled || !magnet.resendFollowUpAutomationId || magnet.followUpEmails.length === 0) {
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
    await sendEvent(account, magnet.id, 'signup', email, {
      name: name.trim() || 'there',
      downloadLink: magnet.downloadLink.trim(),
      leadMagnetId: magnet.id,
      leadMagnetTitle: magnet.title,
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
