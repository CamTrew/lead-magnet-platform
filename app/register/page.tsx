import { SITE_SOCIAL_IMAGE } from '@/lib/site-social';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/auth-card';
import { getCurrentDashboardBase, sessionCookieName } from '@/lib/auth';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so';

export const metadata: Metadata = {
  title: 'Create your account',
  description:
    'Create a free Magnets account and start publishing branded lead-magnet pages on your own domain. No credit card.',
  alternates: { canonical: `${SITE_URL}/register` },
  robots: { index: false, follow: true },
  twitter: { card: 'summary_large_image', title: 'Create your free Magnets account', images: [SITE_SOCIAL_IMAGE] },
  openGraph: {
    title: 'Create your free Magnets account',
    description:
      'Create a free account to turn your idea into a lead magnet, landing page and delivery email. No credit card needed.',
    url: `${SITE_URL}/register`,
    images: [SITE_SOCIAL_IMAGE],
  },
};

export default async function RegisterPage() {
  const cookieStore = await cookies();
  if (process.env.MAGNETS_STAGING_PREVIEW !== '1' && cookieStore.has(sessionCookieName) && (await getCurrentDashboardBase())) {
    redirect('/dashboard/pages');
  }

  return <AuthCard stagingPreview={process.env.MAGNETS_STAGING_PREVIEW === '1'} mode="register" />;
}
