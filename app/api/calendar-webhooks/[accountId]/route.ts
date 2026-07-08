import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { stopAccountFollowUpSequencesForEmail } from '@/lib/follow-up-sequences';
import { getAccountWithSecrets } from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { log } from '@/lib/logger';

const ROUTE = '/api/calendar-webhooks/[accountId]';
const paramsSchema = z.object({
  accountId: z.string().uuid(),
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
    ['payload', 'booking', 'attendees', '0', 'email'],
    ['payload', 'booking', 'user', 'email'],
    ['data', 'attendees', '0', 'email'],
    ['data', 'booking', 'attendees', '0', 'email'],
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
    stringAt(body, ['data', 'triggerEvent']),
  ].find(Boolean) || '';
}

function isBookingCreatedEvent(body: unknown) {
  const eventType = extractEventType(body).toLowerCase();
  return eventType === 'invitee.created' ||
    eventType === 'booking_created' ||
    eventType === 'booking.created' ||
    eventType === 'bookingcreated';
}

function verifyCalComSignature(secret: string, bodyText: string, signature: string) {
  const cleanSignature = signature.trim().replace(/^sha256=/i, '');
  if (!cleanSignature) return false;

  const expected = createHmac('sha256', secret).update(bodyText).digest('hex');
  return safeEqual(cleanSignature, expected);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  let accountId: string | undefined;

  try {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: 'Invalid webhook URL' }, { status: 400 });
    }
    accountId = parsedParams.data.accountId;

    await enforceRateLimits([
      {
        identifier: requestIp(request),
        limit: 240,
        scope: 'calendar-webhook:ip',
        windowSeconds: 60 * 5,
      },
      {
        identifier: accountId,
        limit: 240,
        scope: 'calendar-webhook:account',
        windowSeconds: 60 * 5,
      },
    ]);

    const token = request.nextUrl.searchParams.get('token') || '';
    const account = await getAccountWithSecrets(accountId);
    if (!account) {
      return NextResponse.json({ error: 'Webhook target not found' }, { status: 404 });
    }

    if (!account.calendarWebhookEnabled || !account.calendarWebhookToken) {
      return NextResponse.json({ error: 'Calendar webhooks are not enabled' }, { status: 403 });
    }
    if (!token || !safeEqual(token, account.calendarWebhookToken)) {
      return NextResponse.json({ error: 'Invalid webhook token' }, { status: 401 });
    }

    const bodyText = await request.text();
    const signature = request.headers.get('x-cal-signature-256') || '';
    if (
      account.calendarProvider === 'calcom' &&
      account.calendarWebhookSecret &&
      signature &&
      !verifyCalComSignature(account.calendarWebhookSecret, bodyText, signature)
    ) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    let body: unknown = null;
    try {
      body = bodyText ? JSON.parse(bodyText) as unknown : null;
    } catch {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }
    if (!isBookingCreatedEvent(body)) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const email = extractInviteeEmail(body);
    if (!email) {
      log.warn('Calendar webhook missing invitee email', {
        route: ROUTE,
        method: 'POST',
        status: 202,
        accountId,
        extra: { eventType: extractEventType(body), provider: account.calendarProvider },
      });
      return NextResponse.json({ ok: true, ignored: true });
    }

    const stopped = await stopAccountFollowUpSequencesForEmail({
      account,
      email,
      reason: 'booked',
    });

    log.info('Calendar webhook processed', {
      route: ROUTE,
      method: 'POST',
      status: 200,
      accountId,
      extra: {
        provider: account.calendarProvider,
        stopped: stopped.stopped,
        stoppedCount: stopped.stoppedCount,
      },
    });

    return NextResponse.json({
      ok: true,
      stopped: stopped.stopped,
      stoppedCount: stopped.stoppedCount,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return rateLimitResponse(error);
    }

    log.error('Calendar webhook failed', {
      route: ROUTE,
      method: 'POST',
      status: 500,
      accountId,
      extra: { error },
    });
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
}
