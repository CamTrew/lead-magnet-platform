import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import sharp from "sharp";
import type { CampaignPackage } from "./campaign-schema";

export async function renderCampaignPdf(content: CampaignPackage) {
  if ('hostedResource' in content.resource) throw new Error('This campaign uses the original uploaded file, not a generated PDF.');
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(
    await readFile(path.join(process.cwd(), "app/fonts/campaign/regular.ttf")),
    { subset: true },
  );
  document.setTitle(content.title);
  document.setCreator("Magnets");
  const ink = rgb(0.08, 0.08, 0.07),
    muted = rgb(0.38, 0.36, 0.33),
    orange = rgb(0.996, 0.435, 0.204);
  let page = document.addPage([595, 842]),
    y = 770;
  function newPage() {
    page = document.addPage([595, 842]);
    y = 770;
  }
  function line(text: string, size: number, color = ink, checkbox = false) {
    if (y < 75) newPage();
    if (checkbox)
      page.drawRectangle({
        x: 60,
        y: y - 1,
        width: 8,
        height: 8,
        borderColor: muted,
        borderWidth: 0.7,
      });
    const left = checkbox ? 76 : 60,
      available = 535 - left;
    const words = text.replace(/\r/g, "").split(/\s+/);
    let current = "";
    for (const word of words) {
      // Split exceptionally long words so user text never runs off the page.
      const segments: string[] = [];
      let segment = "";
      for (const character of word) {
        if (font.widthOfTextAtSize(segment + character, size) > available) {
          segments.push(segment);
          segment = "";
        }
        segment += character;
      }
      segments.push(segment);
      for (const part of segments) {
        const next = current ? `${current} ${part}` : part;
        if (font.widthOfTextAtSize(next, size) > available && current) {
          if (y < 75) newPage();
          page.drawText(current, { x: left, y, size, font, color });
          y -= size * 1.55;
          current = part;
        } else current = next;
      }
    }
    if (current) {
      if (y < 75) newPage();
      page.drawText(current, { x: left, y, size, font, color });
      y -= size * 1.55;
    }
  }
  page.drawRectangle({ x: 0, y: 814, width: 595, height: 28, color: orange });
  line(content.format.replaceAll("-", " ").toUpperCase(), 10, muted);
  y -= 20;
  line(content.title, 32);
  y -= 18;
  line(content.resource.introduction, 11, muted);
  y -= 20;
  for (const [index, section] of content.resource.sections.entries()) {
    if (y < 180) newPage();
    line(`${String(index + 1).padStart(2, "0")}  ${section.heading}`, 17);
    y -= 8;
    for (const paragraph of section.body.split("\n").filter(Boolean)) {
      line(paragraph, 11, muted);
      y -= 7;
    }
    for (const item of section.items) {
      line(
        content.format === "checklist" ? item : `•  ${item}`,
        11,
        ink,
        content.format === "checklist",
      );
      y -= 7;
    }
    y -= 18;
  }
  if (y < 150) newPage();
  line(content.resource.closing, 11, muted);
  document.getPages().forEach((p, index) => {
    p.drawLine({
      start: { x: 60, y: 48 },
      end: { x: 535, y: 48 },
      thickness: 0.5,
      color: rgb(0.85, 0.83, 0.79),
    });
    p.drawText(`Made with Magnets  /  ${index + 1}`, {
      x: 60,
      y: 30,
      size: 8,
      font,
      color: muted,
    });
  });
  return document.save();
}
export async function renderCampaignCover(content: CampaignPackage) {
  // Convert bundled font glyphs to paths. Serverless hosts need no system fonts.
  const font = fontkit.create(await readFile(path.join(process.cwd(), 'app/fonts/campaign/regular.ttf')));
  function width(text: string, size: number) {
    return font.layout(text).positions.reduce((sum, position) => sum + position.xAdvance, 0) * size / font.unitsPerEm;
  }
  function textPath(text: string, x: number, y: number, size: number, colour: string) {
    const run = font.layout(text), scale = size / font.unitsPerEm;
    let cursor = 0;
    return run.glyphs.map((glyph, index) => {
      const position = run.positions[index];
      const rendered = `<path fill="${colour}" transform="translate(${x + (cursor + position.xOffset) * scale} ${y - position.yOffset * scale}) scale(${scale} ${-scale})" d="${glyph.path.toSVG()}"/>`;
      cursor += position.xAdvance;
      return rendered;
    }).join('');
  }
  const lines: string[] = [];
  let line = '';
  for (const word of content.title.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (width(candidate, 68) > 900 && line) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  const title = lines.slice(0, 5).map((text, index) => textPath(text, 140, 270 + index * 83,
    Math.min(68, 900 / Math.max(width(text, 1), 1)), '#25160e')).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#f7f5f1"/><rect x="80" y="70" width="1040" height="760" rx="12" fill="#fe6f34"/>
    ${textPath(content.format.replaceAll('-', ' ').toUpperCase(), 140, 145, 23, '#492410')}${title}
    <circle cx="955" cy="685" r="90" fill="none" stroke="#492410" stroke-width="25"/><circle cx="955" cy="685" r="50" fill="none" stroke="#492410" stroke-width="18"/>
    ${textPath('YOUR COPY TO KEEP', 140, 760, 23, '#492410')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
