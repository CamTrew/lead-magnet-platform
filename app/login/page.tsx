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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-gray-900">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-950">Sign in</h1>
          <p className="mt-2 text-sm text-gray-500">
            Neon Auth is stubbed locally. Use any email to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Name</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-11 rounded-lg border-slate-300 px-3"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Email</span>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 rounded-lg border-slate-300 px-3"
              required
            />
          </label>

          {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-600">{error}</p>}

          <Button className="h-11 w-full rounded-lg bg-gray-950 font-semibold text-white hover:bg-gray-800" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Continue'}
          </Button>
        </form>
      </section>
    </main>
  );
}

