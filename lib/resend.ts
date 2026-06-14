import { Resend } from 'resend';
import { senderMatchesAccountDomain } from './dns-records';
import { log } from './logger';
import type { AccountSettings, LeadMagnet } from './types';

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderParagraphs(value: string) {
  return value
    .split('\n\n')
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

function scrubResendErrorMessage(message: string) {
  // The Resend SDK occasionally echoes the key back in error messages. Strip
  // anything that looks like one before we hand it to a caller that may end up
  // logging or returning it to the public form-submit endpoint.
  return message
    .replace(/re_[A-Za-z0-9_-]{8,}/g, '<redacted>')
    .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer <redacted>');
}

/**
 * Sends the magnet's resource email to `to`. Caller must pass an account loaded
 * with revealSecrets so account.resendApiKey is the plaintext key.
 *
 * Behaviour:
 *  - No key set + NODE_ENV !== 'production' → no-op, logs at info, returns
 *    { skipped: true } so dev/preview can still submit forms without sending.
 *  - No key set + NODE_ENV === 'production' → throws EmailDeliveryError so the
 *    public submit endpoint fails loudly instead of recording an undelivered
 *    submission silently.
 *  - Resend returns an error → throws EmailDeliveryError with the message
 *    scrubbed of any API-key fragments.
 */
export async function sendLeadMagnetEmail({
  account,
  magnet,
  to,
  name,
}: {
  account: AccountSettings;
  magnet: LeadMagnet;
  to: string;
  name: string;
}): Promise<{ skipped: true } | { messageId: string }> {
  if (!account.resendApiKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new EmailDeliveryError(
        'Email could not be sent because this account has no sender configured.'
      );
    }
    log.info('Email send skipped (no API key, dev only)', {
      route: 'lib/resend',
      accountId: account.id,
      extra: { magnetId: magnet.id },
    });
    return { skipped: true };
  }

  if (!account.resendFromEmail) {
    throw new EmailDeliveryError(
      'Email could not be sent because no sender address is set.'
    );
  }

  if (!account.domainVerifiedAt) {
    throw new EmailDeliveryError(
      'Email could not be sent because the account domain has not been verified.'
    );
  }

  if (!senderMatchesAccountDomain(account)) {
    throw new EmailDeliveryError(
      'Email could not be sent because the sender address does not match this account domain.'
    );
  }

  const resend = new Resend(account.resendApiKey);
  const body = magnet.emailBody
    .replace(/{name}/g, name)
    .replace(/{download_link}/g, magnet.downloadLink || '');
  const text = magnet.downloadLink && !body.includes(magnet.downloadLink)
    ? `${body}\n\n${magnet.downloadLink}`
    : body;

  let result;
  try {
    result = await resend.emails.send({
      from: account.resendFromEmail,
      to,
      subject: magnet.emailSubject,
      text,
      html: `
        <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(magnet.emailPreview)}</div>
        <main style="margin:0;background:#fafafa;padding:32px;font-family:Inter,Arial,sans-serif;color:#18181b">
          <section style="margin:0 auto;max-width:640px;border:1px solid #e4e4e7;background:#ffffff;border-radius:8px;padding:40px">
            <div style="font-size:16px;line-height:1.7;color:#3f3f46">${renderParagraphs(text)}</div>
          </section>
        </main>
      `,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new EmailDeliveryError(scrubResendErrorMessage(message));
  }

  if (result.error) {
    const message = result.error.message || 'The email provider rejected the message.';
    throw new EmailDeliveryError(scrubResendErrorMessage(message));
  }

  return { messageId: result.data?.id || '' };
}
