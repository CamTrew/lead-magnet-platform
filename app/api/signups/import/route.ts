import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import {
  bulkRecordSubmissions,
  leadMagnetBelongsToAccount,
  recordSubmission,
} from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import { parseCsv } from '@/lib/csv';

const ROUTE = '/api/signups/import';

const MAX_CSV_CHARS = 2_000_000; // ~2 MB of CSV text
const MAX_ROWS_PER_IMPORT = 5000;
const EMAIL_REGEX = /^[^\s@]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const columnIndexSchema = z.preprocess(
  (value) => {
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return value;
  },
  z
    .number({ invalid_type_error: 'Choose a valid CSV column.' })
    .min(0, 'Choose a valid CSV column.')
    .transform((value) => Math.floor(value))
);

const manualSchema = z.object({
  type: z.literal('manual'),
  leadMagnetId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
});

const csvSchema = z.object({
  type: z.literal('csv'),
  leadMagnetId: z.string().uuid(),
  csv: z.string().min(1).max(MAX_CSV_CHARS, 'CSV is too large'),
  hasHeader: z.boolean().default(true),
  emailColumn: columnIndexSchema,
  nameColumn: columnIndexSchema.nullable(),
});

const bodySchema = z.discriminatedUnion('type', [manualSchema, csvSchema]);

export async function POST(request: NextRequest) {
  const start = Date.now();
  let userId: string | undefined;
  let accountId: string | undefined;
  try {
    const payload = await requireDashboardPayload();
    userId = payload.user.id;
    accountId = payload.account.id;

    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 30,
        scope: 'signups:import:user',
        windowSeconds: 60 * 5,
      },
      {
        identifier: requestIp(request),
        limit: 60,
        scope: 'signups:import:ip',
        windowSeconds: 60 * 5,
      },
    ]);

    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || 'Check the import payload and try again.';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const data = parsed.data;

    const belongs = await leadMagnetBelongsToAccount(accountId, data.leadMagnetId);
    if (!belongs) {
      return NextResponse.json({ error: 'That magnet does not belong to this account.' }, { status: 404 });
    }

    if (data.type === 'manual') {
      await recordSubmission({
        accountId,
        leadMagnetId: data.leadMagnetId,
        name: data.name,
        email: data.email.toLowerCase(),
      });

      log.info('Manual signup added', {
        route: ROUTE,
        method: 'POST',
        status: 200,
        userId,
        accountId,
        durationMs: Date.now() - start,
        extra: { leadMagnetId: data.leadMagnetId },
      });

      return NextResponse.json({ imported: 1, skipped: 0, invalid: 0, total: 1 });
    }

    const rows = parseCsv(data.csv);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'CSV is empty.' }, { status: 400 });
    }

    const dataRows = data.hasHeader ? rows.slice(1) : rows;
    if (dataRows.length === 0) {
      return NextResponse.json({ error: 'CSV has no data rows.' }, { status: 400 });
    }
    if (dataRows.length > MAX_ROWS_PER_IMPORT) {
      return NextResponse.json(
        { error: `Imports are limited to ${MAX_ROWS_PER_IMPORT} rows per request.` },
        { status: 400 }
      );
    }

    const seen = new Set<string>();
    const toInsert: Array<{ leadMagnetId: string; name: string; email: string }> = [];
    let skipped = 0;
    let invalid = 0;

    for (const row of dataRows) {
      const emailRaw = (row[data.emailColumn] || '').trim().toLowerCase();
      if (!emailRaw || !EMAIL_REGEX.test(emailRaw) || emailRaw.length > 254) {
        invalid += 1;
        continue;
      }
      if (seen.has(emailRaw)) {
        skipped += 1;
        continue;
      }
      seen.add(emailRaw);

      const nameRaw = data.nameColumn != null ? (row[data.nameColumn] || '').trim() : '';
      const name = (nameRaw || emailRaw.split('@')[0] || 'Subscriber').slice(0, 120);

      toInsert.push({ leadMagnetId: data.leadMagnetId, name, email: emailRaw });
    }

    const { inserted } = await bulkRecordSubmissions(accountId, toInsert);

    log.info('CSV signups imported', {
      route: ROUTE,
      method: 'POST',
      status: 200,
      userId,
      accountId,
      durationMs: Date.now() - start,
      extra: {
        leadMagnetId: data.leadMagnetId,
        total: dataRows.length,
        imported: inserted,
        skipped,
        invalid,
      },
    });

    return NextResponse.json({
      imported: inserted,
      skipped,
      invalid,
      total: dataRows.length,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    log.error('Signup import failed', {
      route: ROUTE,
      method: 'POST',
      status: 500,
      userId,
      accountId,
      extra: { error: err },
    });
    return NextResponse.json({ error: 'Could not import signups' }, { status: 500 });
  }
}
