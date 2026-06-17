import type { Metadata } from 'next';
import type { AccountSettings } from '@/lib/types';

export function cleanHostname(host: string) {
  return host.split(':')[0].toLowerCase();
}

export function isPlatformHost(host: string) {
  const hostname = cleanHostname(host);
  return (
    hostname === 'magnets.so' ||
    hostname === 'www.magnets.so' ||
    hostname === 'localhost' ||
    hostname.startsWith('127.') ||
    hostname.endsWith('.vercel.app')
  );
}

function logoMimeType(logoUrl: string) {
  return logoUrl.match(/^data:([^;,]+);base64,/i)?.[1]?.toLowerCase();
}

export function leadMagnetFaviconUrl(account: AccountSettings) {
  return account.logoUrl.trim() || null;
}

export function leadMagnetMetadataIcons(
  account: AccountSettings,
  iconUrl = leadMagnetFaviconUrl(account)
): Metadata['icons'] {
  const faviconUrl = account.logoUrl.trim() ? iconUrl : null;
  if (!faviconUrl) return undefined;

  const type = logoMimeType(faviconUrl);
  const icon = type
    ? { url: faviconUrl, sizes: 'any', type }
    : { url: faviconUrl, sizes: 'any' };

  return {
    icon: [icon],
    shortcut: [{ url: faviconUrl }],
  };
}
