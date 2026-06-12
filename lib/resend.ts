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
    console.info('Skipping Resend send because this account has no Resend API key.');
    return { data: { id: 'local-stub' }, error: null };
  }

  const resend = new Resend(account.resendApiKey);
  const body = magnet.emailBody
    .replace(/{name}/g, name)
    .replace(/{download_link}/g, magnet.downloadLink);
  const text = body.includes(magnet.downloadLink) ? body : `${body}\n\n${magnet.downloadLink}`;

  return resend.emails.send({
    from: account.resendFromEmail,
    to,
    subject: magnet.emailSubject,
    text,
    html: `
      <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(magnet.emailPreview)}</div>
      <main style="margin:0;background:#f0f9f9;padding:32px;font-family:Arial,sans-serif;color:#1f2937">
        <section style="margin:0 auto;max-width:640px;border:1px solid #b3e0e0;background:white;border-radius:24px;padding:40px">
          <p style="margin:0 0 28px;color:${escapeHtml(account.brand.primary)};font-size:22px;font-weight:800">${escapeHtml(account.name)}</p>
          <div style="font-size:16px;line-height:1.7">${renderParagraphs(text)}</div>
          <p style="margin:32px 0 0">
            <a href="${escapeHtml(magnet.downloadLink)}" style="display:inline-block;background:${escapeHtml(account.brand.primary)};color:white;border-radius:16px;padding:14px 22px;text-decoration:none;font-weight:700">
              Open the resource
            </a>
          </p>
        </section>
      </main>
    `,
  });
}

