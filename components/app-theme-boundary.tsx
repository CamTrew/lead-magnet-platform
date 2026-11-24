'use client';

import { usePathname } from 'next/navigation';
import { useLayoutEffect } from 'react';
import { isDarkFlowRoute } from '@/lib/app-route-theme';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

const AUTH_ROUTES = ['/login', '/register', '/verify-email', '/forgot-password', '/reset-password'];
const LEGAL_ROUTES = ['/privacy', '/terms'];

export function AppThemeBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname.startsWith('/dashboard');
  const isHome = pathname === '/';
  const isAuth = AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isLegal = LEGAL_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isAnimatedAuth = isAuth;
  const darkFlow = isDarkFlowRoute(pathname);
  const usesAppTheme = !isAnimatedAuth && (isHome || isDashboard || isAuth || isLegal);

  // Keep the document canvas in sync before paint during client navigation.
  // The head bootstrap covers direct visits before React or route CSS has loaded.
  useLayoutEffect(() => {
    document.documentElement.toggleAttribute('data-magnets-flow', darkFlow);
  }, [darkFlow]);

  return (
    <div className={cn('contents', usesAppTheme && 'app-theme', darkFlow && 'dark-flow')}>
      {children}
      {!isAnimatedAuth && (isAuth || isLegal) && (
        <ThemeToggle className="fixed right-4 top-4 z-[90] shadow-sm sm:right-6 sm:top-6" />
      )}
    </div>
  );
}
