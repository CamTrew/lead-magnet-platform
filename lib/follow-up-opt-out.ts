import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AccountSettings } from './types';

const TOKEN_VERSION = 1;
const TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60;

type FollowUpStopPayload = {
  v: typeof TOKEN_VERSION;
  a: string;
  m: string;
  e: string;
  exp: number;
};

export type VerifiedFollowUpStopToken = {
  accountId: string;
  leadMagnetId: string;
  email: string;
};

function signingSecret() {
  const raw = process.env.MAGNETS_ENCRYPTION_KEY || process.env.DATA_ENCRYPTION_KEY;
  if (raw?.trim()) return raw.trim();

  if (process.env.NODE_ENV === 'production') {
    throw new Error('MAGNETS_ENCRYPTION_KEY is required to sign sequence stop links.');
  }

  return 'dev-only-follow-up-stop-secret';
}

function sign(value: string) {
  return createHmac('sha256', signingSecret()).update(value).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function encodePayload(payload: FollowUpStopPayload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodePayload(value: string): FollowUpStopPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<FollowUpStopPayload>;
    if (
      parsed.v !== TOKEN_VERSION ||
      typeof parsed.a !== 'string' ||
      typeof parsed.m !== 'string' ||
      typeof parsed.e !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }

    return parsed as FollowUpStopPayload;
  } catch {
    return null;
  }
}

export function createFollowUpStopToken({
  accountId,
  email,
  leadMagnetId,
}: {
  accountId: string;
  leadMagnetId: string;
  email: string;
}) {
  const payload = encodePayload({
    v: TOKEN_VERSION,
    a: accountId,
    m: leadMagnetId,
    e: email.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  });

  return `${payload}.${sign(payload)}`;
}

export function verifyFollowUpStopToken(token: string): VerifiedFollowUpStopToken | null {
  const [payloadValue, signature] = token.split('.');
  if (!payloadValue || !signature || !safeEqual(sign(payloadValue), signature)) return null;

  const payload = decodePayload(payloadValue);
  if (!payload || payload.exp < Math.floor(Date.now() / 1000)) return null;

  return {
    accountId: payload.a,
    leadMagnetId: payload.m,
    email: payload.e,
  };
}

export function followUpStopUrl(account: AccountSettings, leadMagnetId: string, email: string) {
  const attachedHost = account.domainAttachedHost.trim().toLowerCase();
  const configuredHost =
    account.subdomain && account.domain ? `${account.subdomain}.${account.domain}`.toLowerCase() : '';
  const publicHost = attachedHost || configuredHost;
  const baseUrl = publicHost
    ? `https://${publicHost}`
    : process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so';
  const url = new URL('/sequence/stop', baseUrl);

  url.searchParams.set(
    'token',
    createFollowUpStopToken({
      accountId: account.id,
      leadMagnetId,
      email,
    })
  );

  return url.toString();
}
