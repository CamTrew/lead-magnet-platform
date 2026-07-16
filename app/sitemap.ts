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

  const magnets = await listPublishedLeadMagnetsForSitemap();
  const publicMagnets: MetadataRoute.Sitemap = magnets
    .filter((magnet) => !magnet.domainAttachedHost || isPlatformHost(magnet.domainAttachedHost))
    .map((magnet) => ({
      url: magnet.username
        ? `${SITE_URL}/${encodeURIComponent(magnet.username)}/${encodeURIComponent(magnet.slug)}`
        : `${SITE_URL}/p/${magnet.id}`,
      lastModified: new Date(magnet.updatedAt),
      changeFrequency: 'monthly',
      priority: 0.8,
    }));

  return [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    ...publicMagnets,
  ];
}
