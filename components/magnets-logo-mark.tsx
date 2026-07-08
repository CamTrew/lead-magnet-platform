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
        tile && 'rounded-[22%] bg-ink-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]',
        className
      )}
    >
      <svg
        className={cn(tile ? 'h-[72%] w-[72%]' : 'h-full w-full', iconClassName)}
        fill="none"
        viewBox="0 0 72 72"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="magnets-mark-gradient" x1="10" x2="54" y1="56" y2="14" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FDC957" />
            <stop offset="0.48" stopColor="#FE6F34" />
            <stop offset="1" stopColor="#FE504F" />
          </linearGradient>
        </defs>
        <path
          d="M47.8 9.7a6.25 6.25 0 0 1 5 11.43L29.75 31.47c-5.44 2.44-7.88 8.83-5.44 14.27 2.44 5.45 8.83 7.89 14.27 5.44l9.86-4.42a6.25 6.25 0 1 1 5.12 11.4l-9.86 4.43C31.94 67.87 18.13 62.6 12.84 50.84 7.56 39.08 12.82 25.27 24.59 19.99L47.8 9.7Z"
          fill="url(#magnets-mark-gradient)"
        />
        <path
          d="M42.84 29.61a6.25 6.25 0 0 1 5.12 11.4l-13.8 6.2a6.25 6.25 0 1 1-5.12-11.41l13.8-6.19Z"
          fill="url(#magnets-mark-gradient)"
        />
        <circle cx="49.5" cy="30.2" fill="#FE504F" r="6.5" />
        <circle cx="53.2" cy="16.6" fill="#7FD4DD" r="4.2" />
      </svg>
    </span>
  );
}

export function MagnetsLogo({
  className,
  markClassName,
  textClassName,
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <MagnetsLogoMark className={cn('h-9 w-9', markClassName)} />
      <span className={cn('text-[1.35rem] font-black leading-none text-ink-950', textClassName)}>
        magnets
      </span>
    </span>
  );
}
