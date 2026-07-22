import type { Metadata } from 'next';
import { VerifyEmailConfirmCard } from '@/components/auth/verify-email-card';

export const metadata: Metadata = {
  title: 'Confirm your email',
  robots: { index: false, follow: false },
};

export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  return <VerifyEmailConfirmCard token={token.slice(0, 256)} />;
}
