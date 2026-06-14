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
  return hexToRgb(hex) || '17 17 17';
}

function senderEmail(value: string) {
  const match = value.match(/<([^>]+)>/) || value.match(/([^\s<>]+@[^\s<>]+)/);
  return match?.[1] || '';
}

/**
 * Kleo-style layout: soft animated gradient background, a single oversized
 * rounded-3xl white card wrapping the hero and the form, gradient-clipped
 * headline, big bullets with brand-coloured check marks, oversized capture
 * card with h-14 inputs and a gradient-to-dark CTA. Visitors land on a page
 * that reads premium and pre-sold.
 *
 * Brand colour drives every accent (halo blobs, bullet checks, form-card
 * tint, CTA gradient stops). Default-brand purple still looks polished
 * because every component is built off the same `--brand-primary` CSS var.
 */
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
    '--brand-primary-soft': alpha(account.brand.primary, 0.16),
    '--brand-primary-faint': alpha(account.brand.primary, 0.05),
    '--brand-accent': account.brand.accent,
    '--brand-accent-faint': alpha(account.brand.accent, 0.12),
    '--brand-success': account.brand.success,
  };

  return (
    <div
      className="relative flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-white to-white text-zinc-900"
      style={brandStyle}
    >
      {/* Soft animated background blobs in the four corners — Kleo-style
          atmosphere. Brand-tinted so the page picks up the account's primary
          and accent colours without needing additional palette choices. */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          aria-hidden
          className="absolute left-10 top-20 size-64 animate-pulse rounded-full blur-3xl"
          style={{ background: `radial-gradient(circle, ${alpha(account.brand.primary, 0.18)}, transparent 70%)` }}
        />
        <div
          aria-hidden
          className="absolute right-20 top-40 size-48 animate-pulse rounded-full blur-3xl"
          style={{
            animationDelay: '1s',
            background: `radial-gradient(circle, ${alpha(account.brand.accent, 0.16)}, transparent 70%)`,
          }}
        />
        <div
          aria-hidden
          className="absolute bottom-40 left-20 size-56 animate-pulse rounded-full blur-3xl"
          style={{
            animationDelay: '2s',
            background: `radial-gradient(circle, ${alpha(account.brand.primary, 0.12)}, transparent 70%)`,
          }}
        />
        <div
          aria-hidden
          className="absolute bottom-20 right-10 size-40 animate-pulse rounded-full blur-3xl"
          style={{
            animationDelay: '3s',
            background: `radial-gradient(circle, ${alpha(account.brand.accent, 0.14)}, transparent 70%)`,
          }}
        />
      </div>

      <header className="relative z-10 border-b border-gray-200/50 bg-white/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-5 sm:px-6 lg:px-8">
          <Link href={homeHref} className="inline-flex min-h-10 items-center gap-2 transition-transform hover:scale-105">
            {account.logoUrl ? (
              <img src={account.logoUrl} alt={displayName} className="h-12 w-auto max-w-[220px] object-contain" />
            ) : (
              <span className="text-lg font-bold tracking-tight text-zinc-900">
                {displayName}
              </span>
            )}
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          {/* The whole hero (copy + form) sits inside one oversized rounded
              white card with a soft brand-tinted shadow, the way Kleo does
              it. Inside the card the layout splits into two columns on
              desktop. */}
          <div
            className="group relative overflow-hidden rounded-3xl border border-gray-200/60 bg-white p-8 backdrop-blur-sm sm:p-12 lg:p-16"
            style={{ boxShadow: `0 30px 80px -30px ${alpha(account.brand.primary, 0.25)}` }}
          >
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_440px] lg:items-start lg:gap-12">
              <section className="flex min-w-0 flex-col justify-center">
                <h1 className="mb-6 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-4xl font-extrabold leading-[1.1] tracking-tight text-transparent sm:text-5xl lg:text-6xl">
                  {magnet.title}
                </h1>

                {magnet.subtitle && (
                  <p className="mb-8 text-xl font-medium leading-relaxed text-gray-600">
                    {magnet.subtitle}
                  </p>
                )}

                {magnet.imageUrl && (
                  <div
                    className="group/image mb-8 overflow-hidden rounded-2xl border border-gray-200/60 transition-all duration-300 hover:shadow-xl"
                    style={{ boxShadow: `0 18px 50px -20px ${alpha(account.brand.primary, 0.2)}` }}
                  >
                    <div className="aspect-[16/9] w-full">
                      <img
                        alt={magnet.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover/image:scale-[1.02]"
                        src={magnet.imageUrl}
                      />
                    </div>
                  </div>
                )}

                {/* Mobile: capture card under the hero so visitors don't have
                    to scroll past the whole pitch to convert. */}
                <div className="mb-8 lg:hidden">
                  <CaptureCard account={account} magnet={magnet} />
                </div>

                {magnet.description && (
                  <div className="mb-8 space-y-4 text-base leading-relaxed text-gray-600">
                    {magnet.description
                      .split('\n\n')
                      .filter(Boolean)
                      .map((paragraph) => (
                        <p key={paragraph} className="leading-7">{paragraph}</p>
                      ))}
                  </div>
                )}

                {magnet.bullets.length > 0 && (
                  <div className="mb-6">
                    {magnet.bulletsHeading && (
                      <p className="mb-5 text-base font-semibold text-gray-700">
                        {magnet.bulletsHeading}
                      </p>
                    )}
                    <ul className="space-y-3">
                      {magnet.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-3">
                          <span
                            aria-hidden
                            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-white"
                            style={{
                              background: `linear-gradient(135deg, ${account.brand.primary}, ${alpha(account.brand.primary, 0.85)})`,
                              boxShadow: `0 6px 16px -6px ${alpha(account.brand.primary, 0.5)}`,
                            }}
                          >
                            <svg viewBox="0 0 12 12" className="h-3 w-3">
                              <path
                                d="M2.5 6.2l2.4 2.4 4.6-5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                          <span className="text-base leading-7 text-gray-700">{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              {/* Desktop sticky form. */}
              <aside className="hidden lg:sticky lg:top-12 lg:block">
                <CaptureCard account={account} magnet={magnet} />
              </aside>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-gray-200/50 bg-white/50 py-8 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <Link className="font-semibold text-gray-900" href={homeHref}>
            {displayName}
          </Link>
          <div className="flex flex-wrap items-center gap-4">
            {account.domain && (
              <Link className="transition hover:text-gray-900" href={homeHref}>
                Home
              </Link>
            )}
            {contactEmail && (
              <a className="transition hover:text-gray-900" href={`mailto:${contactEmail}`}>
                Contact
              </a>
            )}
            <span className="text-gray-500">© {new Date().getFullYear()} {displayName}</span>
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

function CaptureCard({
  account,
  magnet,
}: {
  account: AccountSettings;
  magnet: LeadMagnet;
}) {
  return (
    <div
      className="rounded-2xl border border-gray-200/60 bg-white p-6 backdrop-blur-sm sm:p-8"
      style={{ boxShadow: `0 26px 72px -20px ${alpha(account.brand.primary, 0.28)}` }}
    >
      {magnet.formHeading && (
        <h2 className="mb-2 text-center text-2xl font-bold text-gray-900 sm:text-3xl">
          {magnet.formHeading}
        </h2>
      )}
      {magnet.formSubtext && (
        <p className="mb-6 text-center text-sm leading-6 text-gray-600 sm:mb-8">
          {magnet.formSubtext}
        </p>
      )}
      <LeadMagnetForm accountId={account.id} magnet={magnet} />
    </div>
  );
}

export function leadMagnetMetadataSnippet(value: string, max = 160) {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
