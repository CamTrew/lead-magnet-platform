import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { addToBeehiiv } from '@/lib/beehiiv';
import { addToSubstack } from '@/lib/substack';
import { findLeadMagnet, recordSubmission } from '@/lib/platform-store';
import { isEmailDeliveryReady } from '@/lib/setup';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { EmailDeliveryError, sendLeadMagnetEmail } from '@/lib/resend';
import { startLeadMagnetFollowUpSequence } from '@/lib/follow-up-sequences';
import { log } from '@/lib/logger';
import { sendSlackSignupNotification } from '@/lib/slack';
import { upsertPipedrivePerson } from '@/lib/pipedrive';
import type { AccountSettings, LeadMagnet } from '@/lib/types';

const ROUTE = '/api/submit';

const schema = z.object({
  accountId: z.string().uuid(),
  leadMagnetId: z.string().uuid(),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
}).strict();

async function runPostSubmissionWork({
  account,
  email,
  leadMagnet,
  name,
}: {
  account: AccountSettings;
  leadMagnet: LeadMagnet;
  name: string;
  email: string;
}) {
  const tasks = [
    {
      name: 'follow-up sequence start',
      run: async () => {
        const followUp = await startLeadMagnetFollowUpSequence({
          account,
          magnet: leadMagnet,
          email,
          name,
        });
        if (!followUp.started) {
          log.info('Follow-up sequence not started', {
            route: ROUTE,
            method: 'POST',
            status: 200,
            accountId: account.id,
            extra: { leadMagnetId: leadMagnet.id, reason: followUp.reason },
          });
        }
      },
    },
    {
      name: 'Beehiiv subscribe and tag',
      run: () => addToBeehiiv({ account, email, leadMagnet, name }),
    },
    { name: 'Substack subscribe', run: () => addToSubstack(account, email) },
    {
      name: 'Slack signup notification',
      run: () => sendSlackSignupNotification({ account, leadMagnet, email, name }),
    },
    { name: 'Pipedrive signup sync', run: () => upsertPipedrivePerson({ account, email, name }) },
  ];

  const results = await Promise.allSettled(tasks.map((task) => task.run()));
  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      log.warn(`${tasks[index].name} failed (non-fatal)`, {
        route: ROUTE,
        method: 'POST',
        accountId: account.id,
        extra: { leadMagnetId: leadMagnet.id, error: result.reason },
      });
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const { accountId, leadMagnetId, slug, name, email } = schema.parse(body);
    const normalizedEmail = email.toLowerCase();

    await enforceRateLimits([{
      identifier: requestIp(request),
      limit: 40,
      scope: 'submit:ip',
      windowSeconds: 15 * 60,
    }]);

    const result = await findLeadMagnet(accountId, leadMagnetId);

    if (!result || result.leadMagnet.slug !== slug || !result.leadMagnet.published) {
      return NextResponse.json({ error: 'Lead magnet not found' }, { status: 404 });
    }

    await enforceRateLimits([
      {
        identifier: accountId,
        limit: 3000,
        scope: 'submit:account',
        windowSeconds: 60 * 60,
      },
      {
        identifier: leadMagnetId,
        limit: 1500,
        scope: 'submit:lead-magnet',
        windowSeconds: 60 * 60,
      },
      {
        identifier: `${accountId}:${normalizedEmail}`,
        limit: 10,
        scope: 'submit:account-email',
        windowSeconds: 60 * 60,
      },
      {
        identifier: `${leadMagnetId}:${normalizedEmail}`,
        limit: 5,
        scope: 'submit:lead-magnet-email',
        windowSeconds: 60 * 60,
      },
    ]);

    const senderReady = isEmailDeliveryReady(result.account);

    if (!senderReady) {
      log.warn('Email delivery blocked: unsafe sender configuration', {
        route: ROUTE,
        method: 'POST',
        status: 409,
        accountId,
        extra: { leadMagnetId },
      });
      return NextResponse.json(
        { error: 'Email delivery is not configured yet. Please contact the page owner.' },
        { status: 409 }
      );
    }

    try {
      await sendLeadMagnetEmail({
        account: result.account,
        magnet: result.leadMagnet,
        to: normalizedEmail,
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

    const submission = await recordSubmission({
      accountId,
      leadMagnetId,
      name,
      email: normalizedEmail,
    });

    after(() =>
      runPostSubmissionWork({
        account: result.account,
        leadMagnet: result.leadMagnet,
        email: normalizedEmail,
        name,
      })
    );

    log.info('Submission accepted', {
      route: ROUTE,
      method: 'POST',
      status: 200,
      accountId,
      extra: { leadMagnetId },
    });

    return NextResponse.json({ success: true, submissionId: submission.id });
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
