const markdownLinkPattern = /\[([^\]\n]{1,500})\]\(([^)\s]+)\)/g;
const inlineMarkupPattern = /\[([^\]\n]{1,500})\]\(([^)\s]+)\)|\*\*\*([^*\n]+)\*\*\*|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
const bareLinkPattern = /(?:https?:\/\/|www\.)[^\s<]+/gi;
const trailingPunctuationPattern = /[.,!?;:)\]}]$/;

type EmailMarkupVariant = 'editor' | 'email';

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
      h1: 'margin:0.35em 0 0.5em;font-size:1.75rem;line-height:1.2;font-weight:700',
      h2: 'margin:0.4em 0 0.5em;font-size:1.4rem;line-height:1.25;font-weight:700',
      h3: 'margin:0.45em 0 0.5em;font-size:1.15rem;line-height:1.3;font-weight:700',
      hr: 'margin:1.25rem 0;border:0;border-top:1px solid #d4d4d4',
      list: 'margin:0.75rem 0;padding-left:1.5rem',
      paragraph: 'margin:0 0 0.9rem',
    };
  }

  return {
    h1: 'margin:24px 0 12px;font:700 30px/1.2 Arial,sans-serif;color:#111827',
    h2: 'margin:22px 0 10px;font:700 24px/1.25 Arial,sans-serif;color:#111827',
    h3: 'margin:20px 0 8px;font:700 19px/1.3 Arial,sans-serif;color:#111827',
    hr: 'margin:24px 0;border:0;border-top:1px solid #d1d5db',
    list: 'margin:14px 0;padding-left:24px;font:16px/1.5 Arial,sans-serif;color:#111827',
    paragraph: 'margin:0 0 16px;font:16px/1.5 Arial,sans-serif;color:#111827',
  };
}

function isBlockStart(line: string) {
  return /^(?:#{1,3}\s+|---\s*$|[-*–—]\s+|\d+\.\s+)/.test(line);
}

export function renderEmailFormattedHtml(value: string, variant: EmailMarkupVariant = 'email') {
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

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      output.push(
        `<h${level} style="${styles[`h${level}`]}">${renderEmailInlineHtmlWithStyle(heading[2], anchorStyle)}</h${level}>`
      );
      index += 1;
      continue;
    }

    if (/^---\s*$/.test(line)) {
      output.push(`<hr style="${styles.hr}" />`);
      index += 1;
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
