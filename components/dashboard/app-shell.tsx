'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bug,
  CircleHelp,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Lightbulb,
  Loader2,
  LogOut,
  Menu,
  Palette,
  Settings,
  Users,
  X,
} from 'lucide-react';
import {
  HelpCenterModal,
  OPEN_HELP_TOPIC_EVENT,
  type HelpTopic,
} from '@/components/dashboard/help-center';
import { MagnetsLogo } from '@/components/magnets-logo-mark';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard/pages', icon: FileText, label: 'Lead magnets', requiresSetup: true },
  { href: '/dashboard/resources', icon: FolderOpen, label: 'Hosted resources', requiresSetup: false },
  { href: '/dashboard/signups', icon: Users, label: 'Signups', requiresSetup: true },
  {
    href: '/dashboard',
    icon: LayoutDashboard,
    label: 'Workspace setup',
    requiresSetup: false,
    dividerBefore: true,
  },
  { href: '/dashboard/brand', icon: Palette, label: 'Brand', requiresSetup: false },
  { href: '/dashboard/account', icon: Settings, label: 'Account', requiresSetup: false },
];

function userInitials(name: string, email: string) {
  const source = name.trim() || email.trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function SidebarLink({
  active,
  disabled,
  href,
  icon: Icon,
  label,
  onClick,
  tooltip,
}: {
  active: boolean;
  disabled?: boolean;
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  onClick?: () => void;
  tooltip?: string;
}) {
  const baseClassName = cn(
    'group flex min-h-11 items-center gap-2.5 rounded-md px-2.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-inset lg:min-h-9',
    active
      ? 'bg-[#fff0e9] text-ink-950 font-medium'
      : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
    disabled && 'cursor-not-allowed text-ink-400 hover:bg-transparent hover:text-ink-400'
  );

  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="overflow-hidden whitespace-nowrap">{label}</span>
    </>
  );

  if (disabled) {
    return (
      <button
        type="button"
        aria-disabled
        className={baseClassName}
        title={tooltip}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      title={tooltip}
      className={baseClassName}
    >
      {content}
    </Link>
  );
}

function SidebarContent({
  onOpenHelp,
  onLogout,
  onNavigate,
  isLoggingOut,
  setupComplete,
  userName,
  userEmail,
}: {
  isLoggingOut?: boolean;
  onOpenHelp: () => void;
  onLogout: () => void;
  onNavigate?: () => void;
  setupComplete: boolean;
  userName: string;
  userEmail: string;
}) {
  const pathname = usePathname();
  const accountMenuRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    function closeAccountMenu({ restoreFocus = false } = {}) {
      const menu = accountMenuRef.current;
      if (!menu?.open) return;
      menu.removeAttribute('open');
      if (restoreFocus) menu.querySelector('summary')?.focus();
    }

    function handlePointerDown(event: PointerEvent) {
      const menu = accountMenuRef.current;
      if (!menu?.open || menu.contains(event.target as Node)) return;
      closeAccountMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      closeAccountMenu({ restoreFocus: true });
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="dashboard-chrome flex h-11 items-center gap-2.5 border-b border-ink-200 px-3">
        <Link href="/dashboard" aria-label="Magnets dashboard">
          <MagnetsLogo className="h-5 w-[6.6rem]" />
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-3">
        {navItems.map((item) => {
          const isDashboardRoot = item.href === '/dashboard';
          const active = isDashboardRoot
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const disabled = Boolean(item.requiresSetup && !setupComplete);
          return (
            <div
              key={item.href}
              className={cn(item.dividerBefore && 'mt-3 border-t border-ink-200 pt-3')}
            >
              <SidebarLink
                active={active}
                disabled={disabled}
                href={item.href}
                icon={item.icon}
                label={item.label}
                onClick={onNavigate}
                tooltip={disabled ? 'Choose a Magnets URL in Configure first' : undefined}
              />
            </div>
          );
        })}
        <button
          type="button"
          onClick={onOpenHelp}
          className="group flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-ink-600 transition hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-inset lg:min-h-9"
        >
          <CircleHelp className="h-4 w-4 shrink-0" />
          <span className="overflow-hidden whitespace-nowrap">Help</span>
        </button>
      </nav>

      <div className="border-t border-ink-200 p-2">
        <details className="group relative" ref={accountMenuRef}>
          <summary
            className="dashboard-chrome flex min-h-11 w-full cursor-pointer list-none items-center gap-2.5 rounded-md px-2.5 text-ink-900 transition hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-inset [&::-webkit-details-marker]:hidden"
          >
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-950 text-[10px] font-semibold text-white"
            >
              {userInitials(userName, userEmail)}
            </span>
            <span className="min-w-0 overflow-hidden">
              <span className="block truncate text-xs font-semibold text-ink-950">{userName || 'Welcome'}</span>
              <span className="block truncate text-[11px] text-ink-500">{userEmail}</span>
            </span>
          </summary>

          <div
            className="absolute bottom-[calc(100%+0.5rem)] left-0 z-30 w-52 rounded-md border border-ink-200 bg-white p-1.5 shadow-[0_16px_38px_-22px_rgba(17,17,17,0.5)]"
            role="menu"
          >
            <ThemeToggle
              className="h-9 w-full justify-start border-transparent bg-transparent px-2.5 shadow-none"
              showLabel
            />
            <a
              href="mailto:hello@camerontrew.com?subject=Magnets%20bug%20report"
              className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-ink-700 transition hover:bg-ink-50 hover:text-ink-950"
              role="menuitem"
            >
              <Bug className="h-4 w-4 shrink-0" />
              Report a bug
            </a>
            <a
              href="mailto:hello@camerontrew.com?subject=Magnets%20feature%20request&body=Feature%20I%27d%20like%20to%20see%3A%0A%0AWhy%20it%20would%20help%3A%0A%0AAnything%20else%3A"
              className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-ink-700 transition hover:bg-ink-50 hover:text-ink-950"
              role="menuitem"
            >
              <Lightbulb className="h-4 w-4 shrink-0" />
              Request a feature
            </a>
            <button
              type="button"
              onClick={onLogout}
              disabled={isLoggingOut}
              className="flex h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-ink-700 transition hover:bg-ink-50 hover:text-ink-950 disabled:pointer-events-none disabled:opacity-60 sm:h-9"
              role="menuitem"
            >
              {isLoggingOut ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4 shrink-0" />
              )}
              Logout
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}

export function DashboardLayoutShell({
  children,
  setupComplete,
  userName,
  userEmail,
}: {
  children: ReactNode;
  setupComplete: boolean;
  userName: string;
  userEmail: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTopic, setHelpTopic] = useState<HelpTopic | null>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    function handleOpenHelp(event: Event) {
      const topic = (event as CustomEvent<{ topic?: HelpTopic }>).detail?.topic;
      if (!topic) return;
      setHelpTopic(topic);
      setHelpOpen(true);
    }

    window.addEventListener(OPEN_HELP_TOPIC_EVENT, handleOpenHelp);
    return () => window.removeEventListener(OPEN_HELP_TOPIC_EVENT, handleOpenHelp);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;

    const menuButton = mobileMenuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setMobileOpen(false);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      menuButton?.focus();
    };
  }, [mobileOpen]);

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    window.dispatchEvent(new Event('magnets:navigation-start'));
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  };

  return (
    <main className="dashboard-canvas min-h-screen text-ink-900">
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 border-r border-ink-200 bg-white lg:block">
          <SidebarContent
            isLoggingOut={isLoggingOut}
            onOpenHelp={() => {
              setHelpTopic(null);
              setHelpOpen(true);
            }}
            onLogout={handleLogout}
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
                  onOpenHelp={() => {
                    setMobileOpen(false);
                    setHelpTopic(null);
                    setHelpOpen(true);
                  }}
                  onLogout={handleLogout}
                  onNavigate={() => setMobileOpen(false)}
                  setupComplete={setupComplete}
                  userName={userName}
                  userEmail={userEmail}
                />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="dashboard-chrome sticky top-0 z-30 flex h-11 items-center gap-3 border-b border-ink-200 px-4 backdrop-blur sm:px-6 lg:hidden lg:px-8">
            <button
              aria-label="Open navigation"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-700"
              onClick={() => setMobileOpen(true)}
              ref={mobileMenuButtonRef}
              type="button"
            >
              <Menu className="h-4 w-4" />
            </button>
            <Link href="/dashboard" className="flex items-center gap-2" aria-label="Magnets dashboard">
              <MagnetsLogo className="h-5 w-[6.6rem]" />
            </Link>
          </header>

          <div className="dashboard-canvas flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</div>

          <footer className="dashboard-canvas border-t border-ink-200 px-4 py-4 text-xs text-ink-500 sm:px-6 lg:px-8">
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

      <HelpCenterModal
        initialTopic={helpTopic}
        key={helpTopic || 'help-library'}
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
      />

    </main>
  );
}

export function PageHeader({
  title,
  subtitle,
  helpTopic,
  actions,
}: {
  title: string;
  subtitle: string;
  helpTopic: HelpTopic;
  actions?: ReactNode;
}) {
  return (
    <div className="mx-auto mb-5 flex max-w-7xl flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink-950 sm:text-[28px]">{title}</h1>
          <button
            aria-label={`Help with ${title}`}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-400 transition hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
            onClick={() => {
              window.dispatchEvent(new CustomEvent(OPEN_HELP_TOPIC_EVENT, {
                detail: { topic: helpTopic },
              }));
            }}
            title={`Help with ${title}`}
            type="button"
          >
            <CircleHelp className="h-[18px] w-[18px]" />
          </button>
        </div>
        <p className="mt-1.5 text-sm leading-6 text-ink-500">{subtitle}</p>
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
    </div>
  );
}
