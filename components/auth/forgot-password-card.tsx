'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { AuthSurface } from './auth-surface';
import styles from './auth-scene.module.css';
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
    <AuthSurface>
      <div className={styles.recovery}>
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="text-center">
            <h1 className="text-3xl font-semibold text-ink-950">Reset your password</h1>
            <p className="mt-1.5 text-sm text-ink-600">We will email you a link to choose a new one.</p>
          </div>
        </div>

        {sent ? (
          <div className={styles.recoveryNotice} role="status">
            <p className="text-sm leading-6 text-ink-700">
              Check your inbox. If an account exists for that email, you will receive a password reset link shortly.
            </p>
            <Link className="mt-5 inline-block text-sm font-medium text-ink-950 underline-offset-4 hover:underline" href="/login">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Email</span>
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
              <p role="alert" className={styles.verificationError}>
                {error}
              </p>
            )}

            <AceternityButton className={styles.verificationSubmit} disabled={isSubmitting} size="md">
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
    </AuthSurface>
  );
}
