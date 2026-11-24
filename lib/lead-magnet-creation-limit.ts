import { createHash } from 'node:crypto';
import { LEAD_MAGNET_CREATION_WINDOW_SECONDS, MAX_LEAD_MAGNET_CREATIONS_PER_WINDOW } from './limits';

export function leadMagnetCreationScope(accountId: string) {
  return `lead-magnets:created:${createHash('sha256').update(accountId).digest('hex')}`;
}

export class LeadMagnetCreationLimitError extends Error {
  readonly retryAfterSeconds: number;
  readonly retryAt: string;

  constructor(retryAt: Date, now = Date.now()) {
    const seconds = Math.max(1, Math.ceil((retryAt.getTime() - now) / 1000));
    const minutes = Math.ceil(seconds / 60);
    const wait = minutes >= 60
      ? `${Math.ceil(minutes / 60)} ${minutes > 60 ? 'hours' : 'hour'}`
      : `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    super(`You've reached the limit of ${MAX_LEAD_MAGNET_CREATIONS_PER_WINDOW} new lead magnets in 24 hours. You can create another in ${wait}. You can still edit your existing lead magnets.`);
    this.name = 'LeadMagnetCreationLimitError';
    this.retryAfterSeconds = seconds;
    this.retryAt = retryAt.toISOString();
  }
}

export function leadMagnetCreationLimitDetails(error: LeadMagnetCreationLimitError) {
  return {
    error: error.message,
    code: 'lead_magnet_creation_limit',
    limit: MAX_LEAD_MAGNET_CREATIONS_PER_WINDOW,
    windowSeconds: LEAD_MAGNET_CREATION_WINDOW_SECONDS,
    retryAfterSeconds: error.retryAfterSeconds,
    retryAt: error.retryAt,
  };
}

export function leadMagnetCreationLimitResponse(error: LeadMagnetCreationLimitError) {
  return Response.json(leadMagnetCreationLimitDetails(error), {
    status: 429,
    headers: { 'Retry-After': String(error.retryAfterSeconds), 'Cache-Control': 'no-store' },
  });
}
