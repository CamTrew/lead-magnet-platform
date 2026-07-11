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

const emailImageLinePattern = /^!\[([^\]\n]{0,120})\]\((https?:\/\/[^\s)]+)\)$/;

function parseEmailImageLine(line: string) {
  const match = line.trim().match(emailImageLinePattern);
  if (!match) return null;

  const [, alt = '', rawUrl = ''] = match;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return {
      alt: alt.trim() || 'Email image',
      url: url.toString(),
    };
  } catch {
    return null;
  }
}

export function addEmailImageMarkdown(body: string, imageUrl: string, alt = 'Image') {
  const block = `![${alt.replace(/[\]\n\r]/g, '').trim() || 'Image'}](${imageUrl})`;
  return cleanEmailText([body.trimEnd(), block].filter(Boolean).join('\n\n'));
}

export function renderEmailTextFallback(text: string) {
  return cleanEmailText(
    text
      .split('\n')
      .map((line) => {
        const image = parseEmailImageLine(line);
        return image ? `${image.alt}: ${image.url}` : line;
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

    chunks.push(
      `<div style="white-space:pre-wrap;font:16px/1.5 Arial,sans-serif;color:#111827">${escapeHtml(textChunk)}</div>`
    );
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
  const downloadLink = (magnet.downloadLink || '').trim();
  const body = cleanEmailText(
    magnet.emailBody
      .replace(/{name}/g, name)
      .replace(/{download_link}/g, downloadLink)
  );
  const text = renderEmailTextFallback(body);
  const previewText = cleanPreviewText(magnet.emailPreview);

  let result;
  try {
    result = await resend.emails.send({
      from: account.resendFromEmail,
      to,
      subject: magnet.emailSubject,
      text,
      html: renderPlainEmailHtml(body, previewText),
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
