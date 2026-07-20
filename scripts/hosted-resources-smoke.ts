import assert from 'node:assert/strict';
import {
  formatHostedResourceBytes,
  hostedResourceContentDisposition,
  hostedResourceContentType,
  hostedResourceContentTypeMatches,
  hostedResourcePathname,
  hostedResourcePublicPath,
  isHostedResourceBlobUrl,
  safeHostedResourceFilename,
  validateHostedResourceFile,
} from '../lib/hosted-resources';

const accountId = '11111111-1111-4111-8111-111111111111';
const resourceId = '22222222-2222-4222-8222-222222222222';
const token = '33333333-3333-4333-8333-333333333333';

assert.equal(hostedResourceContentType('guide.pdf', ''), 'application/pdf');
assert.equal(hostedResourceContentType('archive.zip', 'application/x-zip-compressed'), 'application/x-zip-compressed');
assert.equal(hostedResourceContentType('page.html', 'text/html'), '');
assert.equal(hostedResourceContentTypeMatches('guide.pdf', 'application/pdf'), true);
assert.equal(hostedResourceContentTypeMatches('guide.pdf', 'image/png'), false);
assert.equal(
  validateHostedResourceFile({ name: 'guide.pdf', size: 1024, type: 'application/pdf' }),
  null
);
assert.match(
  validateHostedResourceFile({ name: 'payload.html', size: 1024, type: 'text/html' }) || '',
  /Upload a PDF/
);
assert.match(
  validateHostedResourceFile({ name: 'huge.pdf', size: 50 * 1024 * 1024 + 1, type: 'application/pdf' }) || '',
  /50 MB/
);
assert.equal(safeHostedResourceFilename('../../My Guide (Final).PDF'), 'my-guide-final.pdf');
assert.equal(
  hostedResourcePathname(accountId, resourceId, 'My Guide.pdf'),
  `hosted-resources/${accountId}/${resourceId}/my-guide.pdf`
);

const privateUrl = `https://store.private.blob.vercel-storage.com/hosted-resources/${accountId}/${resourceId}/guide-a1b2.pdf`;
assert.equal(isHostedResourceBlobUrl(privateUrl, accountId, resourceId), true);
assert.equal(
  isHostedResourceBlobUrl(
    `https://store.public.blob.vercel-storage.com/hosted-resources/${accountId}/${resourceId}/guide.pdf`,
    accountId,
    resourceId
  ),
  false,
  'Hosted resources must never accept a URL from a public Blob store.'
);
assert.equal(
  isHostedResourceBlobUrl(privateUrl, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', resourceId),
  false,
  'An account must not be able to finalise a Blob uploaded under another account path.'
);
assert.equal(
  isHostedResourceBlobUrl(privateUrl, accountId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  false,
  'A resource id must not be able to claim another resource Blob.'
);
assert.equal(
  isHostedResourceBlobUrl(
    `https://attacker.example/hosted-resources/${accountId}/${resourceId}/guide.pdf`,
    accountId,
    resourceId
  ),
  false
);
assert.equal(hostedResourcePublicPath(token), `/resources/${token}`);
assert.equal(formatHostedResourceBytes(1024), '1 KB');
assert.equal(formatHostedResourceBytes(5 * 1024 * 1024), '5.0 MB');

const disposition = hostedResourceContentDisposition('guide\r\nX-Evil: yes.pdf');
assert.equal(disposition.includes('\r'), false);
assert.equal(disposition.includes('\n'), false);
assert.match(disposition, /^attachment;/);

console.log('Hosted resource security and compatibility smoke tests passed.');
