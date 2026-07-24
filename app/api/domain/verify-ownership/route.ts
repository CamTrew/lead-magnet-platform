import { promises as dns, Resolver as CallbackResolver } from 'node:dns';
import { promisify } from 'node:util';
import { NextResponse, type NextRequest } from 'next/server';
import { requireDashboardPayload } from '@/lib/auth';
import {
  getOrCreateDomainVerificationToken,
  markDomainVerified,
} from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import { buildDomainOwnershipRecord } from '@/lib/dns-records';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ROUTE = '/api/domain/verify-ownership';

function isMissingDnsError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    ['ENODATA', 'ENOTFOUND', 'ENOTIMP', 'ESERVFAIL', 'ETIMEOUT'].includes(String(error.code))
  );
}

/**
 * Resolve TXT for a host. We do NOT use Node's default DNS path because:
 *  - libuv's system resolver caches negative answers aggressively, so a "not
 *    found" can persist for minutes after the record actually goes live.
 *  - On serverless platforms the upstream resolver can be stale or shared,
 *    so two different invocations may see different answers for the same
 *    name within the same minute.
 *
 * We query a public resolver directly and fall back to the system path if
 * that fails. Returns an array of full TXT strings (multi-chunk records are
 * already joined for us by Node's TXT parser).
 */
async function resolveTxtFresh(host: string): Promise<string[]> {
  const tryWith = async (servers: string[] | null) => {
    const resolver = new CallbackResolver();
    if (servers) resolver.setServers(servers);
    const resolveTxt = promisify(resolver.resolveTxt.bind(resolver));
    const records = await resolveTxt(host) as unknown as string[][];
    return records.map((parts) => parts.join('').trim());
  };

  // Cloudflare and Google. Whichever responds first wins. If both fail we
  // bubble the error so the caller can show "not propagated yet".
  try {
    return await tryWith(['1.1.1.1', '8.8.8.8']);
  } catch {
    // Fall back to the system resolver. If that errors too, the caller's
    // try/catch wraps it as "not propagated yet" without leaking the
    // upstream error to the user.
    return dns.resolveTxt(host).then((records) =>
      records.map((parts) => parts.join('').trim())
    );
  }
}

export async function POST(request: NextRequest) {
  let userId: string | undefined;
  let accountId: string | undefined;
  try {
    const payload = await requireDashboardPayload();
    userId = payload.user.id;
    accountId = payload.account.id;

    // Hard-enforced 1-minute cooldown per user on the verification check.
    // Anything faster spams Resend / our DNS resolver for no benefit since
    // DNS propagation takes minutes. Per-IP fan-out kept separate to absorb
    // shared-network noise without locking out legitimate users.
    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 1,
        scope: 'domain:verify-ownership:user',
        windowSeconds: 60,
      },
      {
        identifier: requestIp(request),
        limit: 30,
        scope: 'domain:verify-ownership:ip',
        windowSeconds: 60,
      },
    ]);

    const { account } = payload;
    const domain = account.domain?.trim().toLowerCase();
    if (!domain) {
      return NextResponse.json(
        { error: 'Add your domain in Publishing before verifying.' },
        { status: 400 }
      );
    }

    const token = await getOrCreateDomainVerificationToken(accountId);
    if (!token) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const expectedRecord = buildDomainOwnershipRecord(domain, token);
    const recordName = expectedRecord.lookupName;
    let found: string[] = [];
    try {
      found = await resolveTxtFresh(recordName);
    } catch (err) {
      const missing = isMissingDnsError(err);
      if (!missing) {
        log.warn('TXT lookup error', {
          route: ROUTE,
          method: 'POST',
          userId,
          accountId,
          extra: { error: err },
        });
      }
      return NextResponse.json({
        verified: false,
        message: missing
          ? `No TXT record found at ${recordName}. Check that the root domain above is spelled correctly and that your DNS provider did not append the domain twice. DNS can take 1 to 60 minutes to propagate.`
          : `We could not query ${recordName} right now. Try again in a minute.`,
        expected: {
          type: expectedRecord.type,
          name: expectedRecord.lookupName,
          value: expectedRecord.value,
        },
      });
    }

    if (!found.includes(token)) {
      // Help diagnose mismatches without dumping random TXT values back to
      // the UI — only show the user the *prefix* of any unexpected record
      // we found so they can tell whether it's their old verify token or
      // an unrelated DNS entry.
      const preview = found.map((v) =>
        v.length > 60 ? `${v.slice(0, 60)}…` : v
      );
      return NextResponse.json({
        verified: false,
        message:
          found.length > 0
            ? `Found ${found.length} TXT record(s) at ${recordName}, but none match the expected value. Copy it exactly, including the "magnets-verify-" prefix. If you recently changed your domain in Configure, the token may have rotated. Copy the value shown below.`
            : `No TXT record found at ${recordName} yet. DNS can take 1 to 60 minutes to propagate after you save it at your DNS provider.`,
        expected: {
          type: expectedRecord.type,
          name: expectedRecord.lookupName,
          value: expectedRecord.value,
        },
        found: preview,
      });
    }

    const updated = await markDomainVerified(accountId);
    log.info('Domain ownership verified', {
      route: ROUTE,
      method: 'POST',
      status: 200,
      userId,
      accountId,
      extra: { domain },
    });

    return NextResponse.json({
      verified: true,
      verifiedAt: updated?.domainVerifiedAt || new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    log.error('Verify ownership failed', {
      route: ROUTE,
      method: 'POST',
      status: 500,
      userId,
      accountId,
      extra: { error: err },
    });
    return NextResponse.json({ error: 'Verification check failed' }, { status: 500 });
  }
}
