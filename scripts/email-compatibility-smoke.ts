import assert from 'node:assert/strict';
import {
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
const parityBody = 'Hi Alex.\n\n![Preview](https://cdn.example.com/preview.png)';
const parityPreview = '  Your   preview text  ';
assert.equal(
  renderDeliveryEmailHtml(parityBody, parityPreview),
  renderPlainEmailHtml(
    cleanEmailText(parityBody),
    cleanPreviewText(parityPreview),
    MAGNETS_EMAIL_FOOTER_HTML
  ),
  'Delivery preview and provider payload must share the exact renderer.'
);
assert.equal(
  renderFollowUpEmailHtml(parityBody, parityPreview, '#'),
  renderPlainEmailHtml(
    cleanEmailText(parityBody),
    cleanPreviewText(parityPreview),
    `${renderFollowUpOptOutHtml('#')}${MAGNETS_EMAIL_FOOTER_HTML}`
  ),
  'Follow-up preview and provider template must share the exact renderer.'
);
assert.match(renderFollowUpEmailHtml(parityBody, parityPreview, '#'), /Stop this sequence/);
assert.equal(parseEmailImageLine('![Unsafe](javascript:alert(1))'), null);

assert.equal(cleanEmailText('\r\nHello.   \r\n\r\n\r\nWorld.  '), 'Hello.\n\nWorld.');
assert.equal(FOLLOW_UP_RENDER_VERSION, 6);

console.log('Email compatibility smoke test passed: legacy plain text, rich formatting, single images, proxy URLs, and new responsive image rows.');
