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
  return [body.trim(), `![${safeAlt}](${imageUrl})`].filter(Boolean).join('\n\n');
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
  const segments = parseEmailBodySegments(body).map((segment, index) => ({
    ...segment,
    raw: index === segmentIndex ? nextValue : segment.raw,
  }));

  return segments.reduce((output, segment, index) => {
    if (!segment.raw) return output;

    const previous = segments[index - 1];
    const needsSeparator =
      Boolean(output) &&
      (segment.kind === 'image' || previous?.kind === 'image');

    if (!needsSeparator) return output + segment.raw;
    if (output.endsWith('\n\n') || segment.raw.startsWith('\n\n')) {
      return output + segment.raw;
    }
    if (output.endsWith('\n') || segment.raw.startsWith('\n')) {
      return `${output}\n${segment.raw}`;
    }
    return `${output}\n\n${segment.raw}`;
  }, '');
}

export function removeEmailBodySegment(body: string, segmentIndex: number) {
  return parseEmailBodySegments(body)
    .filter((_, index) => index !== segmentIndex)
    .map((segment) => segment.raw)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('\n\n');
}
