import {
  promises as dns,
  Resolver as CallbackResolver,
  type MxRecord,
} from 'node:dns';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import {
  parseSenderEmail,
  senderMatchesAccountDomain,
  type DnsRecordDefinition,
} from '@/lib/dns-records';
import { getAccountWithSecrets } from '@/lib/platform-store';
import { hasPlatformResendApiKey, resolveResendApiKey } from '@/lib/platform-resend';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { log, redactForLog } from '@/lib/logger';

const ROUTE_NAME = '/api/dns/verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RecordStatus = 'verified' | 'missing' | 'error';

type VerifiedDnsRecord = DnsRecordDefinition & {
  found: string[];
  message: string;
  status: RecordStatus;
};

type ResendDnsRecord = {
  name: string;
  record: string;
  type: 'CNAME' | 'MX' | 'TXT';
  value: string;
};

type ResendDomainSetup = {
  domainId: string;
  domainName: string;
  domainStatus: string;
  records: DnsRecordDefinition[];
};

const schema = z.object({
  section: z.enum(['publishing', 'delivery']),
  domain: z.string().optional(),
  subdomain: z.string().optional(),
  resendFromEmail: z.string().optional(),
}).strict();

function cleanDnsValue(value: string) {
  return value.trim().toLowerCase().replace(/^"|"$/g, '').replace(/\.$/, '');
}

function displayDnsValue(value: string) {
  return value.trim().replace(/^"|"$/g, '');
}

function isMissingDnsError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    ['ENODATA', 'ENOTFOUND', 'ENOTIMP', 'ESERVFAIL', 'ETIMEOUT'].includes(String(error.code))
  );
}

function recordVerified(record: DnsRecordDefinition, found: string[]) {
  const expected = cleanDnsValue(record.value);
  const normalisedFound = found.map(cleanDnsValue);

  if (record.type === 'CNAME') {
    return normalisedFound.some((value) => value === expected);
  }

  if (record.type === 'MX') {
    return normalisedFound.some((value) => value === expected);
  }

  if (record.id === 'email-dmarc') {
    return normalisedFound.some((value) => value.startsWith('v=dmarc1') && value.includes('p='));
  }

  return normalisedFound.some((value) => value === expected);
}

function lookupNameForProviderRecord(name: string, domain: string) {
  const cleanName = cleanDnsValue(name);
  const cleanDomain = cleanDnsValue(domain);

  if (cleanName === '@') return cleanDomain;
  if (cleanName === cleanDomain || cleanName.endsWith(`.${cleanDomain}`)) return cleanName;

  return `${cleanName}.${cleanDomain}`;
}

function mapResendRecord(record: ResendDnsRecord, domain: string, index: number): DnsRecordDefinition {
  return {
    id: `email-${record.record.toLowerCase()}-${index}`,
    lookupName: lookupNameForProviderRecord(record.name, domain),
    name: record.name,
    type: record.type,
    value: displayDnsValue(record.value),
  };
}

function normaliseDomainForResend(value: string) {
  // Strip what users commonly add by accident: schemes, www., paths, ports,
  // wrapping whitespace, trailing dots. Compare on the apex only.
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#:].*$/, '')
    .replace(/\.+$/, '');
}

async function getResendEmailDnsSetup(
  domain: string,
  resendApiKey: string,
  returnPath: string | null,
  rootDomain: string
): Promise<ResendDomainSetup> {
  if (!resendApiKey) {
    throw new Error('Email sending is not configured yet. Contact support if this keeps happening.');
  }

  const resend = new Resend(resendApiKey);
  const existingDomains = await resend.domains.list();

  if (existingDomains.error) {
    throw new Error(existingDomains.error.message || 'Resend domains could not be loaded.');
  }

  const want = normaliseDomainForResend(domain);
  const root = normaliseDomainForResend(rootDomain) || want;
  const known = existingDomains.data.data.map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    normalised: normaliseDomainForResend(item.name),
  }));
  // Match priority: exact host first; otherwise pick any Resend domain that
  // sits at the same root as our sender. e.g. for sender send.headcount.so
  // we'll happily reuse a Resend domain at `headcount.so` (it'll have a
  // return-path baked in that points back to `send`). This stops us from
  // failing the plan-limit check just because the user's earlier setup
  // landed on a slightly different Resend domain name.
  const existingDomain =
    known.find((item) => item.normalised === want) ??
    known.find(
      (item) => item.normalised === root || item.normalised.endsWith(`.${root}`)
    );

  // We only pass custom_return_path on CREATE — once a domain exists on
  // Resend, the return path is baked in and can't be changed without
  // deleting and recreating. If the caller picked a different return path
  // later, we have to surface that mismatch and let them decide; we never
  // delete the user's Resend domain silently.
  let domainResult;
  if (existingDomain) {
    domainResult = await resend.domains.get(existingDomain.id);
  } else {
    try {
      domainResult = await resend.domains.create({
        name: want,
        ...(returnPath ? { custom_return_path: returnPath } : {}),
      } as Parameters<typeof resend.domains.create>[0]);
    } catch (createErr) {
      // Wrap so the caller's catch can format the message correctly.
      throw createErr;
    }
  }

  if (domainResult.error) {
    const message = domainResult.error.message || '';
    const limitHit = /plan includes|upgrade to add more|exceeded the domain limit/i.test(message);
    if (limitHit) {
      const otherDomains = known
        .map((item) => item.name)
        .filter((name) => name && normaliseDomainForResend(name) !== want);
      const friendly = otherDomains.length
        ? `Your sending account already has ${otherDomains.length === 1 ? 'a domain set up' : 'domains set up'} (${otherDomains.join(', ')}) and the free plan only allows one. Either delete the existing one in Resend, switch to its API key for an account that already has ${want} verified, or upgrade your Resend plan.`
        : `Your sending account does not allow more domains on its current plan. Upgrade in Resend, or switch to an API key for an account that already has ${want} verified.`;
      throw new Error(friendly);
    }
    throw new Error(message || 'Resend domain records could not be loaded.');
  }

  // Resend returns record `name` values relative to the user's stored root
  // domain (verified against a live Resend account). For a Resend domain
  // `send.headcount.so` with custom_return_path='send', record names come
  // back as `send.send` / `resend._domainkey.send` and resolve at
  // send.send.headcount.so / resend._domainkey.send.headcount.so. So the
  // right anchor for stitching is the apex (`headcount.so`), not the Resend
  // domain.
  return {
    domainId: domainResult.data.id,
    domainName: domainResult.data.name,
    domainStatus: domainResult.data.status,
    records: domainResult.data.records.map((record, index) =>
      mapResendRecord(record as ResendDnsRecord, root, index)
    ),
  };
}

async function requestResendDomainVerification(resendApiKey: string, domainId: string) {
  const resend = new Resend(resendApiKey);
  const result = await resend.domains.verify(domainId);

  if (result.error) {
    throw new Error(result.error.message || 'Resend could not verify the domain yet.');
  }

  return result.data;
}

/**
 * Resolve a DNS record bypassing the system resolver. The default Node DNS
 * path on serverless platforms aggressively caches negative answers (NXDOMAIN
 * / NODATA) — so a record the user just added can stay reported as "missing"
 * for several minutes after it's actually live. Talking directly to a public
 * resolver (Cloudflare + Google) sidesteps that.
 *
 * Falls back to the system resolver if both public servers fail, so an
 * outbound block to 53/UDP doesn't mean every check returns ENOTFOUND.
 */
async function resolveFresh(
  host: string,
  type: 'CNAME' | 'MX' | 'TXT'
): Promise<string[]> {
  const tryWith = async (servers: string[] | null): Promise<string[]> => {
    const resolver = new CallbackResolver();
    if (servers) resolver.setServers(servers);
    if (type === 'CNAME') {
      const resolve = promisify(resolver.resolveCname.bind(resolver));
      return (await resolve(host)) as unknown as string[];
    }
    if (type === 'MX') {
      const resolve = promisify(resolver.resolveMx.bind(resolver));
      const rows = (await resolve(host)) as unknown as MxRecord[];
      return rows.map((entry) => entry.exchange);
    }
    const resolve = promisify(resolver.resolveTxt.bind(resolver));
    const rows = (await resolve(host)) as unknown as string[][];
    return rows.map((parts) => parts.join(''));
  };

  try {
    return await tryWith(['1.1.1.1', '8.8.8.8']);
  } catch {
    if (type === 'CNAME') return dns.resolveCname(host);
    if (type === 'MX')
      return (await dns.resolveMx(host)).map((entry) => entry.exchange);
    return (await dns.resolveTxt(host)).map((parts) => parts.join(''));
  }
}

async function lookupRecord(record: DnsRecordDefinition): Promise<VerifiedDnsRecord> {
  try {
    const found = await resolveFresh(record.lookupName, record.type);

    const verified = recordVerified(record, found);

    return {
      ...record,
      found,
      message: verified
        ? 'DNS matches.'
        : found.length
          ? 'A record exists, but it does not match this value.'
          : 'No record found.',
      status: verified ? 'verified' : 'missing',
    };
  } catch (error) {
    if (isMissingDnsError(error)) {
      return {
        ...record,
        found: [],
        message: 'No matching DNS record was found yet.',
        status: 'missing',
      };
    }

    return {
      ...record,
      found: [],
      message: 'DNS lookup failed. Try again in a minute.',
      status: 'error',
    };
  }
}

function scrubResendErrorMessage(message: string) {
  // Strip anything that looks like a Resend key from the error message before sending
  // it back to the client. The Resend SDK occasionally echoes the offending key.
  return message
    .replace(/re_[A-Za-z0-9_-]{8,}/g, '<redacted>')
    .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer <redacted>');
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  let userId: string | undefined;
  let accountId: string | undefined;
  try {
    const payload = await requireDashboardPayload();
    userId = payload.user.id;
    accountId = payload.account.id;

    // 1-minute cooldown per user. The delivery branch calls Resend's
    // /domains API which is rate-limited by them too, so this caps us well
    // before we hit Resend's ceiling.
    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 1,
        scope: 'dns:verify:user',
        windowSeconds: 60,
      },
      {
        identifier: requestIp(request),
        limit: 30,
        scope: 'dns:verify:ip',
        windowSeconds: 60,
      },
    ]);

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Check the DNS fields and try again.' }, { status: 400 });
    }

    let records: DnsRecordDefinition[];
    let resendSetup: ResendDomainSetup | null = null;
    let resendApiKeyForVerification = '';

    if (parsed.data.section === 'publishing') {
      // The publishing flow now lives in /api/domain/* (ownership TXT + attach +
      // status). Returning a clear 410 makes legacy clients fail loudly instead
      // of silently checking the wrong DNS values.
      return NextResponse.json(
        { error: 'This endpoint no longer handles publishing DNS. Use /api/domain/* instead.' },
        { status: 410 }
      );
    } else {
      const sender = parseSenderEmail(parsed.data.resendFromEmail || '');

      if (!sender) {
        return NextResponse.json(
          { error: 'Enter a sender like Your Brand <hello@example.com> before checking DNS.' },
          { status: 400 }
        );
      }

      const accountWithSecrets = await getAccountWithSecrets(payload.account.id);
      if (!accountWithSecrets) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }

      // A customer-owned Resend key only affects that customer's Resend
      // workspace. The Magnets-managed key is shared, so require the account
      // to have completed our ownership TXT check before it can create or
      // inspect a sending domain there. This prevents a user from consuming
      // the shared account's domain quota with a domain they do not control.
      const usingMagnetsManagedResend =
        !accountWithSecrets.resendApiKey && hasPlatformResendApiKey();
      if (usingMagnetsManagedResend && !accountWithSecrets.domainVerifiedAt) {
        return NextResponse.json(
          { error: 'Verify that you own this domain before setting up email sending.' },
          { status: 409 }
        );
      }

      if (
        !senderMatchesAccountDomain({
          domain: accountWithSecrets.domain,
          resendFromEmail: parsed.data.resendFromEmail || '',
          resendReturnPath: accountWithSecrets.resendReturnPath,
        })
      ) {
        return NextResponse.json(
          { error: 'Sender address must use the sending domain on this account.' },
          { status: 400 }
        );
      }

      // Resend's "domain" is whatever the user sends *from* — for
      // cam@send.headcount.so that's `send.headcount.so`. Resend then either
      // uses that host directly for its records, or namespaces them under a
      // `custom_return_path` subdomain. We only ask Resend to namespace
      // when the sender sits on the apex the user typed as their root
      // domain; if they're already on a subdomain (sender.domain !==
      // account.domain) the host IS the namespace and a return-path would
      // double it up.
      const senderDomain = normaliseDomainForResend(sender.domain);
      const rootDomain = normaliseDomainForResend(accountWithSecrets.domain);
      const senderIsApex = !rootDomain || senderDomain === rootDomain;
      const returnPath =
        senderIsApex && accountWithSecrets.resendReturnPath
          ? accountWithSecrets.resendReturnPath
          : null;
      try {
        resendSetup = await getResendEmailDnsSetup(
          senderDomain,
          resolveResendApiKey(accountWithSecrets),
          returnPath,
          rootDomain
        );
        resendApiKeyForVerification = resolveResendApiKey(accountWithSecrets);
        records = resendSetup.records;
      } catch (error) {
        const rawMessage = error instanceof Error
          ? error.message
          : 'Resend domain records could not be loaded.';
        log.warn('Resend DNS lookup failed', {
          route: ROUTE_NAME,
          method: 'POST',
          status: 502,
          userId,
          accountId,
          extra: { error: redactForLog(error) },
        });
        return NextResponse.json(
          { error: scrubResendErrorMessage(rawMessage) },
          { status: 502 }
        );
      }
    }

    const checkedRecords = await Promise.all(records.map(lookupRecord));
    const status = checkedRecords.every((record) => record.status === 'verified')
      ? 'verified'
      : checkedRecords.some((record) => record.status === 'error')
        ? 'error'
        : 'missing';
    let providerVerification:
      | { status: 'verified' | 'requested' | 'error'; message: string }
      | null = null;

    if (parsed.data.section === 'delivery' && status === 'verified' && resendSetup) {
      if (resendSetup.domainStatus === 'verified') {
        providerVerification = {
          status: 'verified',
          message: 'Resend has verified this sending domain.',
        };
      } else {
        try {
          await requestResendDomainVerification(resendApiKeyForVerification, resendSetup.domainId);
          providerVerification = {
            status: 'requested',
            message: 'Resend verification has started. Check again in a minute if sending is not enabled yet.',
          };
        } catch (error) {
          const rawMessage = error instanceof Error
            ? error.message
            : 'Resend could not verify the domain yet.';
          providerVerification = {
            status: 'error',
            message: scrubResendErrorMessage(rawMessage),
          };
          log.warn('Resend domain verify request failed', {
            route: ROUTE_NAME,
            method: 'POST',
            status: 502,
            userId,
            accountId,
            extra: {
              domainName: resendSetup.domainName,
              domainStatus: resendSetup.domainStatus,
              error: redactForLog(error),
            },
          });
        }
      }
    }

    log.info('DNS verified', {
      route: ROUTE_NAME,
      method: 'POST',
      status: 200,
      userId,
      accountId,
      durationMs: Date.now() - start,
      extra: { section: parsed.data.section, overall: status },
    });

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      records: checkedRecords,
      providerVerification,
      section: parsed.data.section,
      status,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    log.error('DNS verify failed', {
      route: ROUTE_NAME,
      method: 'POST',
      status: 500,
      userId,
      accountId,
      extra: { error: err },
    });
    return NextResponse.json({ error: 'DNS check failed' }, { status: 500 });
  }
}
