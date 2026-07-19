import assert from 'node:assert/strict';
import { Pool } from 'pg';
import {
  parseEmailBodyBlocks,
  parseEmailBodySegments,
  serializeEmailBodyBlocks,
} from '../lib/email-body-images';
import {
  renderEmailTextFallback,
  renderPlainEmailHtml,
} from '../lib/email-render';

type StoredMagnet = {
  email_body: string;
  follow_up_emails: unknown;
  id: string;
};

type StoredFollowUp = {
  body?: unknown;
  id?: unknown;
  preview?: unknown;
  subject?: unknown;
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required for the editor data audit.');

const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 5_000,
  max: 1,
});

let bodyCount = 0;
let followUpCount = 0;
let imageCount = 0;
let imageRowCount = 0;

function meaningfulText(value: string) {
  return renderEmailTextFallback(value).replace(/\s+/g, ' ').trim();
}

function auditBody(label: string, body: string, previewText = '') {
  const blocks = parseEmailBodyBlocks(body);
  const serialized = serializeEmailBodyBlocks(blocks);
  const segments = parseEmailBodySegments(body);
  const expectedImages = segments.reduce((count, segment) => {
    if (segment.kind === 'image') return count + 1;
    if (segment.kind === 'image-row') return count + segment.images.length;
    return count;
  }, 0);
  const expectedRows = segments.filter((segment) => segment.kind === 'image-row').length;

  assert.equal(
    meaningfulText(serialized),
    meaningfulText(body),
    `${label}: editing round-trip changed the readable content`
  );

  const html = renderPlainEmailHtml(body, previewText);
  assert.match(html, /class="magnets-email-card"/, `${label}: missing responsive email shell`);
  assert.doesNotMatch(html, /(?:javascript|data):/i, `${label}: unsafe protocol reached rendered HTML`);
  assert.equal(
    Array.from(html.matchAll(/<img\s/g)).length,
    expectedImages,
    `${label}: rendered image count differs from stored image count`
  );
  assert.equal(
    Array.from(html.matchAll(/<table[^>]+table-layout:fixed/g)).length,
    expectedRows,
    `${label}: rendered image-row count differs from stored row count`
  );

  bodyCount += 1;
  imageCount += expectedImages;
  imageRowCount += expectedRows;
}

function followUpsFrom(value: unknown): StoredFollowUp[] {
  if (Array.isArray(value)) return value as StoredFollowUp[];
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as StoredFollowUp[] : [];
  } catch {
    return [];
  }
}

async function main() {
  try {
    const result = await pool.query<StoredMagnet>(`
      select id, email_body, follow_up_emails
      from magnets_lead_magnets
      order by created_at asc
    `);

    for (const magnet of result.rows) {
      auditBody(`magnet ${magnet.id} delivery`, magnet.email_body || '');
      for (const [index, followUp] of followUpsFrom(magnet.follow_up_emails).entries()) {
        const body = typeof followUp.body === 'string' ? followUp.body : '';
        const preview = typeof followUp.preview === 'string' ? followUp.preview : '';
        const emailId = typeof followUp.id === 'string' ? followUp.id : String(index + 1);
        auditBody(`magnet ${magnet.id} follow-up ${emailId}`, body, preview);
        followUpCount += 1;
      }
    }

    console.log(
      `Stored editor data audit passed: ${result.rowCount ?? result.rows.length} magnets, ${bodyCount} email bodies, ${followUpCount} follow-ups, ${imageCount} images, and ${imageRowCount} image rows.`
    );
  } finally {
    await pool.end();
  }
}

void main();
