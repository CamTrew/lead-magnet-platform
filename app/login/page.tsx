import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/auth-card';
import { getCurrentDashboardBase, sessionCookieName } from '@/lib/auth';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your Magnets account.',
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
  const cookieStore = await cookies();
  if (cookieStore.has(sessionCookieName) && (await getCurrentDashboardBase())) {
    redirect('/dashboard/pages');
  }

  const params = await searchParams;
  return <AuthCard mode="login" nextPath={safeNextPath(params.next)} />;
}
