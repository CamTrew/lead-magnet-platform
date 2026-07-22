import type { Metadata } from 'next';
import { VerifyEmailPendingCard } from '@/components/auth/verify-email-card';

export const metadata: Metadata = {
  title: 'Verify your email',
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email = '' } = await searchParams;
  return <VerifyEmailPendingCard initialEmail={email.slice(0, 254)} />;
}
