import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { findPublishedLeadMagnet } from '@/lib/platform-store';
import {
  LeadMagnetPageView,
  leadMagnetMetadataSnippet,
} from '@/components/lead-magnet-page-view';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') || '';

  const result = await findPublishedLeadMagnet(host, slug);

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
    `${titleText} — a free resource from ${brandName}.`;
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
  const result = await findPublishedLeadMagnet(host, slug);

  if (!result) notFound();

  return <LeadMagnetPageView account={result.account} leadMagnet={result.leadMagnet} />;
}
