import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { MagnetsLogo } from '@/components/magnets-logo-mark';

export function LegalPage({
  children,
  effective,
  subtitle,
  title,
}: {
  children: ReactNode;
  effective: string;
  subtitle: string;
  title: string;
}) {
  return (
    <main className="min-h-screen bg-brand-soft text-ink-900">
      <header className="border-b border-ink-200 bg-brand-soft">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Magnets home">
            <MagnetsLogo markClassName="h-8" />
          </Link>
          <Link
            href="/"
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-ink-600 transition hover:bg-white hover:text-ink-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Home
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <p className="text-xs font-bold uppercase text-ink-500">{subtitle}</p>
        <h1 className="mt-2 text-3xl font-black text-ink-950 sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-ink-500">Effective {effective}</p>

        <article className="prose-magnets mt-10 space-y-8 text-[15px] leading-7 text-ink-700">
          {children}
        </article>

        <div className="mt-12 border-t border-ink-200 pt-6 text-sm text-ink-500">
          <p>
            Questions? Email{' '}
            <a className="text-ink-900 underline-offset-4 hover:underline" href="mailto:hello@magnets.so">
              hello@magnets.so
            </a>
            .
          </p>
        </div>
      </div>

      <footer className="border-t border-ink-200 bg-brand-soft px-4 py-6 text-xs text-ink-500 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Magnets</span>
          <div className="flex gap-3">
            <Link href="/" className="hover:text-ink-900">Home</Link>
            <a href="/privacy" className="hover:text-ink-900" target="_blank" rel="noreferrer">Privacy</a>
            <a href="/terms" className="hover:text-ink-900" target="_blank" rel="noreferrer">Terms</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

export function LegalSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-ink-950">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}
