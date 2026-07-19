export type EmailImage = { alt: string; url: string };

export type EmailBodySegment =
  | { kind: 'text'; raw: string }
  | ({ kind: 'image'; raw: string } & EmailImage)
  | { kind: 'image-row'; images: EmailImage[]; raw: string };

export type EmailBodyBlock = EmailBodySegment;

export type EmailImageInsertion = {
  after?: string;
  bodyAfter?: string;
  bodyBefore?: string;
  before?: string;
  mode: 'single' | 'row' | 'beside';
  segmentIndex: number;
  targetMedia?: string;
};

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

/**
 * Image rows deliberately use a small Markdown-compatible extension instead
 * of stored HTML. That keeps existing bodies readable, gives the copilot a
 * safe representation to preserve, and lets the server own all final HTML.
 *
 * ![First](https://...) || ![Second](https://...)
 */
export function parseEmailImageRowLine(line: string) {
  const parts = line.trim().split(/\s+\|\|\s+/);
  if (parts.length < 2 || parts.length > 3) return null;

  const images = parts.map(parseEmailImageLine);
  if (images.some((image) => !image)) return null;
  return images as EmailImage[];
}

function safeImageAlt(value: string) {
  return value.replace(/[\]\n\r]/g, '').trim().slice(0, 120) || 'Image';
}

export function emailImageMarkdown(image: EmailImage) {
  return `![${safeImageAlt(image.alt)}](${image.url})`;
}

export function emailImageRowMarkdown(images: EmailImage[]) {
  return images.slice(0, 3).map(emailImageMarkdown).join(' || ');
}

export function appendEmailImage(body: string, imageUrl: string, alt = 'Image') {
  return [body.trim(), emailImageMarkdown({ alt, url: imageUrl })].filter(Boolean).join('\n\n');
}

export function parseEmailBodySegments(body: string): EmailBodySegment[] {
  const segments: EmailBodySegment[] = [];
  let cursor = 0;

  for (const match of body.matchAll(/^.*$/gm)) {
    const raw = match[0];
    const row = parseEmailImageRowLine(raw);
    const image = row ? null : parseEmailImageLine(raw);
    if (!row && !image) continue;

    const index = match.index ?? 0;
    segments.push({ kind: 'text', raw: body.slice(cursor, index) });
    if (row) segments.push({ kind: 'image-row', images: row, raw });
    else segments.push({ kind: 'image', ...image!, raw });
    cursor = index + raw.length;
  }

  segments.push({ kind: 'text', raw: body.slice(cursor) });
  return segments;
}

/**
 * Editor-facing view of the body. Stored emails remain the same readable
 * Markdown-like string, but blank-line-separated text is exposed as discrete
 * blocks so Enter, reordering, duplication, and media insertion can operate on
 * one item at a time. Single newlines remain soft line breaks inside a block.
 */
export function parseEmailBodyBlocks(body: string): EmailBodyBlock[] {
  const blocks = parseEmailBodySegments(body).flatMap<EmailBodyBlock>((segment) => {
    if (segment.kind !== 'text') return [segment];

    return segment.raw
      .split(/\n{2,}/)
      .map((raw) => raw.trim())
      .filter(Boolean)
      .map((raw) => ({ kind: 'text' as const, raw }));
  });

  return blocks.length > 0 ? blocks : [{ kind: 'text', raw: '' }];
}

export function serializeEmailBodyBlocks(blocks: EmailBodyBlock[]) {
  return blocks
    .map((block) => block.raw.trim())
    .filter(Boolean)
    .join('\n\n');
}

function imagesInEmailBodyBlock(block: EmailBodyBlock) {
  if (block.kind === 'image') return [{ alt: block.alt, url: block.url }];
  if (block.kind === 'image-row') return block.images;
  return [];
}

/**
 * Combines two existing media blocks without changing their surrounding text.
 * The generic return type deliberately preserves editor-only fields (such as
 * stable React ids) attached to the blocks by the client.
 */
export function mergeEmailImageBlocks<T extends EmailBodyBlock>(
  blocks: T[],
  sourceIndex: number,
  targetIndex: number,
  placement: 'before' | 'after'
) {
  if (sourceIndex === targetIndex) return blocks;

  const source = blocks[sourceIndex];
  const target = blocks[targetIndex];
  if (!source || !target) return blocks;

  const sourceImages = imagesInEmailBodyBlock(source);
  const targetImages = imagesInEmailBodyBlock(target);
  if (
    sourceImages.length === 0
    || targetImages.length === 0
    || sourceImages.length + targetImages.length > 3
  ) return blocks;

  const images = placement === 'before'
    ? [...sourceImages, ...targetImages]
    : [...targetImages, ...sourceImages];
  const mergedTarget = {
    ...target,
    kind: 'image-row' as const,
    images,
    raw: emailImageRowMarkdown(images),
  } as T;

  return blocks.flatMap((block, index) => {
    if (index === sourceIndex) return [];
    if (index === targetIndex) return [mergedTarget];
    return [block];
  });
}

function joinInsertedSegments(rawSegments: string[]) {
  return rawSegments
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('\n\n');
}

export function insertEmailImages(
  body: string,
  insertion: EmailImageInsertion,
  images: EmailImage[]
) {
  const cleanImages = images.slice(0, insertion.mode === 'single' ? 1 : 3);
  if (cleanImages.length === 0) return body;

  if (insertion.mode === 'beside') {
    const explicitRow = insertion.targetMedia
      ? parseEmailImageRowLine(insertion.targetMedia)
      : null;
    const explicitImage = insertion.targetMedia && !explicitRow
      ? parseEmailImageLine(insertion.targetMedia)
      : null;
    const explicitImages = explicitRow || (explicitImage ? [explicitImage] : []);

    if (
      explicitImages.length > 0
      && explicitImages.length < 3
      && (insertion.bodyBefore !== undefined || insertion.bodyAfter !== undefined)
    ) {
      return joinInsertedSegments([
        insertion.bodyBefore ?? '',
        emailImageRowMarkdown([...explicitImages, ...cleanImages]),
        insertion.bodyAfter ?? '',
      ]);
    }

    const blocks = parseEmailBodyBlocks(body);
    const target = blocks[insertion.segmentIndex];
    if (target?.kind === 'image') {
      const row = emailImageRowMarkdown([
        { alt: target.alt, url: target.url },
        ...cleanImages,
      ]);
      return joinInsertedSegments(
        blocks.map((block, index) => index === insertion.segmentIndex ? row : block.raw)
      );
    }
    if (target?.kind === 'image-row' && target.images.length < 3) {
      const row = emailImageRowMarkdown([...target.images, ...cleanImages]);
      return joinInsertedSegments(
        blocks.map((block, index) => index === insertion.segmentIndex ? row : block.raw)
      );
    }
  }

  const media = cleanImages.length > 1 || insertion.mode === 'row'
    ? emailImageRowMarkdown(cleanImages)
    : emailImageMarkdown(cleanImages[0]);

  if (insertion.bodyBefore !== undefined || insertion.bodyAfter !== undefined) {
    return joinInsertedSegments([
      insertion.bodyBefore ?? '',
      media,
      insertion.bodyAfter ?? '',
    ]);
  }

  // Calls made before the block editor used indexes from the original segment
  // parser, where all adjacent text belonged to one segment. Keep that path so
  // delayed uploads and older clients cannot duplicate paragraph content.
  const segments = parseEmailBodySegments(body);
  const target = segments[insertion.segmentIndex];
  if (target?.kind === 'text') {
    return joinInsertedSegments(
      segments.flatMap((segment, index) => index === insertion.segmentIndex
        ? [insertion.before ?? segment.raw, media, insertion.after ?? '']
        : [segment.raw])
    );
  }

  return joinInsertedSegments([...segments.map((segment) => segment.raw), media]);
}

export function replaceEmailBodyBlock(body: string, blockIndex: number, nextValue: string) {
  const blocks = parseEmailBodyBlocks(body).map((block, index) => ({
    ...block,
    raw: index === blockIndex ? nextValue : block.raw,
  }));
  return serializeEmailBodyBlocks(blocks);
}

export function removeEmailBodyBlock(body: string, blockIndex: number) {
  const blocks = parseEmailBodyBlocks(body).filter((_, index) => index !== blockIndex);
  return serializeEmailBodyBlocks(blocks);
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
      (segment.kind !== 'text' || previous?.kind !== 'text');

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
