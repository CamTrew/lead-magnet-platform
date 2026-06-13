import { resolveCname, resolveMx, resolveTxt } from 'node:dns/promises';
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import {
  buildPageDnsRecords,
  isValidRootDomain,
  isValidSubdomain,
  normaliseRootDomain,
  normaliseSubdomain,
  parseSenderEmail,
  type DnsRecordDefinition,
} from '@/lib/dns-records';
import { getAccountWithSecrets } from '@/lib/platform-store';
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

async function getResendEmailDnsRecords(domain: string, resendApiKey: string) {
  if (!resendApiKey) {
    throw new Error('Add your Resend API key in Delivery before checking sending DNS.');
  }

  const resend = new Resend(resendApiKey);
  const existingDomains = await resend.domains.list();

  if (existingDomains.error) {
    throw new Error(existingDomains.error.message || 'Resend domains could not be loaded.');
  }

  const existingDomain = existingDomains.data.data.find((item) => cleanDnsValue(item.name) === cleanDnsValue(domain));
  const domainResult = existingDomain
    ? await resend.domains.get(existingDomain.id)
    : await resend.domains.create({ name: domain });

  if (domainResult.error) {
    throw new Error(domainResult.error.message || 'Resend domain records could not be loaded.');
  }

  return domainResult.data.records.map((record, index) =>
    mapResendRecord(record as ResendDnsRecord, domain, index)
  );
}

async function lookupRecord(record: DnsRecordDefinition): Promise<VerifiedDnsRecord> {
  try {
    const found =
      record.type === 'CNAME'
        ? await resolveCname(record.lookupName)
        : record.type === 'MX'
          ? (await resolveMx(record.lookupName)).map((entry) => entry.exchange)
          : (await resolveTxt(record.lookupName)).map((parts) => parts.join(''));

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

    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 30,
        scope: 'dns:verify:user',
        windowSeconds: 60,
      },
      {
        identifier: requestIp(request),
        limit: 60,
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

    if (parsed.data.section === 'publishing') {
      const domain = normaliseRootDomain(parsed.data.domain || '');
      const subdomain = normaliseSubdomain(parsed.data.subdomain || '');

      if (!isValidRootDomain(domain) || !isValidSubdomain(subdomain)) {
        return NextResponse.json(
          { error: 'Enter a valid root domain and subdomain before checking DNS.' },
          { status: 400 }
        );
      }

      records = buildPageDnsRecords({
        accountId: payload.account.id,
        domain,
        subdomain,
      });
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

      try {
        records = await getResendEmailDnsRecords(sender.domain, accountWithSecrets.resendApiKey);
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
