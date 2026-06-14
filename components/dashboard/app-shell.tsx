'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  FileText,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Palette,
  PanelLeftClose,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { MagnetsLogoMark } from '@/components/magnets-logo-mark';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Configure', requiresSetup: false },
  { href: '/dashboard/brand', icon: Palette, label: 'Brand', requiresDomain: true },
  { href: '/dashboard/pages', icon: FileText, label: 'Pages', requiresSetup: true },
  { href: '/dashboard/signups', icon: Users, label: 'Signups', requiresSetup: true },
  { href: '/dashboard/account', icon: Settings, label: 'Account', requiresSetup: false },
];

let sidebarOpenPreference = true;

function userInitials(name: string, email: string) {
  const source = name.trim() || email.trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function SidebarLink({
  active,
  collapsed,
  disabled,
  href,
  icon: Icon,
  label,
  onClick,
  tooltip,
}: {
  active: boolean;
  collapsed?: boolean;
  disabled?: boolean;
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  onClick?: () => void;
  tooltip?: string;
}) {
  const baseClassName = cn(
    'group flex h-9 items-center rounded-md text-sm transition',
    collapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5',
    active
      ? 'bg-ink-100 text-ink-950 font-medium'
      : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
    disabled && 'cursor-not-allowed text-ink-400 hover:bg-transparent hover:text-ink-400'
  );

  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0" />
      <span
        aria-hidden={collapsed}
        className={cn('overflow-hidden whitespace-nowrap', collapsed && 'w-0 opacity-0')}
      >
        {label}
      </span>
    </>
  );

  if (disabled) {
    return (
      <button
        type="button"
        aria-disabled
        className={baseClassName}
        title={tooltip || (collapsed ? label : undefined)}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      title={tooltip || (collapsed ? label : undefined)}
      className={baseClassName}
    >
      {content}
    </Link>
  );
}

function SidebarContent({
  collapsed,
  onCollapseToggle,
  onLogout,
  onNavigate,
  isLoggingOut,
  publishingDomainReady,
  setupComplete,
  userName,
  userEmail,
}: {
  collapsed?: boolean;
  onCollapseToggle?: () => void;
  isLoggingOut?: boolean;
  onLogout: () => void;
  onNavigate?: () => void;
  publishingDomainReady: boolean;
  setupComplete: boolean;
  userName: string;
  userEmail: string;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'flex h-14 items-center border-b border-ink-200',
          collapsed ? 'justify-center px-2' : 'gap-2.5 px-3'
        )}
      >
        {collapsed ? (
          <button
            aria-label="Open sidebar"
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-700 transition hover:bg-ink-50 lg:flex"
            onClick={onCollapseToggle}
            title={`Open sidebar. ${userName || userEmail}`}
            type="button"
          >
            <span className="text-[10px] font-semibold text-ink-700">
              {userInitials(userName, userEmail)}
            </span>
          </button>
        ) : (
          <>
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-white text-xs font-semibold text-ink-700"
            >
              {userInitials(userName, userEmail)}
            </span>
            <div className="min-w-0 overflow-hidden">
              <p className="truncate text-sm font-medium text-ink-900">{userName || 'Welcome'}</p>
              <p className="truncate text-xs text-ink-500">{userEmail}</p>
            </div>
            {onCollapseToggle && (
              <button
                aria-label="Close sidebar"
                className="ml-auto hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 lg:flex"
                onClick={onCollapseToggle}
                title="Close sidebar"
                type="button"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-2 py-3">
        {navItems.map((item) => {
          const isDashboardRoot = item.href === '/dashboard';
          const active = isDashboardRoot
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const disabled =
            Boolean(item.requiresSetup && !setupComplete) ||
            Boolean(item.requiresDomain && !publishingDomainReady);
          return (
            <SidebarLink
              key={item.href}
              active={active}
              collapsed={collapsed}
              disabled={disabled}
              href={item.href}
              icon={item.icon}
              label={item.label}
              onClick={onNavigate}
              tooltip={
                item.requiresDomain && !publishingDomainReady
                  ? 'Verify and connect your domain on Configure first'
                  : disabled
                    ? 'Finish setup on Configure first'
                    : undefined
              }
            />
          );
        })}
      </nav>

      <div className="border-t border-ink-200 p-2">
        <button
          type="button"
          onClick={onLogout}
          disabled={isLoggingOut}
          title={collapsed ? 'Logout' : undefined}
          className={cn(
            'flex h-9 w-full items-center rounded-md text-sm text-ink-600 transition hover:bg-ink-50 hover:text-ink-900 disabled:pointer-events-none disabled:opacity-60',
            collapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5'
          )}
        >
          {isLoggingOut ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4 shrink-0" />
          )}
          <span
            aria-hidden={collapsed}
            className={cn('overflow-hidden whitespace-nowrap', collapsed && 'w-0 opacity-0')}
          >
            Logout
          </span>
        </button>
      </div>
    </div>
  );
}

export function DashboardLayoutShell({
  children,
  publishingDomainReady,
  setupComplete,
  userName,
  userEmail,
}: {
  children: ReactNode;
  publishingDomainReady: boolean;
  setupComplete: boolean;
  userName: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(sidebarOpenPreference);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const toggleSidebar = () => {
    setOpen((current) => {
      const next = !current;
      sidebarOpenPreference = next;
      return next;
    });
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    window.dispatchEvent(new Event('magnets:navigation-start'));
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <main className="min-h-screen bg-white text-ink-900">
      <div className="flex min-h-screen">
        <aside
          className={cn(
            'sticky top-0 hidden h-screen shrink-0 border-r border-ink-200 bg-white lg:block',
            open ? 'w-[232px]' : 'w-[64px]'
          )}
        >
          <SidebarContent
            collapsed={!open}
            onCollapseToggle={toggleSidebar}
            isLoggingOut={isLoggingOut}
            onLogout={handleLogout}
            publishingDomainReady={publishingDomainReady}
            setupComplete={setupComplete}
            userName={userName}
            userEmail={userEmail}
          />
        </aside>

        <AnimatePresence>
          {mobileOpen && (
            <>
              <motion.button
                aria-label="Close navigation"
                className="fixed inset-0 z-40 bg-ink-950/20 lg:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileOpen(false)}
                type="button"
              />
              <motion.aside
                initial={{ x: -288 }}
                animate={{ x: 0 }}
                exit={{ x: -288 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="fixed inset-y-0 left-0 z-50 w-72 border-r border-ink-200 bg-white shadow-xl lg:hidden"
              >
                <div className="absolute right-2 top-2">
                  <button
                    aria-label="Close navigation"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-900"
                    onClick={() => setMobileOpen(false)}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <SidebarContent
                  isLoggingOut={isLoggingOut}
                  onLogout={handleLogout}
                  onNavigate={() => setMobileOpen(false)}
                  publishingDomainReady={publishingDomainReady}
                  setupComplete={setupComplete}
                  userName={userName}
                  userEmail={userEmail}
                />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-ink-200 bg-white/90 px-4 backdrop-blur sm:px-6 lg:hidden lg:px-8">
            <button
              aria-label="Open navigation"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-700"
              onClick={() => setMobileOpen(true)}
              type="button"
            >
              <Menu className="h-4 w-4" />
            </button>
            <Link href="/dashboard" className="flex items-center gap-2" aria-label="Magnets dashboard">
              <MagnetsLogoMark className="h-6 w-6" iconClassName="h-3.5 w-3.5" />
              <span className="text-sm font-semibold text-ink-900">Magnets</span>
            </Link>
          </header>

          <div className="flex-1 bg-ink-50/40 px-4 py-6 sm:px-6 lg:px-8">{children}</div>

          <footer className="border-t border-ink-200 bg-white px-4 py-4 text-xs text-ink-500 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>Magnets</span>
              <div className="flex gap-3">
                <a href="/privacy" className="hover:text-ink-900" target="_blank" rel="noreferrer">Privacy</a>
                <a href="/terms" className="hover:text-ink-900" target="_blank" rel="noreferrer">Terms</a>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mx-auto mb-6 flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">{title}</h1>
        <p className="mt-1 text-sm text-ink-500">{subtitle}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
