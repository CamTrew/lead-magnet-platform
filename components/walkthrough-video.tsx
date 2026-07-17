'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ExternalLink, PlayCircle, X } from 'lucide-react';
import {
  PLATFORM_WALKTHROUGH_EMBED_URL,
  PLATFORM_WALKTHROUGH_URL,
} from '@/lib/walkthrough';
import { cn } from '@/lib/utils';

export function WalkthroughVideo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative aspect-video w-full overflow-hidden rounded-md bg-ink-950',
        className
      )}
    >
      <iframe
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
        loading="lazy"
        src={PLATFORM_WALKTHROUGH_EMBED_URL}
        title="Magnets platform walkthrough"
      />
    </div>
  );
}

export function WalkthroughModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [onClose, open]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
        >
          <motion.button
            aria-label="Close platform walkthrough"
            className="absolute inset-0 cursor-default bg-ink-950/65 backdrop-blur-sm"
            onClick={onClose}
            type="button"
          />

          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-labelledby={titleId}
            aria-modal="true"
            className="relative z-10 w-full max-w-5xl overflow-hidden rounded-xl border border-ink-200 bg-white shadow-[0_32px_100px_-24px_rgba(0,0,0,0.55)]"
            exit={{ opacity: 0, scale: 0.97, y: 16 }}
            initial={{ opacity: 0, scale: 0.96, y: 22 }}
            role="dialog"
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center justify-between gap-4 border-b border-ink-200 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-orange text-ink-950">
                  <PlayCircle className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-ink-950 sm:text-base" id={titleId}>
                    Magnets platform walkthrough
                  </h2>
                  <p className="hidden text-xs text-ink-500 sm:block">
                    See how to set up, publish, and grow with a lead magnet.
                  </p>
                </div>
              </div>
              <button
                aria-label="Close platform walkthrough"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-500 transition hover:bg-ink-100 hover:text-ink-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                onClick={onClose}
                ref={closeButtonRef}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <WalkthroughVideo className="rounded-none" />

            <div className="flex items-center justify-between gap-3 border-t border-ink-200 px-4 py-3 sm:px-5">
              <p className="text-xs text-ink-500">Press Esc to close</p>
              <a
                className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-700 transition hover:text-ink-950"
                href={PLATFORM_WALKTHROUGH_URL}
                rel="noreferrer"
                target="_blank"
              >
                Open in Loom
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
