import type { Metadata } from 'next';
import { ForgotPasswordCard } from '@/components/auth/forgot-password-card';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so';

export const metadata: Metadata = {
  title: 'Reset your password',
  alternates: { canonical: `${SITE_URL}/forgot-password` },
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordCard />;
}
