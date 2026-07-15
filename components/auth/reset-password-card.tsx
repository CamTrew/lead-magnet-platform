'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { MagnetsLogoMark } from '@/components/magnets-logo-mark';
import { AceternityButton, AceternityInput } from '@/components/ui/aceternity';

export function ResetPasswordCard({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) throw new Error(data?.error || 'We could not update your password.');
      setComplete(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const invalidToken = token.length < 32;

  return (
    <main className="brand-soft-bg relative flex min-h-screen items-center justify-center px-4 py-10 text-ink-900">
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4">
          <MagnetsLogoMark className="h-12 w-12" />
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-ink-950">Choose a new password</h1>
            <p className="mt-1.5 text-sm text-ink-600">This will sign you out on your other devices.</p>
          </div>
        </div>

        {complete ? (
          <div className="rounded-lg border border-ink-200 bg-white p-6 text-center shadow-[0_24px_70px_-56px_rgba(17,17,17,0.75)]">
            <p className="text-sm leading-6 text-ink-700">Your password has been updated. You can now sign in.</p>
            <Link className="mt-5 inline-block text-sm font-medium text-ink-950 underline-offset-4 hover:underline" href="/login">
              Go to sign in
            </Link>
          </div>
        ) : invalidToken ? (
          <div className="rounded-lg border border-ink-200 bg-white p-6 text-center shadow-[0_24px_70px_-56px_rgba(17,17,17,0.75)]">
            <p className="text-sm leading-6 text-ink-700">This reset link is invalid or has expired.</p>
            <Link className="mt-5 inline-block text-sm font-medium text-ink-950 underline-offset-4 hover:underline" href="/forgot-password">
              Request another link
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-ink-200 bg-white p-6 shadow-[0_24px_70px_-56px_rgba(17,17,17,0.75)]">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink-700">New password</span>
              <AceternityInput
                autoComplete="new-password"
                autoFocus
                disabled={isSubmitting}
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                required
                type="password"
                value={password}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink-700">Confirm new password</span>
              <AceternityInput
                autoComplete="new-password"
                disabled={isSubmitting}
                minLength={8}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Type it again"
                required
                type="password"
                value={confirmPassword}
              />
            </label>

            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                {error}
              </p>
            )}

            <AceternityButton className="w-full" disabled={isSubmitting} size="md">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Updating password...' : 'Update password'}
            </AceternityButton>
          </form>
        )}
      </div>
    </main>
  );
}
