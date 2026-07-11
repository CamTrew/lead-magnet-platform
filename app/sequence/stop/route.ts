import { NextRequest, NextResponse } from 'next/server';
import { stopLeadMagnetFollowUpSequence } from '@/lib/follow-up-sequences';
import { verifyFollowUpStopToken } from '@/lib/follow-up-opt-out';
import { log } from '@/lib/logger';
import { findLeadMagnet } from '@/lib/platform-store';
import {
  enforceRateLimits,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';

const ROUTE = '/sequence/stop';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pageHtml({
  body,
  title,
}: {
  title: string;
  body: string;
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f8f7f4;
        color: #111111;
        font-family: Arial, sans-serif;
      }
      main {
        width: min(92vw, 440px);
        border: 1px solid #ddd8cf;
        border-radius: 16px;
        background: #ffffff;
        padding: 32px;
        box-shadow: 0 24px 60px rgb(17 17 17 / 0.08);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 26px;
        line-height: 1.12;
      }
      p {
        margin: 0 0 22px;
        color: #6f6a61;
        font-size: 15px;
        line-height: 1.55;
      }
      button, a.button {
        display: inline-flex;
        min-height: 44px;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 10px;
        background: #111111;
        color: #ffffff;
        padding: 0 18px;
        font: 700 14px/1 Arial, sans-serif;
        text-decoration: none;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>`;
}

function htmlResponse(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function invalidPage() {
  return htmlResponse(
    pageHtml({
      title: 'Link unavailable',
      body: `
        <h1>This link is not available</h1>
        <p>The stop link is invalid or has expired. You can ignore the next email or contact the page owner.</p>
      `,
    }),
    400
  );
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || '';
  const verified = verifyFollowUpStopToken(token);

  if (!verified) return invalidPage();

  return htmlResponse(
    pageHtml({
      title: 'Stop follow-up emails',
      body: `
        <h1>Stop these follow-up emails?</h1>
        <p>This will stop the sequence for ${escapeHtml(verified.email)}. You will still keep the resource email you already received.</p>
        <form method="post" action="/sequence/stop">
          <input type="hidden" name="token" value="${escapeHtml(token)}" />
          <button type="submit">Stop these emails</button>
        </form>
      `,
    })
  );
}

export async function POST(request: NextRequest) {
  let accountId: string | undefined;
  let leadMagnetId: string | undefined;

  try {
    await enforceRateLimits([
      {
        identifier: requestIp(request),
        limit: 30,
        scope: 'sequence-stop:ip',
        windowSeconds: 60 * 10,
      },
    ]);

    const formData = await request.formData().catch(() => null);
    const token = String(formData?.get('token') || '');
    const verified = verifyFollowUpStopToken(token);

    if (!verified) return invalidPage();

    accountId = verified.accountId;
    leadMagnetId = verified.leadMagnetId;
    const lookup = await findLeadMagnet(verified.accountId, verified.leadMagnetId);

    if (!lookup) return invalidPage();

    const stopped = await stopLeadMagnetFollowUpSequence({
      account: lookup.account,
      leadMagnetId: verified.leadMagnetId,
      email: verified.email,
      reason: 'recipient',
    });

    log.info('Follow-up sequence stopped by recipient', {
      route: ROUTE,
      method: 'POST',
      status: 200,
      accountId,
      extra: { leadMagnetId, stopped: stopped.stopped },
    });

    return htmlResponse(
      pageHtml({
        title: 'Follow-up emails stopped',
        body: `
          <h1>You are out of the sequence</h1>
          <p>We have stopped follow-up emails for ${escapeHtml(verified.email)}. You can close this page.</p>
        `,
      })
    );
  } catch (error) {
    if (error instanceof RateLimitError) {
      return htmlResponse(
        pageHtml({
          title: 'Try again shortly',
          body: `
            <h1>Too many attempts</h1>
            <p>Please wait a minute and try again.</p>
          `,
        }),
        429
      );
    }

    log.error('Recipient follow-up sequence stop failed', {
      route: ROUTE,
      method: 'POST',
      status: 500,
      accountId,
      extra: { leadMagnetId, error },
    });

    return htmlResponse(
      pageHtml({
        title: 'Could not stop emails',
        body: `
          <h1>Could not stop these emails</h1>
          <p>Please try again in a minute or contact the page owner.</p>
        `,
      }),
      500
    );
  }
}
