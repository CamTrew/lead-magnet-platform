'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
    <div className="relative overflow-hidden rounded-3xl border p-8 shadow-xl" style={{ borderColor: 'var(--brand-primary-soft)', background: `linear-gradient(135deg, var(--brand-primary-faint), #ffffff, var(--brand-primary-faint))`, boxShadow: '0 24px 70px var(--brand-primary-soft)' }}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl" style={{ background: `linear-gradient(135deg, var(--brand-primary-soft), var(--brand-accent-faint))` }} />
      <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full blur-3xl" style={{ background: `linear-gradient(135deg, var(--brand-accent-faint), var(--brand-success))`, opacity: 0.18 }} />

      <div className="relative">
        {isSuccess ? (
          <div className="text-center">
            <div className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-full shadow-lg" style={{ background: `linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))` }}>
              <svg className="h-10 w-10 text-white" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="mb-3 text-3xl font-bold" style={{ color: 'var(--brand-primary-dark)' }}>Check your email!</h2>
            <p className="text-lg" style={{ color: 'var(--brand-primary)' }}>
              We have sent you the download link. Check your inbox (and spam folder).
            </p>
          </div>
        ) : (
          <>
            <h2 className="mb-2 text-center text-3xl font-bold" style={{ color: 'var(--brand-primary-dark)' }}>{magnet.formHeading}</h2>
            <p className="mb-8 text-center text-sm" style={{ color: 'var(--brand-primary)' }}>
              {magnet.formSubtext}
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-14 rounded-2xl border-2 bg-white/80 px-6 text-base shadow-sm backdrop-blur-sm transition-all focus:bg-white"
                style={{ borderColor: 'var(--brand-primary-soft)' }}
                placeholder="Name"
                required
              />

              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-14 rounded-2xl border-2 bg-white/80 px-6 text-base shadow-sm backdrop-blur-sm transition-all focus:bg-white"
                style={{ borderColor: 'var(--brand-primary-soft)' }}
                placeholder="Email"
                required
              />

              {error && (
                <div className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-600">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-14 w-full rounded-2xl text-base font-bold uppercase tracking-wide text-white shadow-xl transition-all duration-200 hover:scale-[1.02] hover:shadow-2xl disabled:opacity-50"
                style={{ background: `linear-gradient(90deg, var(--brand-primary-dark), var(--brand-primary))`, boxShadow: '0 24px 48px var(--brand-primary-soft)' }}
              >
                {isSubmitting ? 'Submitting...' : magnet.ctaText}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
