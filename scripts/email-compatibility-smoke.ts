import assert from 'node:assert/strict';
import {
  DEFAULT_EMAIL_IMAGE_BORDER,
  emailImageWithBorder,
  emailImageMarkdown,
  emailImageRowMarkdown,
  insertEmailImages,
  mergeEmailImageBlocks,
  parseEmailBodyBlocks,
  parseEmailBodySegments,
  parseEmailImageLine,
  parseEmailImageRowLine,
  removeEmailBodySegment,
  replaceEmailBodySegment,
  serializeEmailBodyBlocks,
} from '../lib/email-body-images';
import { proxyEmailImagesInBody } from '../lib/email-image-proxy';
import { parseYouTubeVideoUrl } from '../lib/email-body-links';
import {
  MAGNETS_EMAIL_FOOTER_HTML,
  cleanEmailText,
  cleanPreviewText,
  renderDeliveryEmailHtml,
  renderEmailTextFallback,
  renderFollowUpEmailHtml,
  renderFollowUpOptOutHtml,
  renderPlainEmailHtml,
} from '../lib/email-render';
import { FOLLOW_UP_RENDER_VERSION } from '../lib/follow-up-sequences';

const accountId = '11111111-1111-4111-8111-111111111111';
const leadMagnetId = '22222222-2222-4222-8222-222222222222';

assert.equal(
  parseYouTubeVideoUrl('https://youtu.be/dQw4w9WgXcQ?t=10')?.url,
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
);
assert.equal(
  parseYouTubeVideoUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')?.id,
  'dQw4w9WgXcQ'
);
assert.equal(
  parseYouTubeVideoUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')?.thumbnailUrl,
  'https://magnets.so/youtube-thumbnails/dQw4w9WgXcQ'
);
assert.equal(parseYouTubeVideoUrl('https://example.com/video'), null);

function occurrences(value: string, pattern: RegExp) {
  return Array.from(value.matchAll(pattern)).length;
}

// Emails created before rich formatting existed were plain text with blank
// lines. They must remain readable and produce an unchanged text fallback.
const legacyPlainBody = 'Hi {name},\n\nHere is your guide.\n\nThanks,\nCameron';
assert.deepEqual(parseEmailBodySegments(legacyPlainBody).map((segment) => segment.kind), ['text']);
assert.equal(renderEmailTextFallback(legacyPlainBody), legacyPlainBody);
const legacyPlainHtml = renderPlainEmailHtml(legacyPlainBody, 'Your guide is ready');
assert.match(legacyPlainHtml, /Hi \{name\}/);
assert.match(legacyPlainHtml, /Here is your guide\./);
assert.match(legacyPlainHtml, /max-width:640px/);
assert.deepEqual(
  parseEmailBodyBlocks(legacyPlainBody).map((block) => block.kind),
  ['text', 'text', 'text']
);
assert.equal(serializeEmailBodyBlocks(parseEmailBodyBlocks(legacyPlainBody)), legacyPlainBody);

// Existing heading, emphasis, list, divider, and link syntax is still rendered
// by the original formatting renderer inside the new responsive shell.
const legacyRichBody = [
  '# Your download',
  '',
  'Use **the worksheet** before [booking a call](https://example.com/book).',
  '',
  '- First step',
  '- Second step',
  '',
  '---',
  '',
  'Reply if you get stuck.',
].join('\n');
const legacyRichHtml = renderPlainEmailHtml(legacyRichBody, 'Start here');
assert.match(legacyRichHtml, /<h1[^>]*>Your download<\/h1>/);
assert.match(legacyRichHtml, /<strong[^>]*>the worksheet<\/strong>/);
assert.match(legacyRichHtml, /href="https:\/\/example\.com\/book"/);
assert.match(legacyRichHtml, /<ul[^>]*list-style-type:disc/);
assert.match(legacyRichHtml, /<hr/);

// The original one-image-per-line representation remains a first-class image
// block. Two old adjacent image lines do not silently become a new image row.
const legacyImagesBody = [
  'Before.',
  '',
  '![First screenshot](https://cdn.example.com/first.png)',
  '',
  '![Second screenshot](https://cdn.example.com/second.png)',
  '',
  'After.',
].join('\n');
assert.deepEqual(
  parseEmailBodySegments(legacyImagesBody).map((segment) => segment.kind),
  ['text', 'image', 'text', 'image', 'text']
);
const legacyImagesHtml = renderPlainEmailHtml(legacyImagesBody, 'Screenshots');
assert.equal(occurrences(legacyImagesHtml, /<img src="https:\/\/cdn\.example\.com\/(?:first|second)\.png"/g), 2);
assert.equal(occurrences(legacyImagesHtml, /<td class="magnets-image-column/g), 0);
assert.equal(occurrences(legacyImagesHtml, /width="440"/g), 2);
assert.equal(occurrences(legacyImagesHtml, /max-width:440px/g), 2);
assert.match(renderEmailTextFallback(legacyImagesBody), /First screenshot: https:\/\/cdn\.example\.com\/first\.png/);

// Image borders use an optional suffix, so every old image line stays byte-for-byte
// compatible while newly framed screenshots retain their setting everywhere.
const borderedImage = emailImageMarkdown({
  alt: 'Framed screenshot',
  border: true,
  url: 'https://cdn.example.com/framed.png',
});
assert.equal(borderedImage, '![Framed screenshot](https://cdn.example.com/framed.png){border}');
assert.deepEqual(parseEmailImageLine(borderedImage)?.border, DEFAULT_EMAIL_IMAGE_BORDER);
assert.equal(parseEmailImageLine('![Plain](https://cdn.example.com/plain.png)')?.border, undefined);
const borderedImageHtml = renderPlainEmailHtml(borderedImage, 'Framed screenshot');
assert.match(borderedImageHtml, /border:1px solid #78716c/);
assert.match(renderPlainEmailHtml('![Plain](https://cdn.example.com/plain.png)', 'Plain'), /border:0/);
const customBorderedImage = emailImageMarkdown({
  alt: 'Custom frame',
  border: { color: 'ff3366', radius: 2, style: 'dashed', width: 3 },
  url: 'https://cdn.example.com/custom-frame.png',
});
assert.equal(
  customBorderedImage,
  '![Custom frame](https://cdn.example.com/custom-frame.png){border=3,2,dashed,ff3366}'
);
const customBorderedHtml = renderPlainEmailHtml(customBorderedImage, 'Custom frame');
assert.match(customBorderedHtml, /border:3px dashed #ff3366;border-radius:2px/);
const captionedImage = emailImageMarkdown({
  alt: 'Launch chart',
  caption: 'Signups increased by 42% after launch.',
  url: 'https://cdn.example.com/launch-chart.png',
});
assert.equal(
  captionedImage,
  '![Launch chart](https://cdn.example.com/launch-chart.png){caption=Signups%20increased%20by%2042%25%20after%20launch.}'
);
assert.equal(
  parseEmailImageLine(captionedImage)?.caption,
  'Signups increased by 42% after launch.'
);
const captionedImageHtml = renderPlainEmailHtml(captionedImage, 'Launch chart');
assert.match(captionedImageHtml, /Signups increased by 42% after launch\./);
assert.match(captionedImageHtml, /text-align:center/);
assert.match(captionedImageHtml, /font:italic 13px\/1\.45 Arial,sans-serif/);
assert.match(renderEmailTextFallback(captionedImage), /launch-chart\.png\nSignups increased by 42% after launch\./);
const styledCaptionedImage = emailImageMarkdown({
  alt: 'Styled caption',
  border: { color: '334455', radius: 4, style: 'dotted', width: 2 },
  caption: 'A framed result.',
  url: 'https://cdn.example.com/styled-caption.png',
});
assert.match(styledCaptionedImage, /\{border=2,4,dotted,334455\}\{caption=A%20framed%20result\.\}$/);
const restyledCaptionedImage = emailImageWithBorder(
  parseEmailImageLine(styledCaptionedImage)!,
  { color: 'ff3366', radius: 12, style: 'dashed', width: 3 }
);
assert.equal(restyledCaptionedImage.caption, 'A framed result.');
assert.match(
  emailImageMarkdown(restyledCaptionedImage),
  /\{border=3,12,dashed,ff3366\}\{caption=A%20framed%20result\.\}$/
);

// Editing around a legacy image keeps its order and the whitespace behavior
// relied upon by the current contenteditable implementation.
const editedLegacyBody = replaceEmailBodySegment(legacyImagesBody, 2, '\n\nUpdated between images.\n\n');
assert.match(editedLegacyBody, /first\.png\)\n\nUpdated between images\.\n\n!\[Second/);
assert.equal(
  removeEmailBodySegment('Before.\n\n![Preview](https://cdn.example.com/preview.png)\n\nAfter.', 1),
  'Before.\n\nAfter.'
);

// A new image can split an existing text section at the saved caret rather
// than being forced to the end of the email.
const middleImageBody = insertEmailImages(
  'First paragraph.\n\nSecond paragraph.',
  { mode: 'single', segmentIndex: 0, before: 'First paragraph.', after: 'Second paragraph.' },
  [{ alt: 'Middle screenshot', url: 'https://cdn.example.com/middle.png' }]
);
assert.equal(
  middleImageBody,
  'First paragraph.\n\n![Middle screenshot](https://cdn.example.com/middle.png)\n\nSecond paragraph.'
);
assert.deepEqual(
  parseEmailBodySegments(middleImageBody).map((segment) => segment.kind),
  ['text', 'image', 'text']
);

// The block editor supplies complete before/after bodies as well as its block
// index. That keeps insertion exact when the caret is in a newly-created empty
// block that does not yet have a stored Markdown representation.
const emptyBlockInsertionBody = insertEmailImages(
  'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
  {
    mode: 'single',
    segmentIndex: 1,
    bodyBefore: 'First paragraph.',
    bodyAfter: 'Second paragraph.\n\nThird paragraph.',
  },
  [{ alt: 'Inserted from empty block', url: 'https://cdn.example.com/empty-block.png' }]
);
assert.equal(
  emptyBlockInsertionBody,
  'First paragraph.\n\n![Inserted from empty block](https://cdn.example.com/empty-block.png)\n\nSecond paragraph.\n\nThird paragraph.'
);
assert.deepEqual(
  parseEmailBodyBlocks(emptyBlockInsertionBody).map((block) => block.kind),
  ['text', 'image', 'text', 'text']
);

// "Add beside" carries the exact media block and its surrounding content.
// Even if an unsaved empty editor block makes the numeric index stale, the
// uploaded image must still form a row in place instead of falling to the end.
const originalBesideImage = '![Original](https://cdn.example.com/original.png)';
const besideImageBody = insertEmailImages(
  `Before.\n\n${originalBesideImage}\n\nAfter.`,
  {
    mode: 'beside',
    segmentIndex: 99,
    targetMedia: originalBesideImage,
    bodyBefore: 'Before.',
    bodyAfter: 'After.',
  },
  [{ alt: 'Beside', url: 'https://cdn.example.com/beside.png' }]
);
assert.equal(
  besideImageBody,
  'Before.\n\n![Original](https://cdn.example.com/original.png) || ![Beside](https://cdn.example.com/beside.png)\n\nAfter.'
);
assert.deepEqual(
  parseEmailBodyBlocks(besideImageBody).map((block) => block.kind),
  ['text', 'image-row', 'text']
);

// New rows are deliberately distinguishable from old image blocks and are
// constrained on desktop while carrying the mobile stacking class.
const row = emailImageRowMarkdown([
  { alt: 'Desktop', url: 'https://cdn.example.com/desktop.png' },
  { alt: 'Mobile', url: 'https://cdn.example.com/mobile.png' },
]);
assert.equal(parseEmailImageRowLine(row)?.length, 2);
assert.equal(parseEmailImageLine(row), null);
const rowBody = insertEmailImages(
  'Before.\n\nAfter.',
  { mode: 'row', segmentIndex: 0, before: 'Before.', after: 'After.' },
  [
    { alt: 'Desktop', url: 'https://cdn.example.com/desktop.png' },
    { alt: 'Mobile', url: 'https://cdn.example.com/mobile.png' },
  ]
);
assert.deepEqual(parseEmailBodySegments(rowBody).map((segment) => segment.kind), ['text', 'image-row', 'text']);
const rowHtml = renderPlainEmailHtml(rowBody, 'Two views');
assert.equal(occurrences(rowHtml, /<td class="magnets-image-column/g), 2);
assert.match(rowHtml, /@media only screen and \(max-width:520px\)/);
const captionedRow = emailImageRowMarkdown([
  { alt: 'Desktop', caption: 'Desktop view', url: 'https://cdn.example.com/desktop-caption.png' },
  { alt: 'Mobile', caption: 'Mobile view', url: 'https://cdn.example.com/mobile-caption.png' },
]);
const captionedRowHtml = renderPlainEmailHtml(captionedRow, 'Two captioned views');
assert.match(captionedRowHtml, /Desktop view/);
assert.match(captionedRowHtml, /Mobile view/);
assert.equal(parseEmailImageRowLine(captionedRow)?.filter((image) => image.caption).length, 2);

// Dragging one existing image block onto another forms the same portable row
// representation, preserves the requested left/right order, and never creates
// rows wider than the email renderer supports.
const draggableBlocks = parseEmailBodyBlocks(legacyImagesBody);
const draggedTogether = mergeEmailImageBlocks(draggableBlocks, 1, 2, 'after');
assert.equal(draggedTogether.length, draggableBlocks.length - 1);
assert.deepEqual(
  draggedTogether.find((block) => block.kind === 'image-row')?.kind === 'image-row'
    ? draggedTogether.find((block) => block.kind === 'image-row')?.images.map((image) => image.alt)
    : [],
  ['Second screenshot', 'First screenshot']
);
assert.equal(
  serializeEmailBodyBlocks(draggedTogether),
  'Before.\n\n![Second screenshot](https://cdn.example.com/second.png) || ![First screenshot](https://cdn.example.com/first.png)\n\nAfter.'
);
const draggedRow = draggedTogether.find((block) => block.kind === 'image-row');
assert.ok(draggedRow?.kind === 'image-row');
const separatedAgain = serializeEmailBodyBlocks([
  ...draggedTogether.slice(0, 1),
  ...draggedRow.images.map((image) => ({
    kind: 'image' as const,
    ...image,
    raw: emailImageMarkdown(image),
  })),
  ...draggedTogether.slice(2),
]);
assert.equal(
  separatedAgain,
  'Before.\n\n![Second screenshot](https://cdn.example.com/second.png)\n\n![First screenshot](https://cdn.example.com/first.png)\n\nAfter.'
);
assert.deepEqual(
  parseEmailBodyBlocks(separatedAgain).map((block) => block.kind),
  ['text', 'image', 'image', 'text']
);
const fullRowBlocks = parseEmailBodyBlocks(`${row}\n\n![Third](https://cdn.example.com/third.png)\n\n![Fourth](https://cdn.example.com/fourth.png)`);
const threeAcross = mergeEmailImageBlocks(fullRowBlocks, 1, 0, 'after');
assert.equal(threeAcross[0]?.kind === 'image-row' ? threeAcross[0].images.length : 0, 3);
assert.strictEqual(mergeEmailImageBlocks(threeAcross, 1, 0, 'after'), threeAcross);

// Old private image URLs are still converted to signed public proxy URLs. The
// same protection now applies to every image inside a new row.
const privateFirst = `https://store.private.blob.vercel-storage.com/lead-magnets/${accountId}/${leadMagnetId}/email-images/first.png`;
const privateSecond = `https://store.private.blob.vercel-storage.com/lead-magnets/${accountId}/${leadMagnetId}/email-images/second.png`;
const proxiedLegacy = proxyEmailImagesInBody({
  accountId,
  baseUrl: 'https://magnets.so',
  body: `Before.\n\n![First](${privateFirst})\n\nAfter.`,
  leadMagnetId,
});
assert.match(proxiedLegacy, /https:\/\/magnets\.so\/email-images\//);
assert.doesNotMatch(proxiedLegacy, /private\.blob/);
const proxiedBordered = proxyEmailImagesInBody({
  accountId,
  baseUrl: 'https://magnets.so',
  body: emailImageMarkdown({ alt: 'Framed', border: true, caption: 'Private screenshot.', url: privateFirst }),
  leadMagnetId,
});
assert.match(proxiedBordered, /\{border\}\{caption=Private%20screenshot\.\}$/);
const proxiedRow = proxyEmailImagesInBody({
  accountId,
  baseUrl: 'https://magnets.so',
  body: emailImageRowMarkdown([
    { alt: 'First', url: privateFirst },
    { alt: 'Second', url: privateSecond },
  ]),
  leadMagnetId,
});
assert.equal(parseEmailImageRowLine(proxiedRow)?.length, 2);
assert.equal(occurrences(proxiedRow, /https:\/\/magnets\.so\/email-images\//g), 2);
assert.doesNotMatch(proxiedRow, /private\.blob/);

// Email metadata is not duplicated inside the message body, unsafe image
// protocols remain ordinary text, and the footer stays inside the card.
const footerHtml = renderPlainEmailHtml('Hello.', '', MAGNETS_EMAIL_FOOTER_HTML);
assert.doesNotMatch(footerHtml, /<Northstar>|<Your guide>/);
assert.ok(footerHtml.indexOf('Powered by') < footerHtml.lastIndexOf('</table>'));
assert.match(footerHtml, /href="https:\/\/magnets\.so" target="_blank" rel="noopener noreferrer"/);
assert.match(footerHtml, /class="magnets-email-footer"/);
assert.match(footerHtml, /<\/td><\/tr><tr><td class="magnets-email-footer-cell"/);
assert.match(footerHtml, /background:#080d18/);
assert.match(footerHtml, /src="https:\/\/magnets\.so\/brand\/magnets-mark\.png"/);
assert.match(footerHtml, /Powered by Magnets/);
assert.match(footerHtml, /width:100%;margin:0;background:#ffffff/);
assert.doesNotMatch(footerHtml, /background:#f5f5f4/);
const parityPreview = '  Your   preview text  ';
const quoteHtml = renderPlainEmailHtml('> A useful quote with **emphasis**.', 'Quote');
assert.match(quoteHtml, /<blockquote/);
assert.match(quoteHtml, /border-left:4px solid #111827/);
assert.match(quoteHtml, /<strong style="font-weight:700">emphasis<\/strong>/);
const structuredBody = [
  '# Main heading',
  '',
  '## Heading two',
  '',
  '### Heading three',
  '',
  '#### Heading four',
  '',
  '##### Heading five',
  '',
  '###### Heading six',
  '',
  '[[toc]]',
  '',
  '**Bold**, *italic*, and ***bold italic*** with [a link](https://example.com/guide).',
  '',
  '> A useful standard quote.',
  '',
  '>> A strong side quote.',
  '',
  '>>> A centered quote.',
  '',
  '- Normal bullet one',
  '- Normal bullet two',
  '',
  '– Dashed bullet one',
  '– Dashed bullet two',
  '',
  '1. Numbered item one',
  '2. Numbered item two',
  '',
  '---',
  '',
  ':::section Next section',
  '',
  ':::columns Left **column** ||| Right column',
  '',
  ':::footnote Source: **Magnets research**.',
  '',
  '![Framed screenshot](https://cdn.example.com/matrix-frame.png){border=3,2,dashed,ff3366}{caption=Framed%20caption.}',
  '',
  '![Desktop](https://cdn.example.com/matrix-desktop.png){caption=Desktop%20caption.} || ![Mobile](https://cdn.example.com/matrix-mobile.png){border=2,4,dotted,334455}{caption=Mobile%20caption.}',
  '',
  ':::youtube https://youtu.be/dQw4w9WgXcQ',
].join('\n');
const structuredHtml = renderPlainEmailHtml(structuredBody, 'Structured blocks');
assert.match(structuredHtml, /<h1 id="email-heading-main-heading"/);
assert.match(structuredHtml, /<h2 id="email-heading-heading-two"/);
assert.match(structuredHtml, /<h3 id="email-heading-heading-three"/);
assert.match(structuredHtml, /<h4 id="email-heading-heading-four"/);
assert.match(structuredHtml, /<h5 id="email-heading-heading-five"/);
assert.match(structuredHtml, /<h6 id="email-heading-heading-six"/);
assert.match(structuredHtml, /href="#email-heading-main-heading"/);
assert.match(structuredHtml, /<strong[^>]*>Bold<\/strong>/);
assert.match(structuredHtml, /<em[^>]*>italic<\/em>/);
assert.match(structuredHtml, /<strong[^>]*><em[^>]*>bold italic<\/em><\/strong>/);
assert.match(structuredHtml, /href="https:\/\/example\.com\/guide"[^>]*>a link<\/a>/);
assert.match(structuredHtml, /class="magnets-text-columns"/);
assert.match(structuredHtml, /class="magnets-text-column"/);
assert.match(structuredHtml, /Next section/);
assert.match(structuredHtml, /border-left:4px solid #111827/);
assert.match(structuredHtml, /border-left:6px solid #111827/);
assert.match(structuredHtml, /text-align:center/);
assert.match(structuredHtml, /<ul[^>]*list-style-type:disc/);
assert.match(structuredHtml, /<ul[^>]*list-style-type:none/);
assert.match(structuredHtml, /<ol[^>]*list-style-type:decimal/);
assert.match(structuredHtml, /<hr[^>]*\/>/);
assert.match(structuredHtml, /<sup[^>]*>1<\/sup>.*Source: <strong[^>]*>Magnets research<\/strong>\./);
assert.match(structuredHtml, /src="https:\/\/cdn\.example\.com\/matrix-frame\.png"/);
assert.equal(
  occurrences(structuredHtml, /box-sizing:border-box/g),
  3,
  'Every bordered single/row image must keep its side borders inside the available width.'
);
assert.match(structuredHtml, /border:3px dashed #ff3366;border-radius:2px/);
assert.match(structuredHtml, /Framed caption\./);
assert.equal(occurrences(structuredHtml, /class="magnets-image-column/g), 2);
assert.match(structuredHtml, /Desktop caption\./);
assert.match(structuredHtml, /Mobile caption\./);
assert.match(structuredHtml, /border:2px dotted #334455;border-radius:4px/);
assert.match(structuredHtml, /src="https:\/\/magnets\.so\/youtube-thumbnails\/dQw4w9WgXcQ"/);
assert.match(structuredHtml, /href="https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ"/);
assert.match(structuredHtml, /Watch on YouTube/);
assert.match(structuredHtml, /\.magnets-image-column,\.magnets-text-column/);
const structuredText = renderEmailTextFallback(structuredBody);
assert.match(structuredText, /In this email:\n1\. Main heading/);
assert.match(structuredText, /Left column\nRight column/);
assert.match(structuredText, /Footnote 1: Source: Magnets research\./);
assert.match(structuredText, /YouTube video: https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ/);
assert.equal(
  renderDeliveryEmailHtml(structuredBody, parityPreview),
  renderPlainEmailHtml(
    cleanEmailText(structuredBody),
    cleanPreviewText(parityPreview),
    MAGNETS_EMAIL_FOOTER_HTML
  ),
  'Delivery preview and provider payload must share the exact renderer.'
);
assert.equal(
  renderFollowUpEmailHtml(structuredBody, parityPreview, '#'),
  renderPlainEmailHtml(
    cleanEmailText(structuredBody),
    cleanPreviewText(parityPreview),
    `${renderFollowUpOptOutHtml('#')}${MAGNETS_EMAIL_FOOTER_HTML}`
  ),
  'Follow-up preview and provider template must share the exact renderer.'
);
assert.match(renderFollowUpEmailHtml(structuredBody, parityPreview, '#'), /Stop this sequence/);
assert.equal(parseEmailImageLine('![Unsafe](javascript:alert(1))'), null);

assert.equal(cleanEmailText('\r\nHello.   \r\n\r\n\r\nWorld.  '), 'Hello.\n\nWorld.');
assert.equal(FOLLOW_UP_RENDER_VERSION, 9);

console.log('Email compatibility smoke test passed: legacy plain text, rich formatting, single images, proxy URLs, and new responsive image rows.');
