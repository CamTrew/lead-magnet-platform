import type { Metadata } from 'next';
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import {
  findAccountByAttachedHost,
  findPublishedLeadMagnet,
  findPublishedLeadMagnetByUsername,
} from '@/lib/platform-store';
import { isValidPlatformUsername, normalisePlatformUsername } from '@/lib/platform-username';
import {
  LeadMagnetPageView,
  leadMagnetMetadataSnippet,
} from '@/components/lead-magnet-page-view';
import { isPlatformHost, leadMagnetMetadataIcons } from '@/lib/favicon';
import { leadMagnetDisplayImageUrl } from '@/lib/lead-magnet-images';
import { absoluteMetadataUrl, leadMagnetSiteName } from '@/lib/lead-magnet-metadata';
import type { AccountSettings, LeadMagnet } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so';
const getPublishedLeadMagnet = cache(findPublishedLeadMagnet);
const getPublishedLeadMagnetByUsername = cache(findPublishedLeadMagnetByUsername);
const getAccountByAttachedHost = cache(findAccountByAttachedHost);

type RouteParams = { path: string[] };

function normaliseSlug(value: string) {
  return value.toLowerCase();
}

function notFoundMetadata(): Metadata {
  return {
    title: 'Resource not found',
    robots: { index: false, follow: false },
  };
}

function metadataForLeadMagnet({
  account,
  leadMagnet,
  canonical,
  host,
}: {
  account: AccountSettings;
  leadMagnet: LeadMagnet;
  canonical?: string;
  host?: string;
}): Metadata {
  const titleText = leadMagnet.title.trim() || 'Free resource';
  const siteName = leadMagnetSiteName(account, host);
  const baseUrl = canonical ? new URL(canonical).origin : undefined;
  const imageUrl = leadMagnet.imageUrl
    ? absoluteMetadataUrl(
        leadMagnetDisplayImageUrl({
          id: leadMagnet.id,
          imageUrl: leadMagnet.imageUrl,
          updatedAt: leadMagnet.updatedAt,
        }),
        baseUrl
      )
    : undefined;
  const descriptionSource =
    leadMagnet.subtitle.trim() ||
    leadMagnet.emailPreview.trim() ||
    leadMagnet.description.trim() ||
    `${titleText}, a free resource from ${siteName}.`;
  const description = leadMagnetMetadataSnippet(descriptionSource);

  return {
    title: { absolute: titleText },
    description,
    alternates: canonical ? { canonical } : undefined,
    keywords: [
      titleText,
      'free resource',
      'download',
      siteName,
      leadMagnet.slug.replace(/-/g, ' '),
    ],
    icons: leadMagnetMetadataIcons(account, host && !isPlatformHost(host) ? '/favicon.ico' : undefined),
    openGraph: {
      type: 'website',
      title: titleText,
      description,
      siteName,
      url: canonical,
      images: imageUrl ? [{ url: imageUrl }] : undefined,
    },
    twitter: {
      card: imageUrl ? 'summary_large_image' : 'summary',
      title: titleText,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
    robots: { index: true, follow: true },
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { path } = await params;

  if (path.length === 1) {
    const slug = normaliseSlug(path[0]);
    const requestHeaders = await headers();
    const host = requestHeaders.get('host') || '';
    const result = await getPublishedLeadMagnet(host, slug);
    if (!result) return notFoundMetadata();

    const protocol = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
    const canonical = host ? `${protocol}://${host}/${result.leadMagnet.slug}` : undefined;
    return metadataForLeadMagnet({ ...result, canonical, host });
  }

  if (path.length === 2) {
    const requestHeaders = await headers();
    const host = requestHeaders.get('host') || '';
    if (!isPlatformHost(host)) return notFoundMetadata();

    const username = normalisePlatformUsername(path[0]);
    const slug = normaliseSlug(path[1]);
    if (!isValidPlatformUsername(username)) return notFoundMetadata();

    const result = await getPublishedLeadMagnetByUsername(username, slug);
    if (!result) return notFoundMetadata();

    const canonical = absoluteMetadataUrl(`/${result.account.username}/${result.leadMagnet.slug}`, SITE_URL);
    return metadataForLeadMagnet({ ...result, canonical });
  }

  return notFoundMetadata();
}

export default async function PublicLeadMagnetPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { path } = await params;

  if (path.length === 1) {
    const [slug] = path;
    const normalisedSlug = normaliseSlug(slug);
    if (slug !== normalisedSlug) redirect(`/${normalisedSlug}`);

    const requestHeaders = await headers();
    const host = requestHeaders.get('host') || 'localhost:3000';
    const result = await getPublishedLeadMagnet(host, normalisedSlug);

    if (!result) {
      const owner = await getAccountByAttachedHost(host);
      if (owner?.domain) {
        const protocol = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
        redirect(`${protocol}://${owner.domain}`);
      }
      notFound();
    }

    return <LeadMagnetPageView account={result.account} leadMagnet={result.leadMagnet} />;
  }

  if (path.length === 2) {
    const requestHeaders = await headers();
    const host = requestHeaders.get('host') || '';
    if (!isPlatformHost(host)) notFound();

    const [username, slug] = path;
    const normalisedUsername = normalisePlatformUsername(username);
    const normalisedSlug = normaliseSlug(slug);
    if (!isValidPlatformUsername(normalisedUsername)) notFound();
    if (username !== normalisedUsername || slug !== normalisedSlug) {
      redirect(`/${normalisedUsername}/${normalisedSlug}`);
    }

    const result = await getPublishedLeadMagnetByUsername(normalisedUsername, normalisedSlug);
    if (!result) notFound();

    return <LeadMagnetPageView account={result.account} leadMagnet={result.leadMagnet} />;
  }

  notFound();
}
