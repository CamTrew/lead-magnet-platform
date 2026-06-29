import { cleanHostname, isPlatformHost } from '@/lib/favicon';
import type { AccountSettings } from '@/lib/types';

const PLATFORM_SITE_NAME = 'Magnets';

function accountAttachedHost(account: AccountSettings) {
  const subdomain = account.subdomain.trim();
  const domain = account.domain.trim();

  if (subdomain && domain) return `${subdomain}.${domain}`;
  return domain;
}

export function leadMagnetSiteName(account: AccountSettings, host = '') {
  const logoText = account.logoText.trim();
  if (logoText) return logoText;

  const hostname = host ? cleanHostname(host) : '';
  if (hostname && !isPlatformHost(hostname)) return hostname;

  return accountAttachedHost(account) || PLATFORM_SITE_NAME;
}

export function absoluteMetadataUrl(value: string, baseUrl?: string) {
  if (!baseUrl) return value;

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}
