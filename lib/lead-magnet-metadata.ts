import type { Metadata } from 'next';
import {
  cleanHostname,
  isPlatformHost,
  leadMagnetMetadataIcons,
} from '@/lib/favicon';
import { leadMagnetDisplayImageUrl } from '@/lib/lead-magnet-images';
import type { AccountSettings, LeadMagnet } from '@/lib/types';

const PLATFORM_SITE_NAME = 'Magnets';
const PLATFORM_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so';

function accountAttachedHost(account: AccountSettings) {
  return cleanHostname(account.domainAttachedHost.trim());
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

export function publicOriginForHost(host: string, fallback = PLATFORM_SITE_URL) {
  const hostname = cleanHostname(host);
  if (!hostname || !/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|localhost)$/.test(hostname)) {
    return fallback.replace(/\/$/, '');
  }

  const protocol = hostname === 'localhost' || hostname.startsWith('127.') ? 'http' : 'https';
  const port = host.match(/:(\d+)$/)?.[1];
  return `${protocol}://${hostname}${port ? `:${port}` : ''}`;
}

/**
 * A magnet can be reached through several URLs. Keep one preferred URL across
 * canonicals, Open Graph, structured data, sitemaps, and dashboard links.
 */
export function preferredLeadMagnetUrl(
  account: AccountSettings,
  leadMagnet: Pick<LeadMagnet, 'id' | 'slug'>,
  platformSiteUrl = PLATFORM_SITE_URL
) {
  const attachedHost = accountAttachedHost(account);
  if (attachedHost && !isPlatformHost(attachedHost)) {
    return `https://${attachedHost}/${encodeURIComponent(leadMagnet.slug)}`;
  }

  const username = account.username.trim().toLowerCase();
  if (username) {
    return absoluteMetadataUrl(
      `/${encodeURIComponent(username)}/${encodeURIComponent(leadMagnet.slug)}`,
      platformSiteUrl
    );
  }

  return absoluteMetadataUrl(`/p/${leadMagnet.id}`, platformSiteUrl);
}

export function leadMagnetMetadataSnippet(value: string, max = 160) {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function buildLeadMagnetMetadata({
  account,
  leadMagnet,
  canonical = preferredLeadMagnetUrl(account, leadMagnet),
  host,
}: {
  account: AccountSettings;
  leadMagnet: LeadMagnet;
  canonical?: string;
  host?: string;
}): Metadata {
  const titleText = leadMagnet.title.trim() || 'Free resource';
  const siteName = leadMagnetSiteName(account, host);
  const canonicalOrigin = absoluteMetadataUrl('/', canonical);
  const imageUrl = leadMagnet.imageUrl
    ? absoluteMetadataUrl(
        leadMagnetDisplayImageUrl({
          id: leadMagnet.id,
          imageUrl: leadMagnet.imageUrl,
          updatedAt: leadMagnet.updatedAt,
        }),
        canonicalOrigin
      )
    : undefined;
  const descriptionSource =
    leadMagnet.subtitle.trim() ||
    leadMagnet.emailPreview.trim() ||
    leadMagnet.description.trim() ||
    `${titleText}, a free resource from ${siteName}.`;
  const description = leadMagnetMetadataSnippet(descriptionSource);

  return {
    title: { absolute: `${titleText} | ${siteName}` },
    description,
    alternates: { canonical },
    icons: leadMagnetMetadataIcons(
      account,
      host && !isPlatformHost(host)
        ? absoluteMetadataUrl('/favicon.ico', publicOriginForHost(host))
        : undefined
    ),
    openGraph: {
      type: 'website',
      locale: 'en_US',
      title: titleText,
      description,
      siteName,
      url: canonical,
      images: imageUrl ? [{ url: imageUrl, alt: `${titleText} preview` }] : undefined,
    },
    twitter: {
      card: imageUrl ? 'summary_large_image' : 'summary',
      title: titleText,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
  };
}

export function safeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
