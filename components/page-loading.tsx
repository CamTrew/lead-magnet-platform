import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PageLoading({ fullPage = false }: { fullPage?: boolean }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className={cn(
        'flex items-center justify-center bg-brand-soft px-4 text-ink-900',
        fullPage ? 'min-h-screen' : 'min-h-[18rem]'
      )}
      role="status"
    >
      <Loader2 className="h-5 w-5 animate-spin text-brand-orange" aria-hidden="true" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
