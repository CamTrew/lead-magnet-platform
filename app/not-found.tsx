import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="premium-page-bg flex min-h-screen items-center justify-center px-4 text-ink-950">
      <div className="rounded-lg border border-ink-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-4 text-6xl font-black text-ink-950">404</h1>
        <h2 className="mb-4 text-2xl font-black text-ink-950">
          Page not found
        </h2>
        <p className="mb-8 text-ink-600">
          This page does not exist yet.
        </p>
        <Link
          href="/dashboard"
          className="rounded-full bg-ink-950 px-6 py-3 font-bold text-white shadow-sm transition hover:bg-brand-orange hover:text-ink-950"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
