import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="premium-page-bg flex min-h-screen items-center justify-center px-4 text-[#09090b]">
      <div className="rounded-lg border border-[#e4e4e7] bg-white p-8 text-center shadow-sm">
        <h1 className="mb-4 text-6xl font-black text-[#09090b]">404</h1>
        <h2 className="mb-4 text-2xl font-black text-[#09090b]">
          Page not found
        </h2>
        <p className="mb-8 text-[#52525b]">
          This page does not exist yet.
        </p>
        <Link
          href="/dashboard"
          className="rounded-lg bg-[#09090b] px-6 py-3 font-bold text-white shadow-sm transition hover:bg-[#27272a]"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
