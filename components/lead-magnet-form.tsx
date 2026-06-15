'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { LeadMagnet } from '@/lib/types';

/**
 * Inputs + submit only — heading / subtext / surface chrome are owned by the
 * CaptureCard wrapper in LeadMagnetPageView.
 */
export function LeadMagnetForm({
  accountId,
  magnet,
}: {
  accountId: string;
  magnet: LeadMagnet;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, leadMagnetId: magnet.id, slug: magnet.slug, name, email }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit');
      }

      setIsSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          className="inline-flex h-14 w-14 items-center justify-center rounded-2xl text-white"
          style={{
            background: 'var(--brand-primary)',
            boxShadow: '0 18px 42px rgb(var(--brand-primary-rgb) / 0.28)',
          }}
        >
          <Check className="h-7 w-7" strokeWidth={3} />
        </div>
        <h3 className="text-2xl font-bold text-gray-900">Check your email</h3>
        <p className="text-base leading-7 text-gray-600">
          We just sent the download link to your inbox. Check your spam folder if it&apos;s not there.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-14 w-full rounded-xl border-2 border-gray-200 bg-white/80 px-5 text-[15px] text-gray-900 shadow-sm outline-none transition-all placeholder:text-gray-500 focus:border-[var(--brand-primary)] focus:bg-white focus:ring-2 focus:ring-[var(--brand-primary-soft)]"
        placeholder="Name"
        required
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-14 w-full rounded-xl border-2 border-gray-200 bg-white/80 px-5 text-[15px] text-gray-900 shadow-sm outline-none transition-all placeholder:text-gray-500 focus:border-[var(--brand-primary)] focus:bg-white focus:ring-2 focus:ring-[var(--brand-primary-soft)]"
        placeholder="Email"
        required
      />

      {error && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-gray-900 to-gray-800 px-4 py-3 text-center text-sm font-bold uppercase leading-tight text-white shadow-xl shadow-gray-900/30 transition-all duration-200 hover:scale-[1.01] hover:shadow-2xl hover:shadow-gray-900/40 disabled:opacity-50 disabled:hover:scale-100"
      >
        {isSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}
        {isSubmitting ? 'Sending' : magnet.ctaText}
      </button>
    </form>
  );
}
