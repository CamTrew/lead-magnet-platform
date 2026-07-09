'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { MagnetsLogoMark } from '@/components/magnets-logo-mark';
import { AceternityButton, AceternityInput } from '@/components/ui/aceternity';

type AuthMode = 'login' | 'register';

const copy = {
  login: {
    button: 'Sign in',
    description: 'Use your email and password to continue.',
    error: 'Unable to sign in',
    pending: 'Signing in...',
    switchHref: '/register',
    switchLabel: 'Create one',
    switchPrompt: 'New here?',
    title: 'Welcome back',
  },
  register: {
    button: 'Create account',
    description: 'Free forever. No credit card.',
    error: 'Unable to create account',
    pending: 'Creating account...',
    switchHref: '/login',
    switchLabel: 'Sign in',
    switchPrompt: 'Already have an account?',
    title: 'Create your account',
  },
};

function withLoginEntry(path: string) {
  const url = new URL(path, 'https://magnets.local');
  if (url.pathname === '/dashboard' && !url.searchParams.has('entry')) {
    url.searchParams.set('entry', 'login');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function AuthCard({
  mode,
  nextPath,
}: {
  mode: AuthMode;
  nextPath?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [error, setError] = useState('');
  const activeCopy = copy[mode];
  const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
  const isBusy = isSubmitting || isNavigating;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('The two passwords do not match.');
        return;
      }
      if (!name.trim()) {
        setError('Add your name so we know what to call you.');
        return;
      }
      if (!acceptedTerms) {
        setError('Please accept the Terms of Service to continue.');
        return;
      }
    }

    setIsSubmitting(true);
    setIsNavigating(false);

    try {
      const body = mode === 'register'
        ? { email, password, name: name.trim(), acceptedTerms: true }
        : { email, password };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || activeCopy.error);
      }

      setIsNavigating(true);
      window.dispatchEvent(new Event('magnets:navigation-start'));
      const destination = mode === 'login'
        ? withLoginEntry(nextPath || '/dashboard')
        : '/dashboard';
      router.push(destination);
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsSubmitting(false);
      setIsNavigating(false);
    }
  }

  return (
    <main className="brand-soft-bg relative flex min-h-screen items-center justify-center px-4 py-10 text-ink-900">
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4">
          <MagnetsLogoMark className="h-12 w-12" />
          <div className="text-center">
            <h1 className="text-2xl font-black text-ink-950">{activeCopy.title}</h1>
            <p className="mt-1.5 text-sm text-ink-600">{activeCopy.description}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-ink-200 bg-white p-6 shadow-[0_24px_70px_-56px_rgba(17,17,17,0.75)]">
          {mode === 'register' && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink-700">Name</span>
              <AceternityInput
                autoComplete="name"
                autoFocus
                disabled={isBusy}
                type="text"
                placeholder="What should we call you?"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                required
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-700">Email</span>
            <AceternityInput
              autoComplete="email"
              autoFocus={mode === 'login'}
              disabled={isBusy}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-700">Password</span>
            <AceternityInput
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              disabled={isBusy}
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
          </label>

          {mode === 'register' && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink-700">Confirm password</span>
              <AceternityInput
                autoComplete="new-password"
                disabled={isBusy}
                type="password"
                placeholder="Type it again"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>
          )}

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
              {error}
            </p>
          )}

          {mode === 'register' && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-ink-200 bg-ink-50 p-3 text-xs leading-5 text-ink-700">
              <input
                checked={acceptedTerms}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-ink-950 accent-ink-950"
                disabled={isBusy}
                onChange={(event) => setAcceptedTerms(event.target.checked)}
                required
                type="checkbox"
              />
              <span>
                I accept the{' '}
                <a className="font-medium text-ink-950 underline-offset-4 hover:underline" href="/terms" rel="noreferrer" target="_blank">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a className="font-medium text-ink-950 underline-offset-4 hover:underline" href="/privacy" rel="noreferrer" target="_blank">
                  Privacy Policy
                </a>
                . I understand my email will be added to the Magnets product newsletter, which I can unsubscribe from at any time.
              </span>
            </label>
          )}

          <AceternityButton
            className="w-full"
            disabled={isBusy || (mode === 'register' && !acceptedTerms)}
            size="md"
          >
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isNavigating ? 'Opening dashboard...' : isSubmitting ? activeCopy.pending : activeCopy.button}
          </AceternityButton>
        </form>

        <p className="mt-6 text-center text-sm text-ink-600">
          {activeCopy.switchPrompt}{' '}
          <Link className="font-medium text-ink-900 underline-offset-4 hover:underline" href={activeCopy.switchHref}>
            {activeCopy.switchLabel}
          </Link>
        </p>
      </div>
    </main>
  );
}
