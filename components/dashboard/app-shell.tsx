'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bug,
  ChevronDown,
  CircleHelp,
  FileText,
  FolderOpen,
  House,
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
import { DashboardPageExplain } from './dashboard-tour';
import { MagnetsLogo } from '@/components/magnets-logo-mark';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard/pages', icon: FileText, label: 'Lead magnets', requiresSetup: true },
  { href: '/dashboard/resources', icon: FolderOpen, label: 'Hosted resources', requiresSetup: false },
  { href: '/dashboard/signups', icon: Users, label: 'Signups', requiresSetup: true },
];

const settingsItems = [
  {
    href: '/dashboard',
    icon: LayoutDashboard,
    label: 'Customise',
    requiresSetup: false,
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
      aria-current={active ? 'page' : undefined}
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
  assistantCreationEnabled = false,
  userName,
  userEmail,
  brandLogoUrl = '',
}: {
  isLoggingOut?: boolean;
  onOpenHelp: () => void;
  onLogout: () => void;
  onNavigate?: () => void;
  setupComplete: boolean;
  assistantCreationEnabled?: boolean;
  userName: string;
  userEmail: string;
  brandLogoUrl?: string;
}) {
  const pathname = usePathname();
  const settingsActive = settingsItems.some(({ href }) => pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`)));
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const showBrandLogo = Boolean(brandLogoUrl && brandLogoUrl !== failedLogoUrl);
  const brandLogoRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    // A cached failure can finish before hydration attaches the error handler.
    const image = brandLogoRef.current;
    if (image?.complete && image.naturalWidth === 0) setFailedLogoUrl(brandLogoUrl);
  }, [brandLogoUrl]);
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
          <MagnetsLogo className="h-5 w-16 min-[400px]:w-[6.6rem]" />
        </Link>
      </div>

      <nav aria-label="Main navigation" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {(assistantCreationEnabled ? [{ href: '/dashboard/home', icon: House, label: 'Home', requiresSetup: false }, ...navItems] : navItems).map((item) => {
          const path = item.href.split('?')[0];
          const isDashboardRoot = path === '/dashboard';
          const active = isDashboardRoot
            ? pathname === path
            : pathname === path || pathname.startsWith(`${path}/`);
          const disabled = Boolean(item.requiresSetup && !setupComplete);
          return (
            <div
              key={item.href}
            >
              <SidebarLink
                active={active}
                disabled={disabled}
                href={item.href}
                icon={item.icon}
                label={item.label}
                onClick={onNavigate}
                tooltip={disabled ? 'Choose a Magnets URL in Settings → Customise first' : undefined}
              />
            </div>
          );
        })}
        <details key={pathname} open={settingsActive} className="group/settings border-t border-ink-200 pt-2 !mt-3">
          <summary className={cn(
            'flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-md px-2.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-inset lg:min-h-9 [&::-webkit-details-marker]:hidden',
            settingsActive ? 'font-medium text-ink-950' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
          )}>
            <Settings className="h-4 w-4 shrink-0" />
            <span>Settings</span>
            <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open/settings:rotate-180 motion-reduce:transition-none" />
          </summary>
          <div className="ml-[18px] mt-1 space-y-1 border-l border-ink-200 pl-2">
            {settingsItems.map(item => <SidebarLink
              key={item.href}
              active={pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`))}
              href={item.href === '/dashboard' && assistantCreationEnabled ? '/dashboard?setup=workspace' : item.href}
              icon={item.icon}
              label={item.label}
              onClick={onNavigate}
            />)}
          </div>
        </details>
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
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden text-[10px] font-semibold',
                showBrandLogo ? 'rounded-md' : 'rounded-full bg-ink-950 text-white'
              )}
            >
              {showBrandLogo ? (
                // Display the complete saved logo, including wide wordmarks, without cropping.
                // eslint-disable-next-line @next/next/no-img-element
                <img ref={brandLogoRef} src={brandLogoUrl} alt="" className="h-full w-full object-contain" onError={() => setFailedLogoUrl(brandLogoUrl)} />
              ) : userInitials(userName, userEmail)}
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
  assistantCreationEnabled = false,
  userName,
  userEmail,
  brandLogoUrl = '',
}: {
  children: ReactNode;
  setupComplete: boolean;
  assistantCreationEnabled?: boolean;
  userName: string;
  userEmail: string;
  brandLogoUrl?: string;
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
            assistantCreationEnabled={assistantCreationEnabled}
            brandLogoUrl={brandLogoUrl}
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
                  assistantCreationEnabled={assistantCreationEnabled}
                  brandLogoUrl={brandLogoUrl}
                  userName={userName}
                  userEmail={userEmail}
                />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header data-explain-header className="dashboard-chrome sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b border-ink-200 px-4 backdrop-blur sm:px-6 lg:px-8">
            <button
              aria-label="Open navigation"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-700 lg:hidden"
              onClick={() => setMobileOpen(true)}
              ref={mobileMenuButtonRef}
              type="button"
            >
              <Menu className="h-4 w-4" />
            </button>
            <Link href="/dashboard" className="flex items-center gap-2 lg:hidden" aria-label="Magnets dashboard">
              <MagnetsLogo className="h-5 w-16 min-[400px]:w-[6.6rem]" />
            </Link>
            <div className="ml-auto shrink-0"><DashboardPageExplain /></div>
          </header>

          <div className="dashboard-canvas flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</div>

          <footer className="dashboard-canvas border-t border-ink-200 px-4 py-2 text-xs text-ink-500 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0">
              <span className="py-3">© {new Date().getFullYear()} Magnets</span>
              <nav aria-label="Legal" className="flex items-center gap-4">
                <a href="/privacy" className="inline-flex min-h-11 items-center rounded-sm hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2" target="_blank" rel="noreferrer">Privacy</a>
                <a href="/terms" className="inline-flex min-h-11 items-center rounded-sm hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2" target="_blank" rel="noreferrer">Terms</a>
              </nav>
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
    <div data-help-topic={helpTopic} className="mx-auto mb-5 flex max-w-7xl flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink-950 sm:text-[28px]">{title}</h1>

        </div>
        <p className="mt-1.5 text-sm leading-6 text-ink-500">{subtitle}</p>
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
    </div>
  );
}
