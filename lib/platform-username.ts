const usernamePattern = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;

const reservedUsernames = new Set([
  'api',
  'dashboard',
  'login',
  'p',
  'privacy',
  'register',
  'robots.txt',
  'sitemap.xml',
  'terms',
]);

export function normalisePlatformUsername(value: string) {
  return value.trim().toLowerCase();
}

export function platformUsernameStem(value: string) {
  const cleaned = normalisePlatformUsername(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');

  return cleaned.length >= 3 ? cleaned : 'magnet';
}

export function isValidPlatformUsername(value: string) {
  const username = normalisePlatformUsername(value);
  return usernamePattern.test(username) && !reservedUsernames.has(username);
}

// New claims must also avoid routes added after the original username feature.
// Keep legacy URL validation unchanged so existing accounts retain access.
const creationRouteNames = new Set([
  'create', 'oauth', 'mcp', 'resources', 'campaign-resources', 'campaign-covers',
  'preview', 'forgot-password', 'reset-password', 'verify-email', 'unsubscribe',
  'brand-logos', 'magnet-images', 'email-images', 'local-email-images', 'youtube-thumbnails',
]);

export function isValidNewPlatformUsername(value: string) {
  const username = normalisePlatformUsername(value);
  return username.length >= 3 && isValidPlatformUsername(username) && !creationRouteNames.has(username);
}

export function suggestedPlatformUsername(name: string) {
  const stem = platformUsernameStem(name);
  return isValidNewPlatformUsername(stem) ? stem : `${stem.slice(0, 32)}-creator`;
}

export class PlatformUsernameUnavailableError extends Error {
  constructor(message = 'That Magnets URL is already taken. Try a different name.') {
    super(message);
    this.name = 'PlatformUsernameUnavailableError';
  }
}

export function platformLeadMagnetPath(username: string, slug: string, id: string) {
  return isValidPlatformUsername(username) && slug
    ? `/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`
    : `/p/${id}`;
}
