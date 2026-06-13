import { Magnet } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MagnetsLogoMark({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md bg-ink-950 text-white',
        className
      )}
    >
      <Magnet className={cn('h-5 w-5 -rotate-12', iconClassName)} strokeWidth={2.4} />
    </div>
  );
}
