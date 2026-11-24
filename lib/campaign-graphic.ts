import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { SaxesParser } from 'saxes';
import sharp from 'sharp';

export const GRAPHIC_SOURCE_LIMIT = 24000;
export const GRAPHIC_FORMAT = 'Send compact SVG source (up to 24000 characters), not encoded PNG data. Use an svg root with integer width/height from 256 to 1200 and matching viewBox="0 0 width height". Supported elements: g, rect, circle, ellipse, line, polyline, polygon, path, text, defs, linearGradient, radialGradient and stop. Use explicit presentation attributes and hex colours; local url(#gradientId) fills are allowed. No CSS/style, scripts, images, external URLs, use, filters, clipping, HTML or tspan. Each text element is one line with x, y, font-size (8 to 180) and optional text-anchor (start/middle/end). Text uses bundled Geist. Keep the drawing faithful to the resource and saved brand. Never redraw an inaccessible logo.';

type Node = { tag: string; attrs: Record<string, string>; children: Node[]; text: string };
const tags = new Set(['svg', 'g', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'defs', 'linearGradient', 'radialGradient', 'stop']);
const numeric = new Set(['x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'fx', 'fy', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'stop-opacity', 'offset', 'font-size']);
const enums: Record<string, string[]> = {
  'text-anchor': ['start', 'middle', 'end'], 'font-family': ['Geist', 'sans-serif'],
  'font-weight': ['400', 'normal'], 'stroke-linecap': ['butt', 'round', 'square'],
  'stroke-linejoin': ['miter', 'round', 'bevel'], 'fill-rule': ['nonzero', 'evenodd'],
  gradientUnits: ['userSpaceOnUse', 'objectBoundingBox'], spreadMethod: ['pad', 'reflect', 'repeat'],
};
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const fail = (): never => { throw new Error(`Unsupported graphic. ${GRAPHIC_FORMAT}`); };

// Reconstruct only an allowlisted drawing. Never send arbitrary XML, CSS, URLs or
// embedded files to librsvg. The original SVG is neither persisted nor served.
export function parseCampaignGraphic(source: string) {
  if (!source || source.length > GRAPHIC_SOURCE_LIMIT || /<!|<\?/.test(source)) fail();
  let root: Node | undefined;
  const stack: Node[] = [];
  let nodes = 0, textLength = 0;
  const parser = new SaxesParser({ xmlns: false });
  parser.on('error', fail);
  parser.on('opentag', tag => {
    if (!tags.has(tag.name) || ++nodes > 256 || stack.length >= 12 || stack.at(-1)?.tag === 'text') fail();
    if ((!stack.length && (root || tag.name !== 'svg')) || (stack.length && tag.name === 'svg')) fail();
    const node: Node = { tag: tag.name, attrs: {}, children: [], text: '' };
    if (Object.keys(tag.attributes).length > 24) fail();
    for (const [key, value] of Object.entries(tag.attributes)) {
      if (value.length > 6000) fail();
      let valid = false;
      if (key === 'xmlns') valid = tag.name === 'svg' && value === 'http://www.w3.org/2000/svg';
      else if (numeric.has(key)) valid = /^-?\d+(?:\.\d+)?%?$/.test(value) && Math.abs(parseFloat(value)) <= 10000;
      else if (['fill', 'stroke', 'stop-color'].includes(key)) valid = /^(?:#[\da-fA-F]{3}|#[\da-fA-F]{6}|#[\da-fA-F]{8}|none|transparent|url\(#[A-Za-z][\w-]{0,39}\))$/.test(value);
      else if (key === 'id') valid = /^[A-Za-z][\w-]{0,39}$/.test(value);
      else if (key === 'viewBox') valid = /^0 0 \d{3,4} \d{3,4}$/.test(value);
      else if (key === 'd') valid = tag.name === 'path' && /^[MmZzLlHhVvCcSsQqTtAa0-9.,\s+\-]+$/.test(value);
      else if (key === 'points' || key === 'stroke-dasharray') valid = /^[\d.,\s\-]+$/.test(value);
      else if (key === 'transform' || key === 'gradientTransform') valid = /^(?:(?:translate|scale|rotate|matrix|skewX|skewY)\([\d.,\s+\-]+\)\s*){1,8}$/.test(value);
      else if (Object.hasOwn(enums, key)) valid = enums[key].includes(value);
      if (!valid) fail();
      node.attrs[key] = value;
    }
    if (stack.length) stack.at(-1)!.children.push(node); else root = node;
    stack.push(node);
  });
  parser.on('text', text => {
    if (!text.trim()) return;
    const current = stack.at(-1);
    if (!current || current.tag !== 'text') return fail();
    if ((textLength += text.length) > 2000 || /[\u2013\u2014\uFE58\u2e3a\u2e3b]/u.test(text)) fail();
    current.text += text;
  });
  parser.on('closetag', () => { stack.pop(); });
  parser.write(source).close();
  if (!root) return fail();
  const width = Number(root.attrs.width), height = Number(root.attrs.height);
  if (![width, height].every(n => Number.isInteger(n) && n >= 256 && n <= 1200)) fail();
  if (root.attrs.viewBox && root.attrs.viewBox !== `0 0 ${width} ${height}`) fail();
  return { root, width, height, sourceHash: createHash('sha256').update(source).digest('hex') };
}

export async function renderCampaignGraphic(source: string) {
  const parsed = parseCampaignGraphic(source);
  const font = fontkit.create(await readFile(path.join(process.cwd(), 'app/fonts/campaign/regular.ttf')));
  function render(node: Node): string {
    if (node.tag === 'text') {
      const size = Number(node.attrs['font-size'] || 32);
      const x = Number(node.attrs.x || 0), y = Number(node.attrs.y || 0);
      if (!Number.isFinite(x) || !Number.isFinite(y) || size < 8 || size > 180 || !Number.isFinite(size)) fail();
      const run = font.layout(node.text), scale = size / font.unitsPerEm;
      const width = run.positions.reduce((sum, p) => sum + p.xAdvance, 0) * scale;
      const anchor = node.attrs['text-anchor'];
      let cursor = 0;
      const paths = run.glyphs.map((glyph, index) => {
        const position = run.positions[index];
        const left = x - (anchor === 'middle' ? width / 2 : anchor === 'end' ? width : 0);
        const output = `<path transform="translate(${left + (cursor + position.xOffset) * scale} ${y - position.yOffset * scale}) scale(${scale} ${-scale})" d="${glyph.path.toSVG()}"/>`;
        cursor += position.xAdvance;
        return output;
      }).join('');
      const attrs = Object.entries(node.attrs).filter(([key]) => !['x', 'y', 'font-size', 'font-family', 'font-weight', 'text-anchor'].includes(key));
      return `<g ${attrs.map(([k,v]) => `${k}="${escape(v)}"`).join(' ')}>${paths}</g>`;
    }
    return `<${node.tag} ${Object.entries(node.attrs).map(([k,v]) => `${k}="${escape(v)}"`).join(' ')}>${node.children.map(render).join('')}</${node.tag}>`;
  }
  const png = await sharp(Buffer.from(render(parsed.root)), { limitInputPixels: 1440000 })
    .timeout({ seconds: 5 }).png().toBuffer();
  if (png.length > 1024 * 1024) throw new Error('The rendered graphic is over 1 MB. Simplify the drawing and preview again.');
  return { png, sourceHash: parsed.sourceHash, width: parsed.width, height: parsed.height };
}
