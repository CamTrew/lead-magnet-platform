'use client';

import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, MailCheck } from 'lucide-react';
import { MagnetsLogoMark } from '@/components/magnets-logo-mark';
import { AceternityButton, AceternityInput } from '@/components/ui/aceternity';

export function VerifyEmailPendingCard({ initialEmail = '' }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/auth/email-verification/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      if (!response.ok) throw new Error(data?.error || 'Could not resend the verification email.');
      setMessage(data?.message || 'A new verification link has been sent.');
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : 'Could not resend the verification email.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthSurface>
      <MailCheck className="mx-auto h-10 w-10 text-brand-orange" />
      <h1 className="mt-5 text-center text-2xl font-semibold text-ink-950">Check your inbox</h1>
      <p className="mt-2 text-center text-sm leading-6 text-ink-600">
        We sent a verification link{initialEmail ? <> to <strong className="font-medium text-ink-900">{initialEmail}</strong></> : ''}.
        Open it to finish creating your account.
      </p>

      <form className="mt-6 space-y-3" onSubmit={resend}>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-ink-700">Need another link?</span>
          <AceternityInput
            autoComplete="email"
            disabled={busy}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />
        </label>
        {message && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">{message}</p>}
        {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">{error}</p>}
        <AceternityButton className="w-full" disabled={busy} size="md" variant="secondary">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? 'Sending...' : 'Resend verification email'}
        </AceternityButton>
      </form>
      <p className="mt-5 text-center text-xs leading-5 text-ink-500">
        Already verified?{' '}
        <Link className="font-medium text-ink-800 underline-offset-4 hover:underline" href="/login">Sign in</Link>
      </p>
    </AuthSurface>
  );
}

export function VerifyEmailConfirmCard({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/email-verification/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || 'Could not verify this email.');
      window.dispatchEvent(new Event('magnets:navigation-start'));
      window.location.assign('/dashboard/pages?verified=1');
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Could not verify this email.');
      setBusy(false);
    }
  }

  return (
    <AuthSurface>
      <CheckCircle2 className="mx-auto h-10 w-10 text-brand-orange" />
      <h1 className="mt-5 text-center text-2xl font-semibold text-ink-950">Confirm your email</h1>
      <p className="mt-2 text-center text-sm leading-6 text-ink-600">
        One last step. Confirm this address to activate your Magnets account.
      </p>
      {error && <p className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">{error}</p>}
      <AceternityButton className="mt-6 w-full" disabled={busy || !token} onClick={confirm} size="md">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? 'Verifying...' : 'Verify email address'}
      </AceternityButton>
      {!token && (
        <p className="mt-4 text-center text-xs text-red-700">
          This link is incomplete. Request a new verification email.
        </p>
      )}
      <p className="mt-5 text-center text-xs leading-5 text-ink-500">
        <Link className="font-medium text-ink-800 underline-offset-4 hover:underline" href="/verify-email">Request a new link</Link>
      </p>
    </AuthSurface>
  );
}

function AuthSurface({ children }: { children: ReactNode }) {
  return (
    <main className="brand-soft-bg relative flex min-h-screen items-center justify-center px-4 py-10 text-ink-900">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex justify-center"><MagnetsLogoMark className="h-12 w-12" /></div>
        <div className="rounded-xl border border-ink-200 bg-white p-6 shadow-[0_24px_70px_-56px_rgba(17,17,17,0.75)]">
          {children}
        </div>
      </div>
    </main>
  );
}
