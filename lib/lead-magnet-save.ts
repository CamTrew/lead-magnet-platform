import type { LeadMagnet } from './types';

const LEGACY_SAVE_CONFLICT_MESSAGE = 'This page is already being saved. Wait a moment and try again.';

export class RetryableLeadMagnetSaveError extends Error {
  constructor(message: string, public retryAfterMs = 0) {
    super(message);
    this.name = 'RetryableLeadMagnetSaveError';
  }
}

export function leadMagnetSaveRetryDelay(attempt: number, retryAfterMs = 0) {
  return Math.max(Math.min(30_000, 2000 * (2 ** Math.min(attempt, 4))), retryAfterMs);
}

type SaveResponse = { leadMagnet?: LeadMagnet; error?: string; code?: string };

/** Each attempt uses the latest editor draft; the editor schedules transient retries. */
export async function requestLeadMagnetSave(leadMagnetId: string, body: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    let response: Response;
    try {
      response = await fetch(`/api/lead-magnets/${leadMagnetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
    } catch {
      // PUT persists a complete draft. Keep it dirty and retry the newest
      // revision if the response was lost, even if the server saved this one.
      throw new RetryableLeadMagnetSaveError('Connection interrupted while saving.');
    }
    const data = await response.json().catch((error: unknown) => {
      if (!(error instanceof SyntaxError)) {
        throw new RetryableLeadMagnetSaveError('Connection interrupted while reading the save response.');
      }
      return null;
    }) as SaveResponse | null;
    const isBusy = response.status === 409 && (
      data?.code === 'save_in_progress' || data?.error === LEGACY_SAVE_CONFLICT_MESSAGE
    );
    if (isBusy || response.status === 429 || response.status >= 500 || (response.ok && !data?.leadMagnet)) {
      const retryAfter = response.headers.get('Retry-After');
      const seconds = Number(retryAfter);
      const retryAfterMs = seconds > 0 && Number.isFinite(seconds)
        ? seconds * 1000
        : retryAfter ? Math.max(0, Date.parse(retryAfter) - Date.now()) : 0;
      throw new RetryableLeadMagnetSaveError(
        data?.error || 'Page could not be saved yet.',
        Number.isFinite(retryAfterMs) ? Math.min(300_000, retryAfterMs) : 0
      );
    }
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}
