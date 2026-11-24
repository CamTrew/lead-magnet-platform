import assert from 'node:assert/strict';
import sharp from 'sharp';
import { parseCampaignGraphic, renderCampaignGraphic } from '../lib/campaign-graphic';

const source = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#123456"/><text x="70" y="120" font-size="48" fill="#ffffff">Choose your AI model</text><rect x="70" y="180" width="450" height="180" rx="24" fill="#abcdef"/><text x="100" y="240" font-size="28" fill="#123456">Compare costs &amp; licences</text><path d="M 550 270 L 640 270 L 620 250 M 640 270 L 620 290" stroke="#ffffff" stroke-width="6" fill="none"/><rect x="680" y="180" width="450" height="180" rx="24" fill="#abcdef"/><text x="710" y="240" font-size="28" fill="#123456">Test your shortlist</text></svg>';
async function main() {
  const graphic = await renderCampaignGraphic(source);
  const metadata = await sharp(graphic.png).metadata();
  assert.equal(metadata.format, 'png'); assert.equal(metadata.width, 1200); assert.equal(metadata.height, 630);
  assert.ok(graphic.png.length < 1024 * 1024);
  assert.notEqual(parseCampaignGraphic(source.replace('AI model', 'next model')).sourceHash, graphic.sourceHash);
  const pixels = await sharp(graphic.png).removeAlpha().raw().toBuffer();
  assert.deepEqual([...pixels.subarray(0,3)], [18,52,86]);
  assert.ok(pixels.some((value, index) => index % 3 === 0 && value === 255), 'Text paths render with bundled font');
  const malicious = [
    '<script>alert(1)</script>', '<image href="file:///etc/passwd"/>', '<use href="https://example.com/x"/>',
    '<foreignObject><div>HTML</div></foreignObject>', '<rect width="30" height="30" style="fill:url(https://example.com/x)"/>',
    '<rect onclick="alert(1)"/>', '<rect fill="url(https://example.com/x)"/>', '<rect fill="url(&#104;ttps://example.com/x)"/>',
    '<filter id="x"><feGaussianBlur stdDeviation="999"/></filter>', '<text x="1" y="20">Bad &#8212; dash</text>',
    '<text>&unknown;</text>', '<g>'.repeat(13) + '</g>'.repeat(13), '<rect/>'.repeat(256),
  ];
  for (const fragment of malicious) assert.throws(() => parseCampaignGraphic(`<svg width="1200" height="630">${fragment}</svg>`));
  for (const invalid of ['<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + source,
    '<?xml-stylesheet href="https://example.com/x"?>' + source,
    source.replace('width="1200"', 'width="9999"'), source.replace('0 0 1200 630', '0 0 9999 9999'),
    source + source, source.replace('</svg>', ''), ' '.repeat(24001)]) assert.throws(() => parseCampaignGraphic(invalid));
  await assert.rejects(renderCampaignGraphic(source.replace('font-size="48"', 'font-size="999"')));
  const { writeFile } = await import('node:fs/promises');
  await writeFile('.data/campaign-graphic-smoke.png', graphic.png);
  console.log('PASS: SVG-to-PNG rendering, bundled text, palette, changed-source hashes and unsupported/malicious drawing rejection.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
