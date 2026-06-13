/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { LeadMagnetForm } from '@/components/lead-magnet-form';
import type { AccountSettings, LeadMagnet } from '@/lib/types';

type BrandCss = CSSProperties & Record<`--${string}`, string>;

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '');
  const value = clean.length === 3
    ? clean.split('').map((char) => `${char}${char}`).join('')
    : clean;

  if (value.length !== 6) return null;

  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);

  return Number.isNaN(red) || Number.isNaN(green) || Number.isNaN(blue)
    ? null
    : `${red} ${green} ${blue}`;
}

function alpha(hex: string, opacity: number) {
  const rgb = hexToRgb(hex);
  return rgb ? `rgb(${rgb} / ${opacity})` : hex;
}

function rgbValue(hex: string) {
  return hexToRgb(hex) || '99 75 255';
}

function senderEmail(value: string) {
  const match = value.match(/<([^>]+)>/) || value.match(/([^\s<>]+@[^\s<>]+)/);
  return match?.[1] || '';
}

export function LeadMagnetPageView({
  account,
  leadMagnet: magnet,
}: {
  account: AccountSettings;
  leadMagnet: LeadMagnet;
}) {
  const contactEmail = senderEmail(account.resendFromEmail);
  const brandName = account.logoText.trim();
  const displayName = brandName || 'Your Brand';
  const homeHref = account.domain ? `https://${account.domain}` : '#';
  const brandStyle: BrandCss = {
    '--brand-primary': account.brand.primary,
    '--brand-primary-rgb': rgbValue(account.brand.primary),
    '--brand-primary-soft': alpha(account.brand.primary, 0.22),
    '--brand-primary-faint': alpha(account.brand.primary, 0.08),
    '--brand-accent': account.brand.accent,
    '--brand-accent-faint': alpha(account.brand.accent, 0.14),
    '--brand-success': account.brand.success,
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-white text-slate-900" style={brandStyle}>
      {/* Top gradient blur — Kleo-style soft halo behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[820px]"
        style={{
          background: `radial-gradient(60% 60% at 50% 0%, ${alpha(
            account.brand.primary,
            0.18
          )} 0%, transparent 65%), radial-gradient(40% 50% at 90% 10%, ${alpha(
            account.brand.accent,
            0.22
          )} 0%, transparent 70%)`,
        }}
      />

      <header
        className="relative z-10 border-b backdrop-blur-xl"
        style={{ borderColor: alpha(account.brand.primary, 0.12), background: 'rgba(255,255,255,0.72)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <Link href={homeHref} className="inline-flex min-h-10 items-center gap-2">
            {account.logoUrl ? (
              <img src={account.logoUrl} alt={displayName} className="max-h-9 max-w-[180px] object-contain" />
            ) : (
              <span
                className="text-base font-semibold tracking-tight"
                style={{ color: account.brand.primary }}
              >
                {displayName}
              </span>
            )}
          </Link>
          <span
            className="hidden items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium sm:inline-flex"
            style={{
              borderColor: alpha(account.brand.primary, 0.22),
              background: alpha(account.brand.primary, 0.06),
              color: account.brand.primary,
            }}
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: account.brand.primary }}
            />
            Free download
          </span>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-start lg:gap-16 lg:px-8 lg:pt-20 lg:pb-24">
          <section className="min-w-0">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide"
              style={{
                borderColor: alpha(account.brand.primary, 0.22),
                background: 'rgba(255,255,255,0.7)',
                color: account.brand.primary,
              }}
            >
              {magnet.ctaText.trim() ? 'Free resource' : 'Free download'}
            </span>

            <h1
              className="mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-slate-950 sm:text-5xl lg:text-6xl"
            >
              {magnet.title}
            </h1>

            {magnet.subtitle && (
              <p className="mt-5 max-w-2xl text-balance text-lg leading-7 text-slate-600 sm:text-xl">
                {magnet.subtitle}
              </p>
            )}

            {magnet.description && (
              <div className="mt-7 max-w-2xl space-y-3 text-[15px] leading-7 text-slate-700">
                {magnet.description
                  .split('\n\n')
                  .filter(Boolean)
                  .map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
              </div>
            )}

            {magnet.bullets.length > 0 && (
              <div className="mt-8 max-w-2xl">
                {magnet.bulletsHeading && (
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    {magnet.bulletsHeading}
                  </p>
                )}
                <ul className="mt-3 space-y-2.5">
                  {magnet.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3 text-[15px] leading-7 text-slate-700">
                      <span
                        aria-hidden
                        className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                        style={{
                          background: alpha(account.brand.primary, 0.12),
                          color: account.brand.primary,
                        }}
                      >
                        <svg viewBox="0 0 12 12" className="h-3 w-3">
                          <path
                            d="M2.5 6.2l2.4 2.4 4.6-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <aside className="space-y-6 lg:sticky lg:top-10">
            {magnet.imageUrl && (
              <div
                className="overflow-hidden rounded-2xl border bg-white"
                style={{
                  borderColor: alpha(account.brand.primary, 0.16),
                  boxShadow: `0 28px 80px ${alpha(account.brand.primary, 0.18)}`,
                }}
              >
                <div
                  className="aspect-[5/4] w-full"
                  style={{ background: alpha(account.brand.primary, 0.06) }}
                >
                  <img
                    alt={magnet.title}
                    className="h-full w-full object-cover"
                    src={magnet.imageUrl}
                  />
                </div>
              </div>
            )}

            <div
              className="rounded-2xl border bg-white p-6"
              style={{
                borderColor: alpha(account.brand.primary, 0.18),
                boxShadow: `0 24px 64px -32px ${alpha(account.brand.primary, 0.32)}`,
              }}
            >
              <LeadMagnetForm accountId={account.id} magnet={magnet} />
            </div>
          </aside>
        </div>
      </main>

      <footer
        className="relative z-10 border-t bg-white py-6"
        style={{ borderColor: alpha(account.brand.primary, 0.16) }}
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <Link
            className="font-semibold"
            href={homeHref}
            style={{ color: account.brand.primary }}
          >
            {displayName}
          </Link>
          <div className="flex flex-wrap items-center gap-4">
            {account.domain && (
              <Link className="transition hover:text-slate-900" href={homeHref}>
                Home
              </Link>
            )}
            {contactEmail && (
              <a className="transition hover:text-slate-900" href={`mailto:${contactEmail}`}>
                Contact
              </a>
            )}
            <span className="text-slate-500">© {new Date().getFullYear()} {displayName}</span>
          </div>
        </div>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: magnet.title,
            description: magnet.subtitle || magnet.description,
            inLanguage: 'en',
            isPartOf: account.domain
              ? { '@type': 'WebSite', name: displayName, url: `https://${account.domain}` }
              : undefined,
            publisher: {
              '@type': 'Organization',
              name: displayName,
              ...(account.logoUrl ? { logo: account.logoUrl } : {}),
            },
          }),
        }}
      />
    </div>
  );
}

export function leadMagnetMetadataSnippet(value: string, max = 160) {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
