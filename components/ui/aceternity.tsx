'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

export function aceternityButtonClassName({
  className,
  size = 'md',
  variant = 'primary',
}: {
  className?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
} = {}) {
  return cn(
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border text-sm font-medium transition duration-150 ease-out touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&:not(:disabled)]:active:translate-y-px',
    variant === 'primary' &&
      'border-ink-950 bg-ink-950 text-white hover:border-brand-orange hover:bg-brand-orange hover:text-ink-950',
    variant === 'secondary' &&
      'border-ink-200 bg-white text-ink-900 hover:bg-ink-50',
    variant === 'danger' &&
      'border-ink-200 bg-white text-red-600 hover:bg-red-50 hover:border-red-200',
    variant === 'ghost' &&
      'border-transparent bg-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900',
    size === 'sm' && 'px-3 text-xs sm:min-h-8 sm:h-8',
    size === 'md' && 'px-3.5 sm:min-h-9 sm:h-9',
    size === 'lg' && 'min-h-12 px-5 text-base',
    className
  );
}

export const AceternityButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    size?: ButtonSize;
    variant?: ButtonVariant;
  }
>(({ className, size, variant, ...props }, ref) => (
  <button
    ref={ref}
    className={aceternityButtonClassName({ className, size, variant })}
    {...props}
  />
));
AceternityButton.displayName = 'AceternityButton';

export const AceternityInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<'input'>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'flex min-h-11 w-full rounded-md border border-ink-200 bg-white px-3 text-base text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-ink-950 focus:ring-1 focus:ring-ink-950 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9 sm:h-9 sm:text-sm',
      'focus:border-brand-orange focus:ring-brand-orange',
      className
    )}
    {...props}
  />
));
AceternityInput.displayName = 'AceternityInput';

export const AceternityTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'min-h-28 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-base leading-6 text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-ink-950 focus:ring-1 focus:ring-ink-950 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm',
      'focus:border-brand-orange focus:ring-brand-orange',
      className
    )}
    {...props}
  />
));
AceternityTextarea.displayName = 'AceternityTextarea';

export function AceternityCard({
  children,
  className,
  ...props
}: React.ComponentProps<'section'>) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-lg border border-ink-200 bg-white shadow-[0_1px_2px_rgba(17,17,17,0.025)]',
        className
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function Field({
  children,
  hint,
  label,
}: {
  children: React.ReactNode;
  hint?: string;
  label: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-700">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-5 text-ink-500">{hint}</span>}
    </label>
  );
}

export function StatusPill({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null;

  const label = state === 'saving' ? 'Saving' : state === 'saved' ? 'Saved' : 'Error';

  return (
    <span
      aria-live="polite"
      className={cn(
        'inline-flex h-7 items-center rounded-md border px-2 text-xs font-medium',
        state === 'error' && 'border-red-200 bg-red-50 text-red-700',
        state === 'saved' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
        state === 'saving' && 'border-ink-200 bg-ink-50 text-ink-700'
      )}
    >
      {label}
    </span>
  );
}
