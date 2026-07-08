import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function stringAt(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null || !(key in current)) return '';
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : '';
}

function findEmail(value: unknown, depth = 0): string {
  if (depth > 6 || value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    return emailRegex.test(trimmed) ? trimmed : '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findEmail(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';

  const object = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(object)) {
    if (key.toLowerCase().includes('email')) {
      const found = findEmail(item, depth + 1);
      if (found) return found;
    }
  }
  for (const item of Object.values(object)) {
    const found = findEmail(item, depth + 1);
    if (found) return found;
  }
  return '';
}

function extractInviteeEmail(body: unknown) {
  const candidates = [
    ['payload', 'email'],
    ['payload', 'invitee', 'email'],
    ['payload', 'attendee', 'email'],
    ['payload', 'attendees', '0', 'email'],
    ['payload', 'responses', 'email', 'value'],
    ['email'],
    ['invitee', 'email'],
    ['attendee', 'email'],
  ];

  for (const path of candidates) {
    const value = stringAt(body, path);
    if (emailRegex.test(value.trim().toLowerCase())) {
      return value.trim().toLowerCase();
    }
  }

  return findEmail(body);
}

function extractEventType(body: unknown) {
  return [
    stringAt(body, ['event']),
    stringAt(body, ['type']),
    stringAt(body, ['triggerEvent']),
    stringAt(body, ['event_type']),
    stringAt(body, ['payload', 'event']),
    stringAt(body, ['payload', 'type']),
    stringAt(body, ['payload', 'triggerEvent']),
  ].find(Boolean) || '';
}

function isBookingCreatedEvent(body: unknown) {
  const eventType = extractEventType(body).toLowerCase();
  return eventType === 'invitee.created' ||
    eventType === 'booking_created' ||
    eventType === 'booking.created' ||
    eventType === 'bookingcreated';
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
    if (!isBookingCreatedEvent(body)) {
      return NextResponse.json({ ok: true, ignored: true });
    }
    if (!lookup.leadMagnet.followUpStopOnBooking) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const email = extractInviteeEmail(body);
    if (!email) {
      log.warn('Calendar webhook missing invitee email', {
        route: ROUTE,
        method: 'POST',
        status: 202,
        accountId,
        extra: { leadMagnetId, eventType: extractEventType(body) },
      });
      return NextResponse.json({ ok: true, ignored: true });
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
      extra: { leadMagnetId, stopped: stopped.stopped },
    });

    return NextResponse.json({ ok: true, stopped: stopped.stopped });
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
