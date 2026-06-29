import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { findPublishedLeadMagnetById } from '@/lib/platform-store';
import {
  LeadMagnetPageView,
  leadMagnetMetadataSnippet,
} from '@/components/lead-magnet-page-view';
import { leadMagnetMetadataIcons } from '@/lib/favicon';
import { absoluteMetadataUrl, leadMagnetSiteName } from '@/lib/lead-magnet-metadata';

export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const getPublishedLeadMagnetById = cache(findPublishedLeadMagnetById);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return { title: 'Resource not found', robots: { index: false, follow: false } };
  }
  const result = await getPublishedLeadMagnetById(id);
  if (!result) return { title: 'Resource not found', robots: { index: false, follow: false } };

  const { account, leadMagnet } = result;
  const titleText = leadMagnet.title.trim() || 'Free resource';
  const canonical = absoluteMetadataUrl(`/p/${leadMagnet.id}`, SITE_URL);
  const siteName = leadMagnetSiteName(account);
  const imageUrl = leadMagnet.imageUrl
    ? absoluteMetadataUrl(leadMagnet.imageUrl, SITE_URL)
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
    alternates: { canonical },
    icons: leadMagnetMetadataIcons(account),
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

export default async function LeadMagnetByIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();
  const result = await getPublishedLeadMagnetById(id);
  if (!result) notFound();

  return <LeadMagnetPageView account={result.account} leadMagnet={result.leadMagnet} />;
}
