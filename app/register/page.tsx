import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/auth-card';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so';

export const metadata: Metadata = {
  title: 'Create your account',
  description:
    'Create a free Magnets account and start publishing branded lead-magnet pages on your own domain. No credit card.',
  alternates: { canonical: `${SITE_URL}/register` },
  openGraph: {
    title: 'Create your free Magnets account',
    description:
      'Free, forever lead-magnet platform. Build branded capture pages on your own domain with your own keys.',
    url: `${SITE_URL}/register`,
  },
};

export default function RegisterPage() {
  return <AuthCard mode="register" />;
}
