import assert from 'node:assert/strict';
import { Pool } from 'pg';
import {
  parseEmailBodyBlocks,
  parseEmailBodySegments,
  serializeEmailBodyBlocks,
} from '../lib/email-body-images';
import {
  renderDeliveryEmailHtml,
  renderEmailTextFallback,
  renderFollowUpEmailHtml,
} from '../lib/email-render';
import { parseYouTubeVideoUrl } from '../lib/email-body-links';

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
let youtubeCount = 0;

function meaningfulText(value: string) {
  return renderEmailTextFallback(value).replace(/\s+/g, ' ').trim();
}

function auditBody(
  label: string,
  body: string,
  previewText = '',
  kind: 'delivery' | 'follow-up' = 'delivery'
) {
  const blocks = parseEmailBodyBlocks(body);
  const serialized = serializeEmailBodyBlocks(blocks);
  const segments = parseEmailBodySegments(body);
  const expectedImages = segments.reduce((count, segment) => {
    if (segment.kind === 'image') return count + 1;
    if (segment.kind === 'image-row') return count + segment.images.length;
    return count;
  }, 0);
  const expectedRows = segments.filter((segment) => segment.kind === 'image-row').length;
  const expectedYouTubeVideos = body.replace(/\r\n?/g, '\n').split('\n')
    .filter((line) => {
      const match = line.match(/^:::youtube(?:\s+(.+))?$/);
      return Boolean(match && parseYouTubeVideoUrl(match[1] || ''));
    }).length;

  assert.equal(
    meaningfulText(serialized),
    meaningfulText(body),
    `${label}: editing round-trip changed the readable content`
  );

  // Exercise the same complete renderer that the preview and Resend payload
  // use. This makes the database audit sensitive to regressions in the real
  // footer and follow-up opt-out wrappers as well as the block parser itself.
  const html = kind === 'follow-up'
    ? renderFollowUpEmailHtml(body, previewText, 'https://magnets.so/follow-up/stop/audit')
    : renderDeliveryEmailHtml(body, previewText);
  assert.match(html, /class="magnets-email-card"/, `${label}: missing responsive email shell`);
  assert.match(html, /Build yours free with Magnets/, `${label}: missing required email footer`);
  if (kind === 'follow-up') {
    assert.match(html, /Stop this sequence/, `${label}: missing follow-up opt-out`);
  }
  assert.doesNotMatch(html, /(?:javascript|data):/i, `${label}: unsafe protocol reached rendered HTML`);
  assert.equal(
    Array.from(html.matchAll(/<img\s/g)).length,
    expectedImages + expectedYouTubeVideos + 1,
    `${label}: rendered image count differs from stored images, YouTube thumbnails, and footer logo`
  );
  assert.equal(
    Array.from(html.matchAll(/<table[^>]+table-layout:fixed/g)).length,
    expectedRows,
    `${label}: rendered image-row count differs from stored row count`
  );

  bodyCount += 1;
  imageCount += expectedImages;
  imageRowCount += expectedRows;
  youtubeCount += expectedYouTubeVideos;
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

function isTransientConnectionError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = `${error.message} ${error.cause instanceof Error ? error.cause.message : ''}`;
  return message.includes('connection timeout') || message.includes('Connection terminated unexpectedly');
}

async function loadStoredMagnets() {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await pool.query<StoredMagnet>(`
        select id, email_body, follow_up_emails
        from magnets_lead_magnets
        order by created_at asc
      `);
    } catch (error) {
      if (attempt === 3 || !isTransientConnectionError(error)) throw error;
    }
  }
  throw new Error('Stored editor data could not be loaded.');
}

async function main() {
  try {
    const result = await loadStoredMagnets();

    for (const magnet of result.rows) {
      auditBody(`magnet ${magnet.id} delivery`, magnet.email_body || '');
      for (const [index, followUp] of followUpsFrom(magnet.follow_up_emails).entries()) {
        const body = typeof followUp.body === 'string' ? followUp.body : '';
        const preview = typeof followUp.preview === 'string' ? followUp.preview : '';
        const emailId = typeof followUp.id === 'string' ? followUp.id : String(index + 1);
        auditBody(`magnet ${magnet.id} follow-up ${emailId}`, body, preview, 'follow-up');
        followUpCount += 1;
      }
    }

    console.log(
      `Stored editor data audit passed: ${result.rowCount ?? result.rows.length} magnets, ${bodyCount} email bodies, ${followUpCount} follow-ups, ${imageCount} images, ${imageRowCount} image rows, and ${youtubeCount} YouTube embeds.`
    );
  } finally {
    await pool.end();
  }
}

void main();
