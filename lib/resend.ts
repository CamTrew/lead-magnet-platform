import { Resend } from 'resend';
import { log } from './logger';
import {
  cleanEmailText,
  cleanPreviewText,
  escapeEmailHtml,
  MAGNETS_EMAIL_FOOTER_HTML,
  MAGNETS_EMAIL_FOOTER_TEXT,
  renderDeliveryEmailHtml,
  renderEmailTextFallback,
} from './email-render';
import {
  platformResendApiKey,
  platformResendFromEmail,
  resolveResendApiKey,
  resolveResendFromEmail,
} from './platform-resend';
import type { AccountSettings, LeadMagnet } from './types';

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

function escapeHtml(value: string) {
  return escapeEmailHtml(value);
}

export {
  cleanEmailText,
  cleanPreviewText,
  MAGNETS_EMAIL_FOOTER_HTML,
  MAGNETS_EMAIL_FOOTER_TEXT,
  renderDeliveryEmailHtml,
  renderFollowUpEmailHtml,
  renderEmailTextFallback,
  renderPlainEmailHtml,
} from './email-render';

export function scrubResendErrorMessage(message: string) {
  // The Resend SDK occasionally echoes the key back in error messages. Strip
  // anything that looks like one before we hand it to a caller that may end up
  // logging or returning it to the public form-submit endpoint.
  return message
    .replace(/re_[A-Za-z0-9_-]{8,}/g, '<redacted>')
    .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer <redacted>');
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
}: {
  to: string;
  resetUrl: string;
}) {
  const resendApiKey = platformResendApiKey();
  if (!resendApiKey) {
    throw new EmailDeliveryError('Password reset email is not configured.');
  }

  const resend = new Resend(resendApiKey);
  const text = `Reset your Magnets password\n\nUse this link to choose a new password:\n${resetUrl}\n\nThis link expires in one hour. If you did not request it, you can ignore this email.\n\n${MAGNETS_EMAIL_FOOTER_TEXT}`;
  const html = `<p style="font:16px/1.5 Arial,sans-serif;color:#111827">Use the link below to choose a new Magnets password.</p><p><a href="${escapeHtml(resetUrl)}" style="font:600 16px Arial,sans-serif;color:#111827">Reset your password</a></p><p style="font:14px/1.5 Arial,sans-serif;color:#4b5563">This link expires in one hour. If you did not request it, you can ignore this email.</p>${MAGNETS_EMAIL_FOOTER_HTML}`;

  try {
    const result = await resend.emails.send({
      from: platformResendFromEmail(),
      to,
      subject: 'Reset your Magnets password',
      text,
      html,
    });

    if (result.error) {
      throw new Error(result.error.message || 'The email provider rejected the message.');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new EmailDeliveryError(scrubResendErrorMessage(message));
  }
}

/**
 * Sends the magnet's resource email to `to`. Caller must pass an account loaded
 * with revealSecrets so any account-owned key is available. Accounts without
 * one use the server-only Magnets-managed Resend key when configured.
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
  const resendApiKey = resolveResendApiKey(account);

  if (!resendApiKey) {
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

  const from = resolveResendFromEmail(account);
  if (!from) {
    throw new EmailDeliveryError('Email could not be sent because no sender is configured.');
  }

  const resend = new Resend(resendApiKey);
  const downloadLink = (magnet.downloadLink || '').trim();
  const body = cleanEmailText(
    magnet.emailBody
      .replace(/{name}/g, name)
      .replace(/{download_link}/g, downloadLink)
  );
  const text = `${renderEmailTextFallback(body)}\n\n${MAGNETS_EMAIL_FOOTER_TEXT}`;
  const previewText = cleanPreviewText(magnet.emailPreview);

  let result;
  try {
    result = await resend.emails.send({
      from,
      to,
      subject: magnet.emailSubject,
      text,
      html: renderDeliveryEmailHtml(body, previewText),
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
