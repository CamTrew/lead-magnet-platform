'use client';

import { type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { AceternityButton } from '@/components/ui/aceternity';
import { useModalAccessibility } from '@/components/ui/use-modal-accessibility';

/**
 * Reusable "are you sure?" modal. Use this everywhere instead of
 * window.confirm() so we get consistent styling and the action button can
 * show a pending state.
 */
export function ConfirmDialog({
  cancelLabel = 'Cancel',
  confirmLabel,
  confirmTone = 'danger',
  description,
  onCancel,
  onConfirm,
  pending,
  title,
}: {
  cancelLabel?: string;
  confirmLabel: string;
  confirmTone?: 'danger' | 'primary';
  description: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  pending?: boolean;
  title: string;
}) {
  useModalAccessibility(onCancel, Boolean(pending));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/40 p-4 backdrop-blur-sm">
      <button
        aria-label="Close"
        className="absolute inset-0"
        disabled={pending}
        onClick={onCancel}
        type="button"
      />
      <div
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded-lg border border-ink-200 bg-white shadow-xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <span
              className={
                confirmTone === 'danger'
                  ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700'
                  : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700'
              }
            >
              <AlertTriangle className="h-4 w-4" />
            </span>
            <h2 className="text-base font-semibold text-ink-950">{title}</h2>
          </div>
          <button
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 disabled:pointer-events-none disabled:opacity-50"
            disabled={pending}
            onClick={onCancel}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 text-sm leading-6 text-ink-700">{description}</div>
        <div className="flex justify-end gap-2 border-t border-ink-200 px-5 py-3">
          <AceternityButton disabled={pending} onClick={onCancel} type="button" variant="secondary">
            {cancelLabel}
          </AceternityButton>
          <AceternityButton
            disabled={pending}
            onClick={onConfirm}
            type="button"
            variant={confirmTone === 'danger' ? 'danger' : 'primary'}
          >
            {confirmLabel}
          </AceternityButton>
        </div>
      </div>
    </div>
  );
}
