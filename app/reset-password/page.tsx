import type { Metadata } from 'next';
import { ResetPasswordCard } from '@/components/auth/reset-password-card';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so';

export const metadata: Metadata = {
  title: 'Choose a new password',
  alternates: { canonical: `${SITE_URL}/reset-password` },
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const value = Array.isArray(params.token) ? params.token[0] : params.token;
  return <ResetPasswordCard token={value || ''} />;
}
