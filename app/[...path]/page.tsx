import type { Metadata } from 'next';
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import {
  findAccountByAttachedHost,
} from '@/lib/platform-store';
import {
  getCachedPublishedLeadMagnet,
  getCachedPublishedLeadMagnetByUsername,
} from '@/lib/public-lead-magnet-cache';
import { isValidPlatformUsername, normalisePlatformUsername } from '@/lib/platform-username';
import {
  LeadMagnetPageView,
} from '@/components/lead-magnet-page-view';
import { isPlatformHost } from '@/lib/favicon';
import {
  buildLeadMagnetMetadata,
  preferredLeadMagnetUrl,
} from '@/lib/lead-magnet-metadata';

export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so';
const getPublishedLeadMagnet = cache(getCachedPublishedLeadMagnet);
const getPublishedLeadMagnetByUsername = cache(getCachedPublishedLeadMagnetByUsername);
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

    const canonical = preferredLeadMagnetUrl(result.account, result.leadMagnet, SITE_URL);
    return buildLeadMagnetMetadata({ ...result, canonical, host });
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

    const canonical = preferredLeadMagnetUrl(result.account, result.leadMagnet, SITE_URL);
    return buildLeadMagnetMetadata({ ...result, canonical, host });
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

    return (
      <LeadMagnetPageView
        account={result.account}
        canonicalUrl={preferredLeadMagnetUrl(result.account, result.leadMagnet, SITE_URL)}
        leadMagnet={result.leadMagnet}
      />
    );
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

    return (
      <LeadMagnetPageView
        account={result.account}
        canonicalUrl={preferredLeadMagnetUrl(result.account, result.leadMagnet, SITE_URL)}
        leadMagnet={result.leadMagnet}
      />
    );
  }

  notFound();
}
