import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { cleanHostname, isPlatformHost } from '@/lib/favicon';
import { publicOriginForHost } from '@/lib/lead-magnet-metadata';
import { listPublishedLeadMagnetsForSitemap } from '@/lib/platform-store';

export const dynamic = 'force-dynamic';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so').replace(/\/$/, '');

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get('host') || '';
  const hostname = cleanHostname(requestHost);

  if (hostname && !isPlatformHost(hostname)) {
    const origin = publicOriginForHost(requestHost);
    const magnets = await listPublishedLeadMagnetsForSitemap(hostname);

    return magnets.map((magnet) => ({
      url: `${origin}/${encodeURIComponent(magnet.slug)}`,
      lastModified: new Date(magnet.updatedAt),
      changeFrequency: 'monthly',
      priority: 0.8,
    }));
  }

  // The public hostname is authoritative when serving the production sitemap.
  // This prevents a stale Vercel deployment URL in NEXT_PUBLIC_SITE_URL from
  // leaking into every indexed URL on magnets.so.
  const platformOrigin = hostname === 'magnets.so'
    ? publicOriginForHost(requestHost)
    : SITE_URL;

  return [
    { url: platformOrigin, changeFrequency: 'weekly', priority: 1 },
    { url: `${platformOrigin}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${platformOrigin}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
