/**
 * Centralised structured logger for API routes.
 *
 * Goals:
 * - Emit one structured JSON line per event for easy ingestion in Vercel logs / Datadog / etc.
 * - Never log request bodies, query strings, cookies, or Authorization headers.
 * - Never log integration secrets — anything that looks like an API key is redacted.
 * - Always include the route name and the user/account id when available, so we can
 *   reconstruct what a specific user was doing after an incident without exposing PII
 *   or secrets.
 */

const SECRET_KEY_PATTERNS = [
  /re_[A-Za-z0-9_-]{8,}/g, // Resend
  /sk_[A-Za-z0-9_-]{8,}/g, // generic "secret"-style API keys
  /Bearer\s+[A-Za-z0-9._-]{8,}/gi,
];

const FORBIDDEN_FIELDS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'sessionToken',
  'session_token',
  'cookie',
  'authorization',
  'resendApiKey',
  'beehiivApiKey',
  'apiKey',
  'api_key',
]);

function redactString(value: string) {
  let out = value;
  for (const pattern of SECRET_KEY_PATTERNS) {
    out = out.replace(pattern, '<redacted>');
  }
  return out;
}

function redactValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 4) return '<truncated>';

  if (typeof value === 'string') {
    if (value.length > 500) return `${redactString(value.slice(0, 500))}…<truncated>`;
    return redactString(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message || ''),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_FIELDS.has(key)) {
        out[key] = '<redacted>';
        continue;
      }
      out[key] = redactValue(val, depth + 1);
    }
    return out;
  }

  return '<unknown>';
}

export type LogLevel = 'info' | 'warn' | 'error';

export type LogContext = {
  route: string;
  method?: string;
  status?: number;
  userId?: string;
  accountId?: string;
  durationMs?: number;
  // Free-form structured context. Strings and small primitives only — large
  // payloads, request bodies, or anything secret-ish must not be passed here.
  extra?: Record<string, unknown>;
};

function emit(level: LogLevel, message: string, context: LogContext) {
  const payload = {
    level,
    msg: redactString(message),
    timestamp: new Date().toISOString(),
    route: context.route,
    method: context.method,
    status: context.status,
    userId: context.userId,
    accountId: context.accountId,
    durationMs: context.durationMs,
    extra: context.extra ? redactValue(context.extra) : undefined,
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const log = {
  info: (message: string, context: LogContext) => emit('info', message, context),
  warn: (message: string, context: LogContext) => emit('warn', message, context),
  error: (message: string, context: LogContext) => emit('error', message, context),
};

export function redactForLog(value: unknown) {
  return redactValue(value);
}
