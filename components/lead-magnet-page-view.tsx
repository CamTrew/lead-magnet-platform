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

const pageBackground = [
  'linear-gradient(180deg, #ffffff 0%, #f8fbff 44%, #ffffff 100%)',
  'linear-gradient(to right, rgb(15 23 42 / 0.035) 1px, transparent 1px)',
  'linear-gradient(to bottom, rgb(15 23 42 / 0.035) 1px, transparent 1px)',
].join(', ');

/**
 * Public page layout. Keep this in sync with the editor preview in
 * components/dashboard/page-editor-client.tsx.
 */
export function LeadMagnetPageView({
  account,
  leadMagnet: magnet,
}: {
  account: AccountSettings;
  leadMagnet: LeadMagnet;
}) {
  const brandName = account.logoText.trim();
  const displayName = brandName || 'Your Brand';
  const homeHref = account.domain ? `https://${account.domain}` : '#';
  const brandStyle: BrandCss = {
    '--brand-primary': account.brand.primary,
    '--brand-primary-rgb': rgbValue(account.brand.primary),
    '--brand-primary-soft': alpha(account.brand.primary, 0.16),
    '--brand-primary-faint': alpha(account.brand.primary, 0.05),
    backgroundImage: pageBackground,
    backgroundSize: 'auto, 72px 72px, 72px 72px',
  };

  return (
    <div
      className="relative flex min-h-screen flex-col bg-white text-zinc-900"
      style={brandStyle}
    >
      <header className="relative z-10">
        <div className="mx-auto flex max-w-[1380px] items-center justify-center px-4 pb-7 pt-6 sm:px-6 sm:pb-8 sm:pt-7 lg:px-8">
          <Link href={homeHref} className="inline-flex min-h-10 max-w-full items-center gap-2 transition-transform hover:scale-[1.01]">
            <BrandLockup account={account} displayName={displayName} />
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <div className="mx-auto max-w-[1380px] px-4 pb-12 sm:px-6 sm:pb-16 lg:px-8 lg:pb-20">
          <div
            className="relative overflow-hidden rounded-[24px] border border-gray-200/70 bg-white/95 p-6 backdrop-blur-sm sm:p-9 lg:p-16"
            style={{
              boxShadow: `0 36px 110px -72px rgb(15 23 42 / 0.72), 0 0 0 1px ${alpha(account.brand.primary, 0.02)}`,
            }}
          >
            <div className="lg:grid lg:grid-cols-[minmax(0,560px)_minmax(380px,560px)] lg:items-start lg:gap-16">
              <section className="min-w-0 lg:pt-1">
                <h1 className="mb-6 max-w-2xl break-words text-4xl font-black leading-[1.08] text-gray-950 sm:text-5xl lg:text-[58px] lg:leading-[1.05]">
                  {magnet.title}
                </h1>

                {magnet.subtitle && (
                  <p className="mb-10 max-w-2xl text-lg font-medium leading-relaxed text-gray-600">
                    {magnet.subtitle}
                  </p>
                )}

                <div className="mb-10 lg:hidden">
                  <MediaAndCapture account={account} magnet={magnet} />
                </div>

                {magnet.description && (
                  <div className="mb-11 max-w-2xl space-y-5 text-[15px] leading-relaxed text-gray-600">
                    {magnet.description
                      .split('\n\n')
                      .filter(Boolean)
                      .map((paragraph) => (
                        <p key={paragraph} className="leading-7">{paragraph}</p>
                      ))}
                  </div>
                )}

                {magnet.bullets.length > 0 && (
                  <div>
                    {magnet.bulletsHeading && (
                      <p className="mb-6 text-base font-semibold text-gray-700">
                        {magnet.bulletsHeading}
                      </p>
                    )}
                    <ul className="max-w-2xl space-y-4">
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
                          <span className="text-[15px] leading-7 text-gray-700">{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <aside className="hidden lg:sticky lg:top-10 lg:block">
                <MediaAndCapture account={account} magnet={magnet} />
              </aside>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-gray-200/60 bg-white/55 py-11">
        <div className="mx-auto flex max-w-[1380px] items-center justify-center px-4 text-center text-sm text-gray-500 sm:px-6 lg:px-8">
          <span>All rights reserved {new Date().getFullYear()}</span>
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

function BrandLockup({
  account,
  displayName,
}: {
  account: AccountSettings;
  displayName: string;
}) {
  const logoText = account.logoText.trim();

  if (account.logoUrl) {
    return (
      <>
        <img src={account.logoUrl} alt="" className="h-8 w-auto max-w-[52px] object-contain sm:h-10" />
        {logoText && (
          <span className="min-w-0 max-w-[72vw] truncate text-[32px] font-extrabold leading-none text-gray-950 sm:text-[44px] lg:text-[48px]">
            {logoText}
          </span>
        )}
      </>
    );
  }

  return (
    <span className="max-w-[82vw] truncate text-[32px] font-extrabold leading-none text-gray-950 sm:text-[44px] lg:text-[48px]">
      {displayName}
    </span>
  );
}

function MediaAndCapture({
  account,
  magnet,
}: {
  account: AccountSettings;
  magnet: LeadMagnet;
}) {
  return (
    <div className="space-y-8">
      {magnet.imageUrl && <MagnetImage magnet={magnet} />}
      <CaptureCard account={account} magnet={magnet} />
    </div>
  );
}

function MagnetImage({ magnet }: { magnet: LeadMagnet }) {
  return (
    <div className="group overflow-hidden rounded-[20px] border border-gray-200/70 bg-gray-50">
      <div className="aspect-[16/10] w-full">
        <img
          alt={magnet.title}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          src={magnet.imageUrl}
        />
      </div>
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
      className="rounded-[22px] border bg-white p-6 backdrop-blur-sm sm:p-8"
      style={{
        borderColor: alpha(account.brand.primary, 0.12),
        backgroundImage: 'linear-gradient(180deg, #ffffff 0%, rgb(248 251 255 / 0.96) 100%)',
        boxShadow: '0 22px 70px -44px rgb(59 130 246 / 0.24), 0 18px 48px -42px rgb(15 23 42 / 0.22)',
      }}
    >
      {magnet.formHeading && (
        <h2 className="mb-2 break-words text-center text-2xl font-black leading-tight text-gray-950 sm:text-[30px]">
          {magnet.formHeading}
        </h2>
      )}
      {magnet.formSubtext && (
        <p className="mb-7 text-center text-sm leading-6 text-gray-600 sm:mb-8">
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
