import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-teal-50 via-white to-brand-teal-50/30">
      <div className="text-center">
        <h1 className="mb-4 text-6xl font-bold text-brand-teal-800">404</h1>
        <h2 className="mb-4 text-2xl font-semibold text-brand-teal-700">
          Page Not Found
        </h2>
        <p className="mb-8 text-brand-teal-600">
          This page does not exist yet.
        </p>
        <Link
          href="/dashboard"
          className="rounded-lg bg-gradient-to-r from-brand-teal-700 to-brand-teal-600 px-6 py-3 font-semibold text-white transition-transform hover:scale-105 shadow-lg shadow-brand-teal-700/30"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
