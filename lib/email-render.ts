import {
  parseEmailImageLine,
  parseEmailImageRowLine,
} from './email-body-images';
import { renderEmailFormattedHtml, renderEmailInlineText } from './email-body-links';

export const MAGNETS_EMAIL_FOOTER_TEXT = 'Powered by Magnets: https://magnets.so';
export const MAGNETS_EMAIL_FOOTER_HTML = '<table class="magnets-email-footer" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#080d18;border-radius:0 0 12px 12px"><tr><td align="center" style="padding:30px 20px"><a href="https://magnets.so" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:11px 16px;background:#ffffff;border:1px solid #d6d3d1;border-radius:6px;font:600 14px/20px Arial,sans-serif;color:#292524;text-decoration:none"><img src="https://magnets.so/brand/magnets-mark.png" alt="" width="22" height="22" style="display:inline-block;width:22px;height:22px;margin-right:8px;border:0;vertical-align:middle" /><span style="vertical-align:middle">Powered by Magnets</span></a></td></tr></table>';

export function escapeEmailHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

export function renderEmailTextFallback(text: string) {
  return cleanEmailText(
    text
      .split('\n')
      .map((line) => {
        const row = parseEmailImageRowLine(line);
        if (row) return row.map((image) => `${image.alt}: ${image.url}`).join('\n');
        const image = parseEmailImageLine(line);
        if (image) return `${image.alt}: ${image.url}`;
        if (/^---\s*$/.test(line)) return '----------------------------------------';
        return renderEmailInlineText(line.replace(/^#{1,3}\s+/, ''));
      })
      .join('\n')
  );
}

function renderSingleImage(image: { alt: string; url: string }) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0"><tr><td align="center"><img src="${escapeEmailHtml(image.url)}" alt="${escapeEmailHtml(image.alt)}" width="440" style="display:block;width:100%;max-width:440px;height:auto;margin:0 auto;border:0;border-radius:12px" /></td></tr></table>`;
}

function renderImageRow(images: Array<{ alt: string; url: string }>) {
  const width = Math.floor(100 / images.length);
  const cells = images.map((image, index) => {
    const side = index === 0 ? 'right' : index === images.length - 1 ? 'left' : 'left-right';
    return `<td class="magnets-image-column magnets-image-column--${side}" width="${width}%" valign="top" style="width:${width}%;padding:${index === 0 ? '0 6px 0 0' : index === images.length - 1 ? '0 0 0 6px' : '0 6px'}"><img src="${escapeEmailHtml(image.url)}" alt="${escapeEmailHtml(image.alt)}" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:12px" /></td>`;
  }).join('');

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;table-layout:fixed"><tr>${cells}</tr></table>`;
}

export function renderEmailBodyHtml(text: string) {
  const chunks: string[] = [];
  const textBuffer: string[] = [];

  const flushText = () => {
    const textChunk = cleanEmailText(textBuffer.join('\n'));
    textBuffer.length = 0;
    if (textChunk) chunks.push(renderEmailFormattedHtml(textChunk));
  };

  for (const line of text.split('\n')) {
    const row = parseEmailImageRowLine(line);
    if (row) {
      flushText();
      chunks.push(renderImageRow(row));
      continue;
    }

    const image = parseEmailImageLine(line);
    if (image) {
      flushText();
      chunks.push(renderSingleImage(image));
      continue;
    }

    textBuffer.push(line);
  }

  flushText();
  return chunks.join('');
}

export function renderPlainEmailHtml(
  text: string,
  previewText: string,
  footerHtml = ''
) {
  const preheader = previewText
    ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;font-size:1px;line-height:1px">${escapeEmailHtml(previewText)}</div>`
    : '';
  const content = renderEmailBodyHtml(text);
  const footerRow = footerHtml
    ? `<tr><td class="magnets-email-footer-cell" style="padding:0">${footerHtml}</td></tr>`
    : '';

  return `${preheader}<style>@media only screen and (max-width:520px){.magnets-email-shell{padding:0!important}.magnets-email-card{border-radius:0!important;border-left:0!important;border-right:0!important}.magnets-email-content{padding:24px 18px!important}.magnets-email-footer{border-radius:0!important}.magnets-image-column{display:block!important;width:100%!important;padding:0 0 12px!important}}</style><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0;background:#ffffff"><tr><td class="magnets-email-shell" align="center" style="padding:32px 16px"><table class="magnets-email-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:14px"><tr><td class="magnets-email-content" style="padding:34px 24px;font-family:Arial,sans-serif;color:#111827">${content}</td></tr>${footerRow}</table></td></tr></table>`;
}

export function renderFollowUpOptOutHtml(stopUrl: string) {
  return `<div class="magnets-email-opt-out" style="padding:18px 24px 22px;border-top:1px solid #e5e7eb;font:13px/1.5 Arial,sans-serif;color:#6b7280">Don't want these follow-up emails? <a href="${escapeEmailHtml(stopUrl)}" style="color:#374151;text-decoration:underline">Stop this sequence</a>.</div>`;
}

/**
 * Shared by the editor preview and the delivery provider payload. Keeping the
 * complete renderer here makes the preview a sample-data view of the exact
 * HTML that is sent instead of a second approximation of it.
 */
export function renderDeliveryEmailHtml(body: string, previewText: string) {
  return renderPlainEmailHtml(
    cleanEmailText(body),
    cleanPreviewText(previewText),
    MAGNETS_EMAIL_FOOTER_HTML
  );
}

export function renderFollowUpEmailHtml(
  body: string,
  previewText: string,
  stopUrl: string
) {
  return renderPlainEmailHtml(
    cleanEmailText(body),
    cleanPreviewText(previewText),
    `${renderFollowUpOptOutHtml(stopUrl)}${MAGNETS_EMAIL_FOOTER_HTML}`
  );
}
