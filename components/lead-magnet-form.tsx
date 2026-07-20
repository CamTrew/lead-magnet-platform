'use client';

import { useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useLeadMagnetExperience } from '@/components/lead-magnet-experience';
import { resolvePostSignupExperience } from '@/lib/post-signup';
import { getLeadMagnetAnalyticsSessionId } from '@/lib/lead-magnet-analytics-client';
import type { LeadMagnet } from '@/lib/types';

function DefaultSuccess() {
  return (
    <div className="magnet-form flex flex-col items-center gap-4 text-center">
      <div
        className="inline-flex h-14 w-14 items-center justify-center rounded-2xl text-white"
        style={{
          background: 'var(--brand-primary)',
          boxShadow: '0 18px 42px rgb(var(--brand-primary-rgb) / 0.28)',
        }}
      >
        <Check className="h-7 w-7" strokeWidth={3} />
      </div>
      <h3 className="magnet-page-heading text-2xl font-semibold text-gray-900">Check your email</h3>
      <p className="magnet-page-muted text-base leading-7 text-gray-600">
        We just sent the download link to your inbox. Check your spam folder if it&apos;s not there.
      </p>
    </div>
  );
}

/** Inputs + submission state, including optional post-signup experience. */
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
  const submittingRef = useRef(false);
  const experience = resolvePostSignupExperience(magnet);
  const pageExperience = useLeadMagnetExperience();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          leadMagnetId: magnet.id,
          slug: magnet.slug,
          name,
          email,
          analyticsSessionId: getLeadMagnetAnalyticsSessionId(magnet.id) || undefined,
        }),
      });
      const data = await response.json().catch(() => null) as { error?: string; submissionId?: string } | null;
      if (!response.ok) throw new Error(data?.error || 'Failed to submit');

      if (experience.kind === 'redirect') {
        window.location.assign(experience.url);
        return;
      }

      if ((experience.kind === 'page' || experience.kind === 'quiz') && pageExperience) {
        pageExperience.showPostSignup(data?.submissionId || '');
        return;
      }

      setIsSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  if (isSuccess) {
    return <DefaultSuccess />;
  }

  return (
    <form onSubmit={handleSubmit} className="magnet-form space-y-4">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="magnet-form-input h-14 w-full rounded-xl border-2 border-gray-200 bg-white/80 px-5 text-[15px] text-gray-900 shadow-sm outline-none transition-all placeholder:text-gray-500 focus:border-[var(--brand-primary)] focus:bg-white focus:ring-2 focus:ring-[var(--brand-primary-soft)]"
        placeholder="Name"
        required
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="magnet-form-input h-14 w-full rounded-xl border-2 border-gray-200 bg-white/80 px-5 text-[15px] text-gray-900 shadow-sm outline-none transition-all placeholder:text-gray-500 focus:border-[var(--brand-primary)] focus:bg-white focus:ring-2 focus:ring-[var(--brand-primary-soft)]"
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
        className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-gray-900 to-gray-800 px-4 py-3 text-center text-sm font-semibold leading-tight text-white shadow-xl shadow-gray-900/30 transition-all duration-200 hover:scale-[1.01] hover:shadow-2xl hover:shadow-gray-900/40 disabled:opacity-50 disabled:hover:scale-100"
      >
        {isSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}
        {isSubmitting ? 'Sending' : magnet.ctaText}
      </button>
    </form>
  );
}
