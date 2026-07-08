import { Loader2 } from 'lucide-react';

export function PageLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-soft px-4 text-ink-900">
      <Loader2 className="h-6 w-6 animate-spin text-brand-orange" aria-label="Loading" />
    </main>
  );
}
