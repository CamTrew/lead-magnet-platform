// AI/MAINTAINER CONTEXT:
// This is shared by the editor preview and actual email renderer. Keep URL
// normalization and structural-token parsing deterministic. YouTube content
// becomes a linked thumbnail because real email clients do not reliably allow
// iframe embeds; never make preview promise an iframe the delivered email loses.
const markdownLinkPattern = /\[([^\]\n]{1,500})\]\(([^)\s]+)\)/g;
const inlineMarkupPattern = /\[([^\]\n]{1,500})\]\(([^)\s]+)\)|\*\*\*([^*\n]+)\*\*\*|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
const bareLinkPattern = /(?:https?:\/\/|www\.)[^\s<]+/gi;
const trailingPunctuationPattern = /[.,!?;:)\]}]$/;

type EmailMarkupVariant = 'editor' | 'email';

export type EmailHeading = {
  id: string;
  label: string;
  level: number;
};

export type EmailMarkupContext = {
  footnoteCursor: { value: number };
  headingCursor: { value: number };
  headings: EmailHeading[];
};

export type YouTubeVideo = {
  id: string;
  thumbnailUrl: string;
  url: string;
};

export function parseYouTubeVideoUrl(value: string): YouTubeVideo | null {
  const candidate = normaliseEmailLinkUrl(value);
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    let id = '';

    if (hostname === 'youtu.be') {
      id = url.pathname.split('/').filter(Boolean)[0] || '';
    } else if (
      hostname === 'youtube.com'
      || hostname === 'm.youtube.com'
      || hostname === 'music.youtube.com'
      || hostname === 'youtube-nocookie.com'
    ) {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      else id = url.pathname.match(/^\/(?:embed|live|shorts)\/([^/?#]+)/)?.[1] || '';
    }

    if (!/^[a-zA-Z0-9_-]{6,20}$/.test(id)) return null;
    return {
      id,
      thumbnailUrl: `https://magnets.so/youtube-thumbnails/${id}`,
      url: `https://www.youtube.com/watch?v=${id}`,
    };
  } catch {
    return null;
  }
}

export function normaliseEmailLinkUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return null;
    if (url.protocol !== 'mailto:' && !url.hostname) return null;
    if (url.protocol === 'mailto:' && !url.pathname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function insertEmailLink(
  text: string,
  start: number,
  end: number,
  label: string,
  rawUrl: string
) {
  const cleanLabel = label.replace(/\s+/g, ' ').replace(/[\[\]]/g, '').trim();
  const url = normaliseEmailLinkUrl(rawUrl);

  if (!cleanLabel || !url) return null;

  const markdown = `[${cleanLabel}](${url})`;
  return {
    cursor: start + markdown.length,
    text: `${text.slice(0, start)}${markdown}${text.slice(end)}`,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function splitTrailingPunctuation(value: string) {
  let url = value;
  let trailing = '';

  while (url && trailingPunctuationPattern.test(url)) {
    trailing = `${url.slice(-1)}${trailing}`;
    url = url.slice(0, -1);
  }

  return { trailing, url };
}

function renderBareLinksHtml(value: string, anchorStyle: string) {
  let output = '';
  let cursor = 0;

  for (const match of value.matchAll(bareLinkPattern)) {
    const index = match.index ?? 0;
    const raw = match[0];
    const { trailing, url: visibleUrl } = splitTrailingPunctuation(raw);
    const href = normaliseEmailLinkUrl(visibleUrl);

    output += escapeHtml(value.slice(cursor, index));
    output += href
      ? `<a href="${escapeHtml(href)}" style="${anchorStyle}">${escapeHtml(visibleUrl)}</a>${escapeHtml(trailing)}`
      : escapeHtml(raw);
    cursor = index + raw.length;
  }

  return output + escapeHtml(value.slice(cursor));
}

function renderEmailInlineHtmlWithStyle(value: string, anchorStyle: string) {
  let output = '';
  let cursor = 0;

  for (const match of value.matchAll(inlineMarkupPattern)) {
    const index = match.index ?? 0;
    const raw = match[0];

    output += renderBareLinksHtml(value.slice(cursor, index), anchorStyle);

    if (match[1] !== undefined) {
      const label = match[1] || '';
      const href = normaliseEmailLinkUrl(match[2] || '');
      output += href
        ? `<a href="${escapeHtml(href)}" style="${anchorStyle}">${escapeHtml(label)}</a>`
        : escapeHtml(raw);
    } else if (match[3] !== undefined) {
      output += `<strong style="font-weight:700"><em style="font-style:italic">${renderEmailInlineHtmlWithStyle(match[3], anchorStyle)}</em></strong>`;
    } else if (match[4] !== undefined) {
      output += `<strong style="font-weight:700">${renderEmailInlineHtmlWithStyle(match[4], anchorStyle)}</strong>`;
    } else if (match[5] !== undefined) {
      output += `<em style="font-style:italic">${renderEmailInlineHtmlWithStyle(match[5], anchorStyle)}</em>`;
    } else {
      output += escapeHtml(raw);
    }
    cursor = index + raw.length;
  }

  return output + renderBareLinksHtml(value.slice(cursor), anchorStyle);
}

function blockStyles(variant: EmailMarkupVariant) {
  if (variant === 'editor') {
    return {
      h1: 'margin:0.35em 0 0.8em;font-size:1.75rem;line-height:1.2;font-weight:700',
      h2: 'margin:0.4em 0 0.8em;font-size:1.4rem;line-height:1.25;font-weight:700',
      h3: 'margin:0.45em 0 0.7em;font-size:1.15rem;line-height:1.3;font-weight:700',
      h4: 'margin:0.5em 0 0.65em;font-size:1rem;line-height:1.35;font-weight:700',
      h5: 'margin:0.55em 0 0.6em;font-size:0.9rem;line-height:1.4;font-weight:700',
      h6: 'margin:0.6em 0 0.6em;font-size:0.8rem;line-height:1.4;font-weight:700',
      hr: 'margin:1.25rem 0;border:0;border-top:1px solid #d4d4d4',
      list: 'margin:0.75rem 0;padding-left:1.5rem',
      paragraph: 'margin:0 0 0.9rem',
      quote: 'margin:1rem 0;border-left:3px solid #111827;padding:0.15rem 0 0.15rem 1rem;font-style:italic;color:#374151',
      quoteCenter: 'margin:1.25rem 0;padding:0.75rem 1rem;text-align:center;font-size:1.1rem;line-height:1.55;font-style:italic;color:#374151',
      quoteSide: 'margin:1rem 0;border-left:5px solid #111827;padding:0.25rem 0 0.25rem 1rem;font-size:1.05rem;line-height:1.55;font-weight:600;color:#1f2937',
    };
  }

  return {
    h1: 'margin:24px 0 22px;font:700 30px/1.2 Arial,sans-serif;color:#111827',
    h2: 'margin:22px 0 20px;font:700 24px/1.25 Arial,sans-serif;color:#111827',
    h3: 'margin:20px 0 16px;font:700 19px/1.3 Arial,sans-serif;color:#111827',
    h4: 'margin:18px 0 14px;font:700 17px/1.35 Arial,sans-serif;color:#111827',
    h5: 'margin:17px 0 12px;font:700 15px/1.4 Arial,sans-serif;color:#111827',
    h6: 'margin:16px 0 12px;font:700 13px/1.4 Arial,sans-serif;color:#111827',
    hr: 'margin:24px 0;border:0;border-top:1px solid #d1d5db',
    list: 'margin:14px 0;padding-left:24px;font:16px/1.5 Arial,sans-serif;color:#111827',
    paragraph: 'margin:0 0 16px;font:16px/1.5 Arial,sans-serif;color:#111827',
    quote: 'margin:20px 0;border-left:4px solid #111827;padding:2px 0 2px 18px;font:italic 18px/1.5 Arial,sans-serif;color:#374151',
    quoteCenter: 'margin:24px 0;padding:12px 20px;text-align:center;font:italic 19px/1.55 Arial,sans-serif;color:#374151',
    quoteSide: 'margin:20px 0;border-left:6px solid #111827;padding:4px 0 4px 18px;font:600 18px/1.55 Arial,sans-serif;color:#1f2937',
  };
}

function isBlockStart(line: string) {
  return /^(?:#{1,6}\s+|>{1,3}\s+|:::spacer\s*$|:::section(?:\s+|$)|:::columns\s+|:::footnote(?:\s+|$)|:::youtube(?:\s+|$)|\[\[toc\]\]\s*$|---\s*$|[-*–—]\s+|\d+\.\s+)/.test(line);
}

function headingIdBase(value: string) {
  return renderEmailInlineText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'section';
}

export function collectEmailHeadings(value: string): EmailHeading[] {
  const occurrences = new Map<string, number>();
  return value.replace(/\r\n?/g, '\n').split('\n').flatMap((line) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) return [];
    const base = headingIdBase(match[2]);
    const occurrence = (occurrences.get(base) || 0) + 1;
    occurrences.set(base, occurrence);
    return [{
      id: `email-heading-${base}${occurrence > 1 ? `-${occurrence}` : ''}`,
      label: renderEmailInlineText(match[2]),
      level: match[1].length,
    }];
  });
}

function renderTableOfContents(
  variant: EmailMarkupVariant,
  context?: EmailMarkupContext
) {
  if (variant === 'editor') {
    return '<div data-email-toc="true" contenteditable="false" style="margin:1rem 0;padding:0.8rem 1rem;border:1px solid #d4d4d4;border-radius:8px;background:#fafafa;color:#525252;font-size:0.85rem;font-weight:600">Table of contents <span style="font-weight:400;color:#737373">· generated from headings</span></div>';
  }

  const headings = context?.headings || [];
  if (headings.length === 0) return '';
  const items = headings.map((heading) => (
    `<li style="margin:6px 0 6px ${Math.max(0, heading.level - 1) * 12}px"><a href="#${escapeHtml(heading.id)}" style="color:#111827;text-decoration:underline">${escapeHtml(heading.label)}</a></li>`
  )).join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;background:#fafafa;border:1px solid #e5e7eb;border-radius:10px"><tr><td style="padding:18px 20px;font:16px/1.5 Arial,sans-serif;color:#111827"><strong style="display:block;margin-bottom:8px">In this email</strong><ol style="margin:0;padding-left:22px">${items}</ol></td></tr></table>`;
}

export function renderEmailFormattedHtml(
  value: string,
  variant: EmailMarkupVariant = 'email',
  context?: EmailMarkupContext
) {
  const anchorStyle = variant === 'editor'
    ? 'color:inherit;text-decoration:underline;text-underline-offset:2px'
    : 'color:#111827;text-decoration:underline';
  const styles = blockStyles(variant);
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      const headingRecord = variant === 'email' && context
        ? context.headings[context.headingCursor.value++]
        : null;
      const idAttribute = headingRecord ? ` id="${escapeHtml(headingRecord.id)}"` : '';
      output.push(
        `<h${level}${idAttribute} style="${styles[`h${level}`]}">${renderEmailInlineHtmlWithStyle(heading[2], anchorStyle)}</h${level}>`
      );
      index += 1;
      continue;
    }

    if (/^:::spacer\s*$/.test(line)) {
      output.push(variant === 'editor'
        ? '<div data-email-spacer="true" contenteditable="false" style="height:1.5rem;min-height:1.5rem" aria-hidden="true">&nbsp;</div>'
        : '<table class="magnets-email-spacer" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td height="24" style="height:24px;font-size:0;line-height:0">&nbsp;</td></tr></table>');
      index += 1;
      continue;
    }

    if (/^---\s*$/.test(line)) {
      output.push(`<hr style="${styles.hr}" />`);
      index += 1;
      continue;
    }

    const section = line.match(/^:::section(?:\s+(.+))?$/);
    if (section) {
      const label = renderEmailInlineHtmlWithStyle(section[1] || 'Section', anchorStyle);
      output.push(variant === 'editor'
        ? `<div data-email-section="true" style="margin:1.25rem 0 0.65rem;padding-top:1rem;border-top:1px solid #d4d4d4;font-size:1.15rem;line-height:1.35;font-weight:700">${label}</div>`
        : `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 12px;border-top:1px solid #d1d5db"><tr><td style="padding-top:18px;font:700 19px/1.35 Arial,sans-serif;color:#111827">${label}</td></tr></table>`);
      index += 1;
      continue;
    }

    const columns = line.match(/^:::columns\s+(.+?)\s+\|\|\|\s+(.+)$/);
    if (columns) {
      const left = renderEmailInlineHtmlWithStyle(columns[1], anchorStyle);
      const right = renderEmailInlineHtmlWithStyle(columns[2], anchorStyle);
      output.push(variant === 'editor'
        ? `<div data-email-columns="true" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0.75rem;margin:1rem 0"><div data-email-column="true" style="min-height:3rem;padding:0.75rem;border:1px solid #d4d4d4;border-radius:8px">${left}</div><div data-email-column="true" style="min-height:3rem;padding:0.75rem;border:1px solid #d4d4d4;border-radius:8px">${right}</div></div>`
        : `<table class="magnets-text-columns" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;table-layout:fixed"><tr><td class="magnets-text-column" width="50%" valign="top" style="width:50%;padding:0 8px 0 0;font:16px/1.5 Arial,sans-serif;color:#111827">${left}</td><td class="magnets-text-column" width="50%" valign="top" style="width:50%;padding:0 0 0 8px;font:16px/1.5 Arial,sans-serif;color:#111827">${right}</td></tr></table>`);
      index += 1;
      continue;
    }

    const footnote = line.match(/^:::footnote(?:\s+(.+))?$/);
    if (footnote) {
      const number = context ? ++context.footnoteCursor.value : 1;
      const content = renderEmailInlineHtmlWithStyle(footnote[1] || 'Footnote', anchorStyle);
      output.push(variant === 'editor'
        ? `<div data-email-footnote="true" style="margin:1rem 0;padding-top:0.75rem;border-top:1px solid #d4d4d4;color:#525252;font-size:0.82rem;line-height:1.45"><sup contenteditable="false" style="margin-right:0.35rem;font-weight:700">${number}</sup><span data-email-footnote-content="true">${content}</span></div>`
        : `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0 0;border-top:1px solid #d1d5db"><tr><td style="padding-top:12px;font:13px/1.45 Arial,sans-serif;color:#6b7280"><sup style="margin-right:5px;font-weight:700;color:#374151">${number}</sup>${content}</td></tr></table>`);
      index += 1;
      continue;
    }

    const youtube = line.match(/^:::youtube(?:\s+(.+))?$/);
    if (youtube) {
      const video = parseYouTubeVideoUrl(youtube[1] || '');
      if (video) {
        const safeUrl = escapeHtml(video.url);
        const safeThumbnail = escapeHtml(video.thumbnailUrl);
        output.push(variant === 'editor'
          ? `<div data-email-youtube="true" data-email-youtube-url="${safeUrl}" contenteditable="false" style="margin:1rem 0;overflow:hidden;border:1px solid #d4d4d4;border-radius:12px;background:#0a0a0a"><div style="position:relative;aspect-ratio:16/9;overflow:hidden;background:#111827"><img src="${safeThumbnail}" alt="YouTube video thumbnail" style="display:block;width:100%;height:100%;object-fit:cover"><span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:inline-flex;width:3.5rem;height:3.5rem;align-items:center;justify-content:center;border-radius:999px;background:rgba(0,0,0,0.78);color:#fff;font-size:1.5rem;line-height:1">&#9654;</span></div><div style="padding:0.7rem 0.9rem;color:#fff;font-size:0.82rem;font-weight:600">YouTube video <span style="font-weight:400;color:#d4d4d4">· opens on YouTube</span></div></div>`
          : `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0"><tr><td align="center"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none"><img src="${safeThumbnail}" alt="Watch this video on YouTube" width="520" style="display:block;width:100%;max-width:520px;height:auto;margin:0 auto;border:0;border-radius:12px" /></a><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:10px;padding:10px 16px;background:#111827;border-radius:999px;font:600 14px/20px Arial,sans-serif;color:#ffffff;text-decoration:none">&#9654;&nbsp; Watch on YouTube</a></td></tr></table>`);
      }
      index += 1;
      continue;
    }

    if (/^\[\[toc\]\]\s*$/.test(line)) {
      output.push(renderTableOfContents(variant, context));
      index += 1;
      continue;
    }

    const quote = line.match(/^(>{1,3})\s+(.+)$/);
    if (quote) {
      const marker = quote[1];
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quotedLine = lines[index].match(new RegExp(`^${marker}\\s+(.+)$`));
        if (!quotedLine) break;
        quoteLines.push(renderEmailInlineHtmlWithStyle(quotedLine[1], anchorStyle));
        index += 1;
      }
      const quoteStyle = marker.length === 3
        ? styles.quoteCenter
        : marker.length === 2
          ? styles.quoteSide
          : styles.quote;
      const quoteAttribute = variant === 'editor' && marker.length > 1
        ? ` data-email-quote-style="${marker.length === 3 ? 'center' : 'side'}"`
        : '';
      const content = marker.length === 3
        ? `&ldquo;${quoteLines.join('<br />')}&rdquo;`
        : quoteLines.join('<br />');
      output.push(`<blockquote${quoteAttribute} style="${quoteStyle}">${content}</blockquote>`);
      continue;
    }

    const dashed = line.match(/^[–—]\s+(.+)$/);
    if (dashed) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^[–—]\s+(.+)$/);
        if (!item) break;
        const content = renderEmailInlineHtmlWithStyle(item[1], anchorStyle);
        items.push(
          variant === 'editor'
            ? `<li style="margin:4px 0">${content}</li>`
            : `<li style="margin:4px 0;list-style-type:none"><span style="display:inline-block;width:16px">–</span>${content}</li>`
        );
        index += 1;
      }
      const editorAttribute = variant === 'editor' ? ' data-email-list-style="dash"' : '';
      output.push(
        `<ul${editorAttribute} style="${styles.list};list-style-type:none;padding-left:0">${items.join('')}</ul>`
      );
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^[-*]\s+(.+)$/);
        if (!item) break;
        items.push(`<li style="margin:4px 0">${renderEmailInlineHtmlWithStyle(item[1], anchorStyle)}</li>`);
        index += 1;
      }
      output.push(
        `<ul style="${styles.list};list-style-type:disc;list-style-position:outside">${items.join('')}</ul>`
      );
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\d+\.\s+(.+)$/);
        if (!item) break;
        items.push(`<li style="margin:4px 0">${renderEmailInlineHtmlWithStyle(item[1], anchorStyle)}</li>`);
        index += 1;
      }
      output.push(
        `<ol style="${styles.list};list-style-type:decimal;list-style-position:outside">${items.join('')}</ol>`
      );
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(renderEmailInlineHtmlWithStyle(lines[index], anchorStyle));
      index += 1;
    }
    output.push(`<p style="${styles.paragraph}">${paragraph.join('<br />')}</p>`);
  }

  return output.join('');
}

export function renderEmailInlineHtml(value: string) {
  return renderEmailInlineHtmlWithStyle(value, 'color:#111827;text-decoration:underline');
}

export function renderEmailEditorHtml(value: string) {
  return renderEmailFormattedHtml(value, 'editor');
}

export function renderEmailInlineText(value: string) {
  return value.replace(markdownLinkPattern, (_match, label: string, rawUrl: string) => {
    const href = normaliseEmailLinkUrl(rawUrl);
    if (!href) return _match;
    return label === href || label === rawUrl ? href : `${label} (${href})`;
  })
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1');
}
