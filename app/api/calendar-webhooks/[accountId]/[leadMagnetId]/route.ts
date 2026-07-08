import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  calendarEmailFingerprint,
  extractCalendarEventType,
  extractCalendarInviteeEmail,
  isCalendarBookingEvent,
} from '@/lib/calendar-webhook-payload';
import { stopLeadMagnetFollowUpSequence } from '@/lib/follow-up-sequences';
import { findLeadMagnet } from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { log } from '@/lib/logger';

const ROUTE = '/api/calendar-webhooks/[accountId]/[leadMagnetId]';
const paramsSchema = z.object({
  accountId: z.string().uuid(),
  leadMagnetId: z.string().uuid(),
});

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string; leadMagnetId: string }> }
) {
  let accountId: string | undefined;
  let leadMagnetId: string | undefined;

  try {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: 'Invalid webhook URL' }, { status: 400 });
    }
    accountId = parsedParams.data.accountId;
    leadMagnetId = parsedParams.data.leadMagnetId;

    await enforceRateLimits([
      {
        identifier: requestIp(request),
        limit: 240,
        scope: 'calendar-webhook:ip',
        windowSeconds: 60 * 5,
      },
      {
        identifier: `${accountId}:${leadMagnetId}`,
        limit: 240,
        scope: 'calendar-webhook:magnet',
        windowSeconds: 60 * 5,
      },
    ]);

    const token = request.nextUrl.searchParams.get('token') || '';
    const lookup = await findLeadMagnet(accountId, leadMagnetId);
    if (!lookup) {
      return NextResponse.json({ error: 'Webhook target not found' }, { status: 404 });
    }

    if (!lookup.account.calendarWebhookEnabled || !lookup.account.calendarWebhookToken) {
      return NextResponse.json({ error: 'Calendar webhooks are not enabled' }, { status: 403 });
    }
    if (!token || !safeEqual(token, lookup.account.calendarWebhookToken)) {
      return NextResponse.json({ error: 'Invalid webhook token' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const eventType = extractCalendarEventType(body);
    if (!isCalendarBookingEvent(body)) {
      return NextResponse.json({ ok: true, ignored: true, eventType });
    }
    if (!lookup.leadMagnet.followUpStopOnBooking) {
      return NextResponse.json({ ok: true, ignored: true, eventType });
    }

    const email = extractCalendarInviteeEmail(body);
    if (!email) {
      log.warn('Calendar webhook missing invitee email', {
        route: ROUTE,
        method: 'POST',
        status: 202,
        accountId,
        extra: { leadMagnetId, eventType },
      });
      return NextResponse.json({ ok: true, ignored: true, eventType });
    }

    const stopped = await stopLeadMagnetFollowUpSequence({
      account: lookup.account,
      leadMagnetId,
      email,
      reason: 'booked',
    });

    log.info('Calendar webhook processed', {
      route: ROUTE,
      method: 'POST',
      status: 200,
      accountId,
      extra: {
        leadMagnetId,
        eventType,
        emailFingerprint: calendarEmailFingerprint(email),
        stopped: stopped.stopped,
      },
    });

    return NextResponse.json({ ok: true, eventType, stopped: stopped.stopped });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return rateLimitResponse(error);
    }

    log.error('Calendar webhook failed', {
      route: ROUTE,
      method: 'POST',
      status: 500,
      accountId,
      extra: { leadMagnetId, error },
    });
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
}
