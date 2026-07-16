const markdownLinkPattern = /\[([^\]\n]{1,500})\]\(([^)\s]+)\)/g;
const bareLinkPattern = /(?:https?:\/\/|www\.)[^\s<]+/gi;
const trailingPunctuationPattern = /[.,!?;:)\]}]$/;

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

  for (const match of value.matchAll(markdownLinkPattern)) {
    const index = match.index ?? 0;
    const raw = match[0];
    const label = match[1] || '';
    const href = normaliseEmailLinkUrl(match[2] || '');

    output += renderBareLinksHtml(value.slice(cursor, index), anchorStyle);
    output += href
      ? `<a href="${escapeHtml(href)}" style="${anchorStyle}">${escapeHtml(label)}</a>`
      : escapeHtml(raw);
    cursor = index + raw.length;
  }

  return output + renderBareLinksHtml(value.slice(cursor), anchorStyle);
}

export function renderEmailInlineHtml(value: string) {
  return renderEmailInlineHtmlWithStyle(value, 'color:#111827;text-decoration:underline');
}

export function renderEmailEditorHtml(value: string) {
  return renderEmailInlineHtmlWithStyle(
    value,
    'color:inherit;text-decoration:underline;text-underline-offset:2px'
  );
}

export function renderEmailInlineText(value: string) {
  return value.replace(markdownLinkPattern, (_match, label: string, rawUrl: string) => {
    const href = normaliseEmailLinkUrl(rawUrl);
    if (!href) return _match;
    return label === href || label === rawUrl ? href : `${label} (${href})`;
  });
}
