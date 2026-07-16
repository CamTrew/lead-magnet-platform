/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { LeadMagnetForm } from '@/components/lead-magnet-form';
import { brandHighlightOpacity } from '@/lib/brand-highlight';
import {
  leadMagnetDisplayImageUrl,
  leadMagnetImageSrcSet,
} from '@/lib/lead-magnet-images';
import {
  absoluteMetadataUrl,
  preferredLeadMagnetUrl,
  safeJsonLd,
} from '@/lib/lead-magnet-metadata';
import { safeLegalUrl } from '@/lib/legal-links';
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

function remoteImageOrigin(imageUrl: string) {
  try {
    const url = new URL(imageUrl);
    return url.protocol === 'https:' ? url.origin : '';
  } catch {
    return '';
  }
}

const pageBackground = [
  'radial-gradient(circle at 7% 38%, var(--brand-primary-edge) 0, transparent 34%)',
  'radial-gradient(circle at 93% 42%, var(--brand-primary-edge) 0, transparent 34%)',
  'linear-gradient(180deg, #ffffff 0%, #f8fbff 44%, #ffffff 100%)',
  'linear-gradient(to right, rgb(15 23 42 / 0.035) 1px, transparent 1px)',
  'linear-gradient(to bottom, rgb(15 23 42 / 0.035) 1px, transparent 1px)',
].join(', ');
const darkPageBackground = [
  'radial-gradient(circle at 8% 32%, var(--brand-primary-edge) 0, transparent 32%)',
  'radial-gradient(circle at 92% 36%, var(--brand-primary-faint) 0, transparent 34%)',
  'linear-gradient(180deg, #0d0f13 0%, #11151b 48%, #0b0d10 100%)',
  'linear-gradient(to right, rgb(255 255 255 / 0.035) 1px, transparent 1px)',
  'linear-gradient(to bottom, rgb(255 255 255 / 0.035) 1px, transparent 1px)',
].join(', ');
const leadMagnetImageSizes = '(min-width: 1024px) 520px, calc(100vw - 48px)';

/**
 * Public page layout. Keep this in sync with the editor preview in
 * components/dashboard/page-editor-client.tsx.
 */
export function LeadMagnetPageView({
  account,
  canonicalUrl,
  leadMagnet: magnet,
}: {
  account: AccountSettings;
  canonicalUrl?: string;
  leadMagnet: LeadMagnet;
}) {
  const brandName = account.logoText.trim();
  const displayName = brandName || account.domain.trim() || 'Your Brand';
  const homeHref = account.domain ? `https://${account.domain}` : '#';
  const brandPrimary = account.brand.primary;
  const brandIntensity = account.brand.highlightIntensity;
  const isDark = account.brand.pageTheme === 'dark';
  const privacyPolicyUrl = safeLegalUrl(account.brand.privacyPolicyUrl);
  const termsUrl = safeLegalUrl(account.brand.termsUrl);
  const tone = (opacity: number) => alpha(brandPrimary, brandHighlightOpacity(opacity, brandIntensity));
  const brandStyle: BrandCss = {
    '--brand-primary': brandPrimary,
    '--brand-primary-rgb': rgbValue(brandPrimary),
    '--brand-primary-soft': tone(0.16),
    '--brand-primary-faint': tone(0.08),
    '--brand-primary-edge': tone(0.1),
    backgroundColor: isDark ? '#0b0d10' : '#ffffff',
    backgroundImage: isDark ? darkPageBackground : pageBackground,
    backgroundSize: 'auto, auto, auto, 72px 72px, 72px 72px',
    colorScheme: isDark ? 'dark' : 'light',
  };
  const imageUrl = magnet.imageUrl
    ? leadMagnetDisplayImageUrl({
        id: magnet.id,
        imageUrl: magnet.imageUrl,
        updatedAt: magnet.updatedAt,
      })
    : '';
  const imageSrcSet = magnet.imageUrl ? leadMagnetImageSrcSet(magnet.imageUrl) : undefined;
  const imageOrigin = remoteImageOrigin(imageUrl);
  const pageUrl = canonicalUrl || preferredLeadMagnetUrl(account, magnet);
  const siteUrl = absoluteMetadataUrl('/', pageUrl);
  const structuredImageUrl = imageUrl ? absoluteMetadataUrl(imageUrl, siteUrl) : undefined;
  const structuredLogoUrl = account.domainAttachedHost
    ? absoluteMetadataUrl('/favicon.ico', siteUrl)
    : account.logoUrl.startsWith('http://') || account.logoUrl.startsWith('https://')
      ? account.logoUrl
      : undefined;

  return (
    <div
      className={`magnet-page relative flex min-h-screen flex-col ${isDark ? 'magnet-page--dark' : 'bg-white text-zinc-900'}`}
      style={brandStyle}
    >
      {imageUrl && (
        <>
          {imageOrigin && <link rel="preconnect" href={imageOrigin} />}
          <link
            rel="preload"
            as="image"
            href={imageUrl}
            imageSrcSet={imageSrcSet}
            imageSizes={leadMagnetImageSizes}
          />
        </>
      )}
      <header className="relative z-10">
        <div className="mx-auto flex max-w-[1280px] items-center justify-center px-4 pb-7 pt-6 sm:px-6 sm:pb-8 sm:pt-7 lg:px-8">
          <Link href={homeHref} className="inline-flex min-h-10 max-w-full items-center justify-center gap-2 transition-transform hover:scale-[1.01]">
            <BrandLockup account={account} displayName={displayName} />
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <div className="mx-auto max-w-[1280px] px-4 pb-12 sm:px-6 sm:pb-16 lg:px-8 lg:pb-20">
          <div
            className="magnet-page-shell relative overflow-hidden rounded-[20px] border border-gray-200/70 bg-white/95 p-5 backdrop-blur-sm sm:rounded-[24px] sm:p-9 lg:p-14"
            style={{
              boxShadow: `0 36px 110px -72px rgb(15 23 42 / 0.72), 0 0 0 1px ${tone(0.08)}`,
            }}
          >
            <div className="lg:grid lg:grid-cols-[minmax(0,520px)_minmax(360px,520px)] lg:items-start lg:gap-x-14">
              <section className="min-w-0 lg:col-start-1 lg:row-start-1 lg:pt-1">
                <h1 className="magnet-page-heading mb-5 max-w-2xl break-words text-[2.15rem] font-semibold leading-[1.08] text-gray-950 sm:mb-6 sm:text-5xl lg:text-[58px] lg:leading-[1.05]">
                  {magnet.title}
                </h1>

                {magnet.subtitle && (
                  <p className="magnet-page-muted mb-10 max-w-2xl text-lg font-medium leading-relaxed text-gray-600">
                    {magnet.subtitle}
                  </p>
                )}
              </section>

              <aside className="mb-10 min-w-0 lg:sticky lg:top-10 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mb-0">
                <MediaAndCapture account={account} magnet={magnet} />
              </aside>

              <section className="min-w-0 lg:col-start-1 lg:row-start-2">
                {magnet.description && (
                  <div className="magnet-page-muted mb-11 max-w-2xl space-y-5 text-[15px] leading-relaxed text-gray-600">
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
                      <p className="magnet-page-copy mb-6 text-base font-semibold text-gray-700">
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
                              background: `linear-gradient(135deg, ${brandPrimary}, ${alpha(brandPrimary, 0.85)})`,
                              boxShadow: `0 6px 16px -6px ${tone(0.5)}`,
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
                          <span className="magnet-page-copy text-[15px] leading-7 text-gray-700">{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </main>

      <footer className="magnet-page-footer relative z-10 border-t border-gray-200/60 bg-white/55 py-11">
        <div className="magnet-page-muted mx-auto flex max-w-[1280px] flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 text-center text-sm text-gray-500 sm:px-6 lg:px-8">
          <span>All rights reserved {new Date().getFullYear()}</span>
          {privacyPolicyUrl && (
            <a className="transition hover:text-gray-900" href={privacyPolicyUrl} rel="noreferrer" target="_blank">
              Privacy policy
            </a>
          )}
          {termsUrl && (
            <a className="transition hover:text-gray-900" href={termsUrl} rel="noreferrer" target="_blank">
              Terms
            </a>
          )}
        </div>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': `${pageUrl}#webpage`,
            url: pageUrl,
            name: magnet.title,
            description: magnet.subtitle || magnet.description,
            inLanguage: 'en',
            datePublished: magnet.createdAt,
            dateModified: magnet.updatedAt,
            primaryImageOfPage: structuredImageUrl
              ? { '@type': 'ImageObject', url: structuredImageUrl }
              : undefined,
            isPartOf: {
              '@type': 'WebSite',
              '@id': `${siteUrl}#website`,
              name: displayName,
              url: siteUrl,
            },
            publisher: {
              '@type': 'Organization',
              '@id': `${siteUrl}#organization`,
              name: displayName,
              url: siteUrl,
              ...(structuredLogoUrl
                ? {
                    logo: {
                      '@type': 'ImageObject',
                      url: structuredLogoUrl,
                    },
                  }
                : {}),
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
          <span className="magnet-page-heading min-w-0 max-w-[72vw] truncate text-[32px] font-semibold leading-none text-gray-950 sm:text-[44px] lg:text-[48px]">
            {logoText}
          </span>
        )}
      </>
    );
  }

  return (
    <span className="magnet-page-heading max-w-[82vw] truncate text-[32px] font-semibold leading-none text-gray-950 sm:text-[44px] lg:text-[48px]">
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
  const imageUrl = leadMagnetDisplayImageUrl({
    id: magnet.id,
    imageUrl: magnet.imageUrl,
    updatedAt: magnet.updatedAt,
  });
  const imageSrcSet = leadMagnetImageSrcSet(magnet.imageUrl);

  return (
    <div
      className="magnet-image group overflow-hidden rounded-[20px] border border-gray-200/70 bg-gray-50"
      style={{
        backgroundImage: 'linear-gradient(135deg, #f3f6fb 0%, #ffffff 55%, #eef4fb 100%)',
      }}
    >
      <div className="relative aspect-[16/10] w-full">
        <img
          alt={magnet.title}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          decoding="async"
          fetchPriority="high"
          height={750}
          loading="eager"
          sizes={leadMagnetImageSizes}
          src={imageUrl}
          srcSet={imageSrcSet}
          width={1200}
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
  const brandPrimary = account.brand.primary;
  const brandIntensity = account.brand.highlightIntensity;
  const tone = (opacity: number) => alpha(brandPrimary, brandHighlightOpacity(opacity, brandIntensity));

  return (
    <div
      className="magnet-capture rounded-[22px] border bg-white p-6 backdrop-blur-sm sm:p-8"
      style={{
        borderColor: tone(0.28),
        backgroundImage: [
          `radial-gradient(circle at 18% 0%, ${tone(0.1)} 0, transparent 38%)`,
          `radial-gradient(circle at 82% 100%, ${tone(0.08)} 0, transparent 42%)`,
          'linear-gradient(180deg, #ffffff 0%, rgb(248 251 255 / 0.97) 100%)',
        ].join(', '),
        boxShadow: `0 26px 78px -48px ${tone(0.5)}, 0 18px 48px -42px rgb(15 23 42 / 0.24)`,
      }}
    >
      {magnet.formHeading && (
        <h2 className="magnet-page-heading mb-2 break-words text-center text-2xl font-semibold leading-tight text-gray-950 sm:text-[30px]">
          {magnet.formHeading}
        </h2>
      )}
      {magnet.formSubtext && (
        <p className="magnet-page-muted mb-7 text-center text-sm leading-6 text-gray-600 sm:mb-8">
          {magnet.formSubtext}
        </p>
      )}
      <LeadMagnetForm accountId={account.id} magnet={magnet} />
    </div>
  );
}
