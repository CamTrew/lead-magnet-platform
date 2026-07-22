const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const memorySessionIds = new Map<string, string>();

function sessionKey(leadMagnetId: string) {
  return `magnets:analytics:${leadMagnetId}`;
}

export function leadMagnetAnalyticsElapsedKey(leadMagnetId: string) {
  return `${sessionKey(leadMagnetId)}:seconds`;
}

export function getLeadMagnetAnalyticsSessionId(leadMagnetId: string) {
  if (typeof window === 'undefined') return '';
  const memoryId = memorySessionIds.get(leadMagnetId);
  if (memoryId) return memoryId;

  try {
    const stored = window.sessionStorage.getItem(sessionKey(leadMagnetId));
    if (stored && UUID_PATTERN.test(stored)) {
      memorySessionIds.set(leadMagnetId, stored);
      return stored;
    }
  } catch {
    // Privacy modes can disable sessionStorage. The in-memory id still
    // deduplicates this page lifecycle without using cookies or PII.
  }

  const created = crypto.randomUUID();
  memorySessionIds.set(leadMagnetId, created);
  try {
    window.sessionStorage.setItem(sessionKey(leadMagnetId), created);
  } catch {
    // The in-memory fallback remains usable.
  }
  return created;
}

function variantKey(leadMagnetId: string) {
  return `${sessionKey(leadMagnetId)}:variant`;
}

export function leadMagnetAbBucket(sessionId: string, versionCount: number) {
  if (versionCount <= 1) return 0;
  const seed = sessionId.replace(/-/g, '').slice(-8);
  return Number.parseInt(seed || '0', 16) % versionCount;
}

export function getLeadMagnetAbVariantId(leadMagnetId: string, variantIds: string[] = []) {
  if (typeof window === 'undefined' || variantIds.length === 0) return 'control';
  const allowed = ['control', ...variantIds];
  try {
    const existing = window.sessionStorage.getItem(variantKey(leadMagnetId));
    if (existing && allowed.includes(existing)) return existing;
  } catch {
    // Use the deterministic fallback below when storage is unavailable.
  }
  const sessionId = getLeadMagnetAnalyticsSessionId(leadMagnetId);
  const index = leadMagnetAbBucket(sessionId, allowed.length);
  const selected = allowed[index] || 'control';
  try {
    window.sessionStorage.setItem(variantKey(leadMagnetId), selected);
  } catch {
    // Stable for this tab because the analytics session id is held in memory.
  }
  return selected;
}
