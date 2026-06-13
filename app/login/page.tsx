import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/auth-card';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Magnets — the free lead-magnet platform.',
  alternates: { canonical: `${SITE_URL}/login` },
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return <AuthCard mode="login" />;
}
