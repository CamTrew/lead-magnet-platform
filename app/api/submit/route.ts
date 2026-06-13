import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { addToBeehiiv } from '@/lib/beehiiv';
import { addToSubstack } from '@/lib/substack';
import { findLeadMagnet, recordSubmission } from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { EmailDeliveryError, sendLeadMagnetEmail } from '@/lib/resend';
import { log } from '@/lib/logger';

const ROUTE = '/api/submit';

const schema = z.object({
  accountId: z.string().uuid(),
  leadMagnetId: z.string().uuid(),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const { accountId, leadMagnetId, slug, name, email } = schema.parse(body);

    await enforceRateLimits([
      {
        identifier: requestIp(request),
        limit: 40,
        scope: 'submit:ip',
        windowSeconds: 15 * 60,
      },
      {
        identifier: `${leadMagnetId}:${email}`,
        limit: 5,
        scope: 'submit:lead-magnet-email',
        windowSeconds: 60 * 60,
      },
    ]);

    const result = await findLeadMagnet(accountId, leadMagnetId);

    if (!result || result.leadMagnet.slug !== slug || !result.leadMagnet.published) {
      return NextResponse.json({ error: 'Lead magnet not found' }, { status: 404 });
    }

    try {
      await sendLeadMagnetEmail({
        account: result.account,
        magnet: result.leadMagnet,
        to: email,
        name,
      });
    } catch (sendError) {
      if (sendError instanceof EmailDeliveryError) {
        log.warn('Email delivery failed', {
          route: ROUTE,
          method: 'POST',
          accountId,
          extra: { leadMagnetId, error: sendError },
        });
        return NextResponse.json(
          {
            error:
              'We could not send the resource right now. Please try again in a minute or contact the page owner.',
          },
          { status: 502 }
        );
      }
      throw sendError;
    }

    try {
      await addToBeehiiv(result.account, email, name);
    } catch (beehiivError) {
      log.warn('Beehiiv subscribe failed (non-fatal)', {
        route: ROUTE,
        method: 'POST',
        accountId,
        extra: { leadMagnetId, error: beehiivError },
      });
    }

    try {
      await addToSubstack(result.account, email);
    } catch (substackError) {
      log.warn('Substack subscribe failed (non-fatal)', {
        route: ROUTE,
        method: 'POST',
        accountId,
        extra: { leadMagnetId, error: substackError },
      });
    }

    await recordSubmission({
      accountId,
      leadMagnetId,
      name,
      email,
    });

    log.info('Submission accepted', {
      route: ROUTE,
      method: 'POST',
      status: 200,
      accountId,
      extra: { leadMagnetId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Please enter a valid name and email address' },
        { status: 400 }
      );
    }

    if (error instanceof RateLimitError) {
      return rateLimitResponse(error);
    }

    log.error('Submission failed', {
      route: ROUTE,
      method: 'POST',
      status: 500,
      extra: { error },
    });

    return NextResponse.json(
      { error: 'Failed to process submission' },
      { status: 500 }
    );
  }
}
