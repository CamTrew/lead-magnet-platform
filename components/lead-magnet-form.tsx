'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { LeadMagnet } from '@/lib/types';

export function LeadMagnetForm({ accountId, magnet }: { accountId: string; magnet: LeadMagnet }) {
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

  return (
    <div
      className="rounded-lg border bg-white p-6 sm:p-8"
      style={{
        borderColor: 'var(--brand-primary-soft)',
        boxShadow: '0 26px 72px rgb(var(--brand-primary-rgb) / 0.18)',
      }}
    >
      <div>
        {isSuccess ? (
          <div className="text-center">
            <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-lg bg-[var(--brand-primary)] shadow-[0_18px_42px_rgb(var(--brand-primary-rgb)/0.28)]">
              <Check className="h-8 w-8 text-white" strokeWidth={3} />
            </div>
            <h2 className="mb-3 text-2xl font-black text-[var(--brand-primary-dark)]">Check your email</h2>
            <p className="text-base leading-7 text-slate-600">
              We have sent you the download link. Check your inbox (and spam folder).
            </p>
          </div>
        ) : (
          <>
            <h2 className="mb-2 text-center text-2xl font-black tracking-tight text-[var(--brand-primary-dark)]">{magnet.formHeading}</h2>
            <p className="mb-8 text-center text-sm leading-6 text-slate-600">
              {magnet.formSubtext}
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-12 w-full rounded-lg border border-[var(--brand-primary-soft)] bg-white px-4 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary-soft)]"
                placeholder="Name"
                required
              />

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 w-full rounded-lg border border-[var(--brand-primary-soft)] bg-white px-4 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary-soft)]"
                placeholder="Email"
                required
              />

              {error && (
                <div className="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-600">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand-primary)] text-base font-black text-white shadow-xl transition hover:brightness-95 disabled:opacity-50"
                style={{ boxShadow: '0 18px 40px rgb(var(--brand-primary-rgb) / 0.28)' }}
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Sending resource' : magnet.ctaText}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
