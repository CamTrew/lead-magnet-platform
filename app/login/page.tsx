'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState('Founder');
  const [email, setEmail] = useState('founder@example.com');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });

      if (!response.ok) {
        throw new Error('Unable to create session');
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-brand-teal-50 via-white to-brand-purple-50/30 px-4 py-10 text-brand-teal-900">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-brand-teal-200/70 bg-white shadow-2xl shadow-brand-teal-100/70 lg:grid-cols-[1fr_0.86fr]">
          <div className="flex flex-col justify-between bg-gradient-to-br from-brand-teal-800 via-brand-teal-700 to-brand-teal-900 p-8 text-white sm:p-12">
            <div>
              <p className="mb-16 text-sm font-bold uppercase tracking-[0.24em] text-brand-lime-300">
                Lead Magnet Platform
              </p>
              <h1 className="max-w-xl text-4xl font-extrabold leading-tight sm:text-5xl">
                Build branded lead magnet pages for every client, offer, and domain.
              </h1>
            </div>
            <div className="mt-16 grid gap-4 text-sm text-white/80 sm:grid-cols-3">
              <div className="border-t border-white/20 pt-4">Custom subdomains</div>
              <div className="border-t border-white/20 pt-4">Resend delivery</div>
              <div className="border-t border-white/20 pt-4">Beehiiv capture</div>
            </div>
          </div>

          <div className="p-8 sm:p-12">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-brand-teal-600">
              Neon Auth Stub
            </p>
            <h2 className="mb-8 text-3xl font-bold text-brand-teal-900">Sign in</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-brand-teal-800">Name</span>
                <Input value={name} onChange={(event) => setName(event.target.value)} className="h-12 rounded-xl border-2 border-brand-teal-200 px-4" required />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-brand-teal-800">Email</span>
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-12 rounded-xl border-2 border-brand-teal-200 px-4" required />
              </label>

              {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">{error}</p>}

              <Button className="h-12 w-full rounded-xl bg-gradient-to-r from-brand-teal-700 to-brand-teal-600 font-bold text-white shadow-lg shadow-brand-teal-700/30 hover:from-brand-teal-800 hover:to-brand-teal-700" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in...' : 'Continue'}
              </Button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}

