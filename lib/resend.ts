import { Resend } from 'resend';
import { parseEmailImageLine } from './email-body-images';
import { renderEmailFormattedHtml, renderEmailInlineText } from './email-body-links';
import { log } from './logger';
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

export const MAGNETS_EMAIL_FOOTER_TEXT = 'Powered by Magnets: https://magnets.so';
export const MAGNETS_EMAIL_FOOTER_HTML = '<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font:13px/1.5 Arial,sans-serif;color:#6b7280">Powered by <a href="https://magnets.so" style="color:#374151;text-decoration:underline">Magnets</a>.</div>';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderEmailTextFallback(text: string) {
  return cleanEmailText(
    text
      .split('\n')
      .map((line) => {
        const image = parseEmailImageLine(line);
        if (image) return `${image.alt}: ${image.url}`;
        if (/^---\s*$/.test(line)) return '----------------------------------------';
        return renderEmailInlineText(line.replace(/^#{1,3}\s+/, ''));
      })
      .join('\n')
  );
}

function renderEmailBodyHtml(text: string) {
  const chunks: string[] = [];
  const textBuffer: string[] = [];

  const flushText = () => {
    const textChunk = cleanEmailText(textBuffer.join('\n'));
    textBuffer.length = 0;
    if (!textChunk) return;

    chunks.push(renderEmailFormattedHtml(textChunk));
  };

  for (const line of text.split('\n')) {
    const image = parseEmailImageLine(line);
    if (!image) {
      textBuffer.push(line);
      continue;
    }

    flushText();
    chunks.push(
      `<div style="margin:20px 0"><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt)}" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:12px" /></div>`
    );
  }

  flushText();
  return chunks.join('');
}

export function cleanEmailText(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/^\s+/, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

export function cleanPreviewText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function renderPlainEmailHtml(text: string, previewText: string, footerHtml = '') {
  const preheader = previewText
    ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;font-size:1px;line-height:1px">${escapeHtml(previewText)}</div>`
    : '';

  return `${preheader}${renderEmailBodyHtml(text)}${footerHtml}`;
}

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
      html: renderPlainEmailHtml(body, previewText, MAGNETS_EMAIL_FOOTER_HTML),
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
