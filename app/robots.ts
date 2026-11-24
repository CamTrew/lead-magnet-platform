import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { cleanHostname, isPlatformHost } from '@/lib/favicon';
import { publicOriginForHost } from '@/lib/lead-magnet-metadata';

export const dynamic = 'force-dynamic';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so').replace(/\/$/, '');

export default async function robots(): Promise<MetadataRoute.Robots> {
  if (process.env.MAGNETS_STAGING_PREVIEW === '1' || process.env.VERCEL_ENV === 'preview') return { rules: { userAgent: '*', disallow: '/' } };
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get('host') || '';
  const hostname = cleanHostname(requestHost);
  const origin = hostname && !isPlatformHost(hostname)
    ? publicOriginForHost(requestHost)
    : hostname === 'magnets.so'
      ? publicOriginForHost(requestHost)
      : SITE_URL;

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        disallow: ['/api/', '/dashboard/'],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
