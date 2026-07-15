'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { MagnetsLogoMark } from '@/components/magnets-logo-mark';
import { AceternityButton, AceternityInput } from '@/components/ui/aceternity';

export function ForgotPasswordCard() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) throw new Error(data?.error || 'We could not send a reset link.');
      setSent(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="brand-soft-bg relative flex min-h-screen items-center justify-center px-4 py-10 text-ink-900">
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4">
          <MagnetsLogoMark className="h-12 w-12" />
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-ink-950">Reset your password</h1>
            <p className="mt-1.5 text-sm text-ink-600">We will email you a link to choose a new one.</p>
          </div>
        </div>

        {sent ? (
          <div className="rounded-lg border border-ink-200 bg-white p-6 text-center shadow-[0_24px_70px_-56px_rgba(17,17,17,0.75)]">
            <p className="text-sm leading-6 text-ink-700">
              Check your inbox. If an account exists for that email, you will receive a password reset link shortly.
            </p>
            <Link className="mt-5 inline-block text-sm font-medium text-ink-950 underline-offset-4 hover:underline" href="/login">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-ink-200 bg-white p-6 shadow-[0_24px_70px_-56px_rgba(17,17,17,0.75)]">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink-700">Email</span>
              <AceternityInput
                autoComplete="email"
                autoFocus
                disabled={isSubmitting}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={email}
              />
            </label>

            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                {error}
              </p>
            )}

            <AceternityButton className="w-full" disabled={isSubmitting} size="md">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Sending link...' : 'Email me a reset link'}
            </AceternityButton>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-ink-600">
          Remembered it?{' '}
          <Link className="font-medium text-ink-900 underline-offset-4 hover:underline" href="/login">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
