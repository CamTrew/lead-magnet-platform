'use client';

import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

const AUTH_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];
const LEGAL_ROUTES = ['/privacy', '/terms'];

export function AppThemeBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname.startsWith('/dashboard');
  const isHome = pathname === '/';
  const isAuth = AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isLegal = LEGAL_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const usesAppTheme = isHome || isDashboard || isAuth || isLegal;

  return (
    <div className={cn('contents', usesAppTheme && 'app-theme')}>
      {children}
      {(isAuth || isLegal) && (
        <ThemeToggle className="fixed right-4 top-4 z-[90] shadow-sm sm:right-6 sm:top-6" />
      )}
    </div>
  );
}
