'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { LeadMagnet } from '@/lib/types';

/**
 * Inputs + submit only — heading / subtext / surface chrome are owned by the
 * CaptureCard wrapper in LeadMagnetPageView so we don't render them twice.
 * Keep this file lean: anything visual that's reusable across the public
 * page belongs in the wrapper, not here.
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
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white"
          style={{ background: 'var(--brand-primary)' }}
        >
          <Check className="h-5 w-5" strokeWidth={3} />
        </div>
        <p className="text-base font-semibold text-zinc-950">Check your email</p>
        <p className="text-sm leading-6 text-zinc-600">
          We just sent you the download link. Check your inbox (and spam folder if you don&apos;t see it).
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950"
        placeholder="Name"
        required
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950"
        placeholder="you@example.com"
        required
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
        style={{ background: 'var(--brand-primary)' }}
      >
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {isSubmitting ? 'Sending' : magnet.ctaText}
      </button>
    </form>
  );
}
