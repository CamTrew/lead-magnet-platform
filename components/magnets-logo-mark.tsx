import Image from 'next/image';
import { cn } from '@/lib/utils';

export function MagnetsLogoMark({
  className,
  iconClassName,
  tile = false,
}: {
  className?: string;
  iconClassName?: string;
  tile?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        tile && 'overflow-hidden rounded-[22%] bg-ink-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]',
        className
      )}
    >
      <Image
        alt=""
        aria-hidden="true"
        className={cn('object-contain', tile && 'p-[14%]', iconClassName)}
        fill
        sizes="100px"
        src="/brand/magnets-mark.png"
      />
    </span>
  );
}

export function MagnetsLogo({
  className,
  markClassName,
  textClassName,
  variant = 'dark',
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  variant?: 'dark' | 'light';
}) {
  return (
    <span
      className={cn(
        'relative inline-flex h-9 w-[9.45rem] shrink-0 items-center',
        markClassName,
        textClassName,
        className
      )}
    >
      <Image
        alt="Magnets"
        className="object-contain object-left"
        fill
        priority
        sizes="160px"
        src={variant === 'light' ? '/brand/magnets-logo-light.png' : '/brand/magnets-logo-dark.png'}
      />
    </span>
  );
}
