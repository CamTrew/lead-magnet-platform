import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ProductPreview } from '@/components/preview/product-preview';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your Magnets workspace preview', robots: { index: false, follow: false } };
const screens = new Set(['verification', 'onboarding', 'create', 'launch', 'account', 'home', 'magnets', 'resources', 'audience', 'analytics', 'brand', 'connections', 'help', 'tour', 'resource', 'page', 'emails']);

export default async function PreviewPage({ params }: { params: Promise<{ screen?: string[] }> }) {
  if (process.env.MAGNETS_CREATION_ENABLED === '1' && process.env.MAGNETS_STAGING_PREVIEW !== '1') redirect('/create');
  // This visual walkthrough never loads a customer session or queries the database.
  if (process.env.MAGNETS_STAGING_PREVIEW !== '1') notFound();
  const { screen } = await params;
  const selected = screen?.[0] || 'home';
  if ((screen?.length || 0) > 1 || !screens.has(selected)) notFound();
  return <ProductPreview screen={selected} />;
}
