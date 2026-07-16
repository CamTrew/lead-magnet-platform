import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { getCachedPublishedLeadMagnetById } from '@/lib/public-lead-magnet-cache';
import { LeadMagnetPageView } from '@/components/lead-magnet-page-view';
import {
  buildLeadMagnetMetadata,
  preferredLeadMagnetUrl,
} from '@/lib/lead-magnet-metadata';

export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const getPublishedLeadMagnetById = cache(getCachedPublishedLeadMagnetById);

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

  return buildLeadMagnetMetadata({ ...result });
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

  return (
    <LeadMagnetPageView
      account={result.account}
      canonicalUrl={preferredLeadMagnetUrl(result.account, result.leadMagnet, SITE_URL)}
      leadMagnet={result.leadMagnet}
    />
  );
}
