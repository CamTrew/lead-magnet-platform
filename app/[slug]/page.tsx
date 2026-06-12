/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { findPublishedLeadMagnet } from '@/lib/platform-store';
import { LeadMagnetForm } from '@/components/lead-magnet-form';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

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

type BrandCss = CSSProperties & Record<`--${string}`, string>;

export default async function LeadMagnetPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') || 'localhost:3000';
  const result = await findPublishedLeadMagnet(host, slug);

  if (!result) notFound();

  const { account, leadMagnet: magnet } = result;
  const brandStyle: BrandCss = {
    '--brand-primary': account.brand.primary,
    '--brand-primary-dark': account.brand.primary,
    '--brand-primary-soft': alpha(account.brand.primary, 0.22),
    '--brand-primary-faint': alpha(account.brand.primary, 0.08),
    '--brand-accent': account.brand.accent,
    '--brand-accent-faint': alpha(account.brand.accent, 0.14),
    '--brand-success': account.brand.success,
  };

  return (
    <div
      className="min-h-screen"
      style={{
        ...brandStyle,
        background: `linear-gradient(135deg, ${alpha(account.brand.primary, 0.08)}, #ffffff 46%, ${alpha(account.brand.primary, 0.04)})`,
      }}
    >
      <header className="relative border-b border-[color:var(--brand-primary-soft)] bg-white">
        <div className="mx-auto flex max-w-7xl justify-center px-4 py-5 text-center sm:px-6 lg:px-8">
          <Link href={`https://${account.domain}`} className="inline-flex items-center justify-center transition-transform hover:scale-105">
            {account.logoUrl ? (
              <img src={account.logoUrl} alt={account.name} className="max-h-24 max-w-[260px] object-contain" />
            ) : (
              <span className="text-2xl font-extrabold tracking-tight" style={{ color: account.brand.primary }}>
                {account.name}
              </span>
            )}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <div className="relative overflow-hidden rounded-3xl border bg-white p-8 shadow-xl backdrop-blur-sm sm:p-12 lg:p-16" style={{ borderColor: alpha(account.brand.primary, 0.2), boxShadow: `0 24px 80px ${alpha(account.brand.primary, 0.12)}` }}>
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${alpha(account.brand.primary, 0.1)}, transparent 48%, ${alpha(account.brand.accent, 0.08)})`,
            }}
          />

          <div className="relative grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="flex flex-col justify-center">
              <h1 className="mb-6 bg-clip-text text-4xl font-extrabold leading-[1.1] tracking-tight text-transparent sm:text-5xl lg:text-6xl" style={{ backgroundImage: `linear-gradient(135deg, ${account.brand.primary}, ${account.brand.primary}, #0f2929)` }}>
                {magnet.title}
              </h1>

              <p className="mb-8 text-xl font-medium leading-relaxed" style={{ color: account.brand.primary }}>
                {magnet.subtitle}
              </p>

              <div className="mb-8 space-y-4 text-base leading-relaxed text-gray-600">
                {magnet.description.split('\n\n').map((paragraph, i) => (
                  <p key={i} className="leading-7">{paragraph}</p>
                ))}
              </div>

              {magnet.bullets.length > 0 && (
                <div className="mb-6">
                  <p className="mb-5 text-base font-semibold text-gray-700">
                    {magnet.bulletsHeading}
                  </p>
                  <ul className="space-y-4">
                    {magnet.bullets.map((bullet, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full" style={{ background: `linear-gradient(135deg, ${account.brand.primary}, ${account.brand.primary})` }}>
                          <svg className="h-4 w-4 text-white" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <span className="text-base leading-relaxed text-gray-700">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex flex-col justify-center gap-8">
              {magnet.imageUrl && (
                <div className="overflow-hidden rounded-2xl border shadow-lg transition-all duration-300 hover:shadow-xl" style={{ borderColor: alpha(account.brand.primary, 0.2), boxShadow: `0 18px 48px ${alpha(account.brand.primary, 0.12)}` }}>
                  <div className="relative aspect-[16/10] w-full" style={{ background: `linear-gradient(135deg, ${alpha(account.brand.primary, 0.1)}, ${alpha(account.brand.accent, 0.08)})` }}>
                    <img src={magnet.imageUrl} alt={magnet.title} className="h-full w-full object-cover" />
                  </div>
                </div>
              )}

              <LeadMagnetForm accountId={account.id} magnet={magnet} />
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t py-8 backdrop-blur-sm" style={{ borderColor: alpha(account.brand.primary, 0.18), backgroundColor: alpha(account.brand.primary, 0.04) }}>
        <div className="mx-auto max-w-7xl px-4 text-center text-sm sm:px-6 lg:px-8" style={{ color: account.brand.primary }}>
          <span>© {new Date().getFullYear()} {account.name}. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}

