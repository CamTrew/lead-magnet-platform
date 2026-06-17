import type { Metadata } from 'next';
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import {
  findAccountByAttachedHost,
  findPublishedLeadMagnet,
} from '@/lib/platform-store';
import {
  LeadMagnetPageView,
  leadMagnetMetadataSnippet,
} from '@/components/lead-magnet-page-view';
import { isPlatformHost, leadMagnetMetadataIcons } from '@/lib/favicon';

export const dynamic = 'force-dynamic';

const getPublishedLeadMagnet = cache(findPublishedLeadMagnet);
const getAccountByAttachedHost = cache(findAccountByAttachedHost);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') || '';

  const result = await getPublishedLeadMagnet(host, slug);

  if (!result) {
    return {
      title: 'Resource not found',
      robots: { index: false, follow: false },
    };
  }

  const { account, leadMagnet } = result;
  const brandName = account.logoText.trim() || 'this brand';
  const titleText = leadMagnet.title.trim() || 'Free resource';
  const descriptionSource =
    leadMagnet.subtitle.trim() ||
    leadMagnet.emailPreview.trim() ||
    leadMagnet.description.trim() ||
    `${titleText}, a free resource from ${brandName}.`;
  const description = leadMagnetMetadataSnippet(descriptionSource);
  const protocol = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
  const canonical = host ? `${protocol}://${host}/${leadMagnet.slug}` : undefined;

  return {
    title: titleText,
    description,
    alternates: canonical ? { canonical } : undefined,
    keywords: [
      titleText,
      'free resource',
      'download',
      brandName,
      leadMagnet.slug.replace(/-/g, ' '),
    ],
    icons: leadMagnetMetadataIcons(account, host && !isPlatformHost(host) ? '/favicon.ico' : undefined),
    openGraph: {
      type: 'website',
      title: titleText,
      description,
      siteName: brandName,
      url: canonical,
      images: leadMagnet.imageUrl ? [{ url: leadMagnet.imageUrl }] : undefined,
    },
    twitter: {
      card: leadMagnet.imageUrl ? 'summary_large_image' : 'summary',
      title: titleText,
      description,
      images: leadMagnet.imageUrl ? [leadMagnet.imageUrl] : undefined,
    },
    robots: { index: true, follow: true },
  };
}

export default async function LeadMagnetPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') || 'localhost:3000';
  const result = await getPublishedLeadMagnet(host, slug);

  if (!result) {
    // Page is missing or unpublished. If we recognise the host (it's attached
    // to one of our accounts) we bounce the visitor to that account's apex —
    // typically the customer's main marketing site. If we don't recognise the
    // host, fall through to 404 since we have nowhere to send them.
    const owner = await getAccountByAttachedHost(host);
    if (owner?.domain) {
      const protocol = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
      redirect(`${protocol}://${owner.domain}`);
    }
    notFound();
  }

  return <LeadMagnetPageView account={result.account} leadMagnet={result.leadMagnet} />;
}
