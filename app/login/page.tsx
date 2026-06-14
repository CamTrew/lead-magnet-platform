import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/auth-card';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Magnets. the free lead-magnet platform.',
  alternates: { canonical: `${SITE_URL}/login` },
  robots: { index: false, follow: true },
};

function safeNextPath(value: string | string[] | undefined) {
  const path = Array.isArray(value) ? value[0] : value;
  if (!path || !path.startsWith('/') || path.startsWith('//')) return undefined;
  if (path === '/login' || path.startsWith('/login?')) return undefined;
  if (path === '/register' || path.startsWith('/register?')) return undefined;
  return path;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return <AuthCard mode="login" nextPath={safeNextPath(params.next)} />;
}
