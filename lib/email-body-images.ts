export type EmailBodySegment =
  | { kind: 'text'; raw: string }
  | { kind: 'image'; alt: string; raw: string; url: string };

const emailImageLinePattern = /^!\[([^\]\n]{0,120})\]\((https?:\/\/[^\s)]+)\)$/;

export function parseEmailImageLine(line: string) {
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

export function appendEmailImage(body: string, imageUrl: string, alt = 'Image') {
  const safeAlt = alt.replace(/[\]\n\r]/g, '').trim() || 'Image';
  return [body.trimEnd(), `![${safeAlt}](${imageUrl})`, '']
    .filter((part, index) => Boolean(part) || index === 2)
    .join('\n\n');
}

export function parseEmailBodySegments(body: string): EmailBodySegment[] {
  const imagePattern = /^!\[([^\]\n]{0,120})\]\((https?:\/\/[^\s)]+)\)$/gm;
  const segments: EmailBodySegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = imagePattern.exec(body)) !== null) {
    segments.push({ kind: 'text', raw: body.slice(cursor, match.index) });
    segments.push({
      kind: 'image',
      alt: match[1]?.trim() || 'Email image',
      raw: match[0],
      url: match[2],
    });
    cursor = match.index + match[0].length;
  }

  segments.push({ kind: 'text', raw: body.slice(cursor) });
  return segments;
}

export function replaceEmailBodySegment(body: string, segmentIndex: number, nextValue: string) {
  return parseEmailBodySegments(body)
    .map((segment, index) => index === segmentIndex ? nextValue : segment.raw)
    .join('');
}

export function removeEmailBodySegment(body: string, segmentIndex: number) {
  return parseEmailBodySegments(body)
    .filter((_, index) => index !== segmentIndex)
    .map((segment) => segment.raw)
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
