import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import { listAccountSignups } from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const exportFiltersSchema = z.object({
  leadMagnetId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
}).strict();

function escapeCsvCell(value: string) {
  if (value === '' || (!value.includes(',') && !value.includes('"') && !value.includes('\n') && !value.includes('\r'))) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function toCsvRow(cells: string[]) {
  return cells.map(escapeCsvCell).join(',');
}

function formatTimestamp(value: string) {
  return new Date(value).toISOString();
}

export async function GET(request: NextRequest) {
  let userId: string | undefined;
  let accountId: string | undefined;
  try {
    const payload = await requireDashboardPayload();
    userId = payload.user.id;
    accountId = payload.account.id;

    // CSV export is heavier than the JSON list — tighter limits.
    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 12,
        scope: 'signups:export:user',
        windowSeconds: 60 * 5,
      },
      {
        identifier: requestIp(request),
        limit: 30,
        scope: 'signups:export:ip',
        windowSeconds: 60 * 5,
      },
    ]);

    const parsedFilters = exportFiltersSchema.safeParse({
      leadMagnetId: request.nextUrl.searchParams.get('leadMagnetId') || undefined,
      search: request.nextUrl.searchParams.get('search') || undefined,
    });
    if (!parsedFilters.success) {
      return new Response(JSON.stringify({ error: 'Invalid signup filters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { leadMagnetId, search } = parsedFilters.data;
    const signups = await listAccountSignups(payload.account.id, { leadMagnetId, search });

    const header = toCsvRow(['Email', 'Name', 'Lead magnet', 'Lead magnet slug', 'Signed up at', 'Last signed up at', 'Signup count']);
    const rows = signups.map((signup) =>
      toCsvRow([
        signup.email,
        signup.name,
        signup.firstLeadMagnetTitle,
        signup.firstLeadMagnetSlug,
        formatTimestamp(signup.firstSignupAt),
        formatTimestamp(signup.latestSignupAt),
        String(signup.signupCount),
      ])
    );
    const csv = `${header}\n${rows.join('\n')}\n`;
    const filename = `magnets-signups-${new Date().toISOString().slice(0, 10)}.csv`;

    log.info('Signups exported', {
      route: '/api/signups/export',
      method: 'GET',
      status: 200,
      userId,
      accountId,
      extra: {
        count: signups.length,
        leadMagnetId: leadMagnetId || undefined,
        searchApplied: Boolean(search),
      },
    });

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    log.error('Signups export failed', {
      route: '/api/signups/export',
      method: 'GET',
      status: 500,
      userId,
      accountId,
      extra: { error: err },
    });
    return new Response(JSON.stringify({ error: 'Export failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
