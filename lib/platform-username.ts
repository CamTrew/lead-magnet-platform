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
