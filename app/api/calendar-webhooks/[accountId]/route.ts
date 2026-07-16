import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  calendarEmailFingerprint,
  extractCalendarEventType,
  extractCalendarInviteeEmail,
  isCalendarBookingEvent,
} from '@/lib/calendar-webhook-payload';
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
const MAX_WEBHOOK_BODY_BYTES = 512 * 1024;
const paramsSchema = z.object({
  accountId: z.string().uuid(),
}).strict();

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function verifyCalComSignature(secret: string, bodyText: string, signature: string) {
  const cleanSignature = signature.trim().replace(/^sha256=/i, '');
  if (!cleanSignature) return false;

  const hmac = createHmac('sha256', secret).update(bodyText);
  const expected = hmac.digest();
  const candidates = [
    expected.toString('hex'),
    expected.toString('base64'),
    expected.toString('base64url'),
  ];

  return candidates.some((candidate) => safeEqual(cleanSignature, candidate));
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

    await enforceRateLimits([{
      identifier: requestIp(request),
      limit: 240,
      scope: 'calendar-webhook:ip',
      windowSeconds: 60 * 5,
    }]);

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

    await enforceRateLimits([{
      identifier: accountId,
      limit: 240,
      scope: 'calendar-webhook:account',
      windowSeconds: 60 * 5,
    }]);

    const bodyText = await request.text();
    if (Buffer.byteLength(bodyText, 'utf8') > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json({ error: 'Webhook payload is too large' }, { status: 413 });
    }
    const signature = request.headers.get('x-cal-signature-256') || '';
    if (
      account.calendarProvider === 'calcom' &&
      account.calendarWebhookSecret &&
      signature &&
      !verifyCalComSignature(account.calendarWebhookSecret, bodyText, signature)
    ) {
      // Cal.com signatures are a useful extra check, but the high-entropy
      // webhook URL token above is the hard auth gate. Continue silently so
      // old/recreated Cal.com webhooks do not spam production logs.
    }

    let body: unknown = null;
    try {
      body = bodyText ? JSON.parse(bodyText) as unknown : null;
    } catch {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }
    const eventType = extractCalendarEventType(body);
    if (!isCalendarBookingEvent(body)) {
      return NextResponse.json({ ok: true, ignored: true, eventType });
    }

    const email = extractCalendarInviteeEmail(body);
    if (!email) {
      log.warn('Calendar webhook missing invitee email', {
        route: ROUTE,
        method: 'POST',
        status: 202,
        accountId,
        extra: { eventType, provider: account.calendarProvider },
      });
      return NextResponse.json({ ok: true, ignored: true, eventType });
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
        eventType,
        emailFingerprint: calendarEmailFingerprint(email),
        stopped: stopped.stopped,
        stoppedCount: stopped.stoppedCount,
      },
    });

    return NextResponse.json({
      ok: true,
      eventType,
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
