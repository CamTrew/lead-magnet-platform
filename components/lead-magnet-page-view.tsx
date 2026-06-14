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
 * Kleo-inspired layout: clean white surface, one strong column, sticky brand
 * header, hero with oversized headline + subtitle, big image card, prominent
 * capture form pinned to the right on desktop and stacked under the hero on
 * mobile. Accents lean on the account brand color but the base tone stays
 * black/white so it reads premium and modern.
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
    <div className="relative flex min-h-screen flex-col bg-white text-zinc-900" style={brandStyle}>
      {/* Subtle painterly halo behind the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px]"
        style={{
          background: `radial-gradient(50% 60% at 50% 0%, ${alpha(
            account.brand.primary,
            0.1
          )} 0%, transparent 70%), radial-gradient(40% 50% at 10% 15%, ${alpha(
            account.brand.accent,
            0.1
          )} 0%, transparent 70%)`,
        }}
      />

      <header className="relative z-10 border-b border-zinc-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-center px-5 py-4 sm:px-8">
          <Link href={homeHref} className="inline-flex min-h-10 items-center gap-2">
            {account.logoUrl ? (
              <img src={account.logoUrl} alt={displayName} className="max-h-9 max-w-[200px] object-contain" />
            ) : (
              <span className="text-base font-semibold tracking-tight text-zinc-900">
                {displayName}
              </span>
            )}
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <div className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-8 sm:pt-16 lg:pt-24">
          {/* Mobile-first: hero copy on top, then image, then form, then long-form
              content (description + bullets). Desktop uses a two-column grid
              that keeps the form sticky on the right. */}

          {/* Hero (shared across both layouts) */}
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-12">
            <section className="min-w-0">
              <h1 className="text-balance text-3xl font-semibold leading-[1.08] tracking-tight text-zinc-950 sm:text-5xl lg:text-[56px]">
                {magnet.title}
              </h1>

              {magnet.subtitle && (
                <p className="mt-4 max-w-2xl text-balance text-base leading-7 text-zinc-600 sm:mt-5 sm:text-xl">
                  {magnet.subtitle}
                </p>
              )}

              {magnet.imageUrl && (
                <div className="mt-7 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 sm:mt-8 sm:rounded-2xl">
                  <div className="aspect-[16/10] w-full sm:aspect-[16/9]">
                    <img
                      alt={magnet.title}
                      className="h-full w-full object-cover"
                      src={magnet.imageUrl}
                    />
                  </div>
                </div>
              )}

              {/* Mobile: the form sits right under the hero so visitors don't
                  have to scroll through the whole pitch to convert. Desktop:
                  hidden because the aside already renders it on the right. */}
              <div className="mt-8 lg:hidden">
                <CaptureCard
                  account={account}
                  displayName={displayName}
                  magnet={magnet}
                />
              </div>

              {magnet.description && (
                <div className="mt-10 max-w-2xl space-y-4 text-[15px] leading-7 text-zinc-700">
                  {magnet.description
                    .split('\n\n')
                    .filter(Boolean)
                    .map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                </div>
              )}

              {magnet.bullets.length > 0 && (
                <div className="mt-8 max-w-2xl rounded-xl border border-zinc-200 bg-white p-5 sm:mt-10 sm:rounded-2xl sm:p-6">
                  {magnet.bulletsHeading && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {magnet.bulletsHeading}
                    </p>
                  )}
                  <ul className="mt-3 space-y-3 sm:mt-4">
                    {magnet.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-3 text-[15px] leading-7 text-zinc-800">
                        <span
                          aria-hidden
                          className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                          style={{
                            background: account.brand.primary,
                            color: 'white',
                          }}
                        >
                          <svg viewBox="0 0 12 12" className="h-3 w-3">
                            <path
                              d="M2.5 6.2l2.4 2.4 4.6-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
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

              {/* Mobile secondary CTA so people scrolling the long form copy
                  don't have to scroll back up. Hidden on desktop because the
                  sticky aside is always visible. */}
              {(magnet.description || magnet.bullets.length > 0) && (
                <div className="mt-8 lg:hidden">
                  <CaptureCard
                    account={account}
                    displayName={displayName}
                    magnet={magnet}
                    variant="secondary"
                  />
                </div>
              )}
            </section>

            {/* Desktop sticky form */}
            <aside className="hidden lg:sticky lg:top-12 lg:block">
              <CaptureCard
                account={account}
                displayName={displayName}
                magnet={magnet}
              />
            </aside>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-zinc-200 bg-white py-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Link className="font-semibold text-zinc-900" href={homeHref}>
            {displayName}
          </Link>
          <div className="flex flex-wrap items-center gap-4">
            {account.domain && (
              <Link className="transition hover:text-zinc-900" href={homeHref}>
                Home
              </Link>
            )}
            {contactEmail && (
              <a className="transition hover:text-zinc-900" href={`mailto:${contactEmail}`}>
                Contact
              </a>
            )}
            <span className="text-zinc-500">© {new Date().getFullYear()} {displayName}</span>
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
  displayName,
  magnet,
  variant = 'primary',
}: {
  account: AccountSettings;
  displayName: string;
  magnet: LeadMagnet;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_20px_50px_-30px_rgba(0,0,0,0.18)] sm:rounded-2xl sm:shadow-[0_30px_80px_-40px_rgba(0,0,0,0.18)]">
      <div
        className="border-b border-zinc-200 px-5 py-4 sm:px-6 sm:py-5"
        style={{ background: alpha(account.brand.primary, 0.04) }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
          {variant === 'secondary' ? 'Send it to my inbox' : 'Get the resource'}
        </p>
        <p className="mt-1 text-sm text-zinc-700">
          {variant === 'secondary'
            ? 'Pop your email in and we will send it straight over.'
            : "Drop your email below and we'll send it over right away."}
        </p>
      </div>
      <div className="p-5 sm:p-6">
        <LeadMagnetForm accountId={account.id} magnet={magnet} />
      </div>
      <div className="border-t border-zinc-200 px-5 py-3 text-[11px] leading-5 text-zinc-500 sm:px-6 sm:py-4">
        By submitting you agree to receive this resource by email from {displayName}. Unsubscribe any time.
      </div>
    </div>
  );
}

export function leadMagnetMetadataSnippet(value: string, max = 160) {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
