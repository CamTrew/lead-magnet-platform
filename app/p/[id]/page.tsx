import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findPublishedLeadMagnetById } from '@/lib/platform-store';
import {
  LeadMagnetPageView,
  leadMagnetMetadataSnippet,
} from '@/components/lead-magnet-page-view';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return { title: 'Resource not found', robots: { index: false, follow: false } };
  }
  const result = await findPublishedLeadMagnetById(id);
  if (!result) return { title: 'Resource not found', robots: { index: false, follow: false } };

  const { account, leadMagnet } = result;
  const brandName = account.logoText.trim() || 'this brand';
  const titleText = leadMagnet.title.trim() || 'Free resource';
  const descriptionSource =
    leadMagnet.subtitle.trim() ||
    leadMagnet.emailPreview.trim() ||
    leadMagnet.description.trim() ||
    `${titleText}, a free resource from ${brandName}.`;
  const description = leadMagnetMetadataSnippet(descriptionSource);

  return {
    title: titleText,
    description,
    openGraph: {
      type: 'website',
      title: titleText,
      description,
      siteName: brandName,
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

export default async function LeadMagnetByIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();
  const result = await findPublishedLeadMagnetById(id);
  if (!result) notFound();

  return <LeadMagnetPageView account={result.account} leadMagnet={result.leadMagnet} />;
}
