import { NextResponse, type NextRequest } from 'next/server';
import { requireDashboardPayload } from '@/lib/auth';
import {
  AccountDomainMutationInProgressError,
  getAccountWithSecrets,
  withAccountDomainMutationLock,
} from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { isVercelConfigured, verifyDomain, VercelApiError } from '@/lib/vercel';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let accountId: string | undefined;
  try {
    const payload = await requireDashboardPayload();
    accountId = payload.account.id;
    await enforceRateLimits([
      { identifier: payload.user.id, limit: 1, scope: 'domain:verify-routing:user', windowSeconds: 60 },
      { identifier: requestIp(request), limit: 15, scope: 'domain:verify-routing:ip', windowSeconds: 60 },
    ]);

    return await withAccountDomainMutationLock(payload.account.id, async () => {
      // Re-read under the domain lock so a concurrent domain change cannot
      // verify a hostname that this account has just disconnected.
      const account = await getAccountWithSecrets(payload.account.id);
      const host = account?.domain && account.subdomain
        ? `${account.subdomain}.${account.domain}`.toLowerCase()
        : '';
      if (!account?.domainVerifiedAt || !host || account.domainAttachedHost !== host) {
        return NextResponse.json(
          { error: 'Verify ownership and connect the subdomain before checking routing.' },
          { status: 409 }
        );
      }
      if (!isVercelConfigured()) {
        return NextResponse.json(
          { error: 'The publishing host is not configured on the server. Try again later.' },
          { status: 503 }
        );
      }

      const status = await verifyDomain(host);
      if (!status?.configured) {
        return NextResponse.json({ error: 'Reconnect the subdomain before checking again.' }, { status: 409 });
      }
      return NextResponse.json({ verified: status.verified });
    });
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    if (error instanceof AccountDomainMutationInProgressError) {
      return NextResponse.json(
        { error: 'Another domain change is in progress. Wait a moment and try again.' },
        { status: 409 }
      );
    }
    if (error instanceof VercelApiError && error.status === 400) {
      return NextResponse.json(
        { error: 'Vercel could not verify the TXT record yet. Check that it matches the record shown, then try again in a minute.' },
        { status: 400 }
      );
    }
    log.warn('Publishing verification failed', {
      route: '/api/domain/verify-routing',
      method: 'POST',
      accountId,
      extra: { error },
    });
    return NextResponse.json(
      { error: 'Could not verify publishing right now. Try again in a minute.' },
      { status: 502 }
    );
  }
}
