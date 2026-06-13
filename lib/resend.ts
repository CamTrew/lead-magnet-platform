import { Resend } from 'resend';
import type { AccountSettings, LeadMagnet } from './types';

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
}) {
  if (!account.resendApiKey) {
    console.info('Skipping Resend send because the account has no Resend API key configured.');
    return { data: { id: 'local-preview' }, error: null };
  }

  const resend = new Resend(account.resendApiKey);
  const body = magnet.emailBody
    .replace(/{name}/g, name)
    .replace(/{download_link}/g, magnet.downloadLink);
  const text = body.includes(magnet.downloadLink) ? body : `${body}\n\n${magnet.downloadLink}`;
  const buttonLabel = magnet.ctaText.trim() || 'Download';

  return resend.emails.send({
    from: account.resendFromEmail,
    to,
    subject: magnet.emailSubject,
    text,
    html: `
      <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(magnet.emailPreview)}</div>
      <main style="margin:0;background:#f8f5ff;padding:32px;font-family:Arial,sans-serif;color:#25193b">
        <section style="margin:0 auto;max-width:640px;border:1px solid #e5defb;background:#ffffff;border-radius:8px;padding:40px">
          <p style="margin:0 0 28px;color:${escapeHtml(account.brand.primary)};font-size:22px;font-weight:800">${escapeHtml(account.logoText)}</p>
          <div style="font-size:16px;line-height:1.7;color:#4a405c">${renderParagraphs(text)}</div>
          <p style="margin:32px 0 0">
            <a href="${escapeHtml(magnet.downloadLink)}" style="display:inline-block;background:${escapeHtml(account.brand.primary)};color:white;border-radius:8px;padding:14px 22px;text-decoration:none;font-weight:700">
              ${escapeHtml(buttonLabel)}
            </a>
          </p>
        </section>
        <p style="margin:24px auto 0;max-width:640px;text-align:center;font-size:12px;color:#8a7fa3">
          Lead magnet sent with <a href="https://magnets.so" style="color:#6d55ff;text-decoration:none;font-weight:700">magnets.so</a>
        </p>
      </main>
    `,
  });
}
