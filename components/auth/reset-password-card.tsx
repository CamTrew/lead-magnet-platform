'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { AuthSurface } from './auth-surface';
import styles from './auth-scene.module.css';
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
    <AuthSurface>
      <div className={styles.recovery}>
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="text-center">
            <h1 className="text-3xl font-semibold text-ink-950">Choose a new password</h1>
            <p className="mt-1.5 text-sm text-ink-600">This will sign you out on your other devices.</p>
          </div>
        </div>

        {complete ? (
          <div className={styles.recoveryNotice} role="status">
            <p className="text-sm leading-6 text-ink-700">Your password has been updated. You can now sign in.</p>
            <Link className="mt-5 inline-block text-sm font-medium text-ink-950 underline-offset-4 hover:underline" href="/login">
              Go to sign in
            </Link>
          </div>
        ) : invalidToken ? (
          <div className={styles.recoveryNotice} role="status">
            <p className="text-sm leading-6 text-ink-700">This reset link is invalid or has expired.</p>
            <Link className="mt-5 inline-block text-sm font-medium text-ink-950 underline-offset-4 hover:underline" href="/forgot-password">
              Request another link
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">New password</span>
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
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Confirm new password</span>
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
              <p role="alert" className={styles.verificationError}>
                {error}
              </p>
            )}

            <AceternityButton className={styles.verificationSubmit} disabled={isSubmitting} size="md">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Updating password...' : 'Update password'}
            </AceternityButton>
          </form>
        )}
      </div>
    </AuthSurface>
  );
}
