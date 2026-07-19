'use client';

import { type ReactNode, useState } from 'react';
import { AlertTriangle, Lock, Pencil, X } from 'lucide-react';
import { AceternityButton } from '@/components/ui/aceternity';
import { useModalAccessibility } from '@/components/ui/use-modal-accessibility';

/**
 * A value that's been "committed" and shouldn't be changed casually.
 *
 * Renders three states:
 *   1. Empty (no value committed yet) → renders `children` for the editor.
 *   2. Locked (value present, lockedExternally false) → shows displayValue +
 *      Edit button. Click Edit → opens confirm modal. Confirm → calls
 *      onConfirmEdit. Caller flips lockedExternally false and renders children.
 *   3. Force-locked (locked === true) → no Edit button visible at all.
 *
 * The confirm modal is intentionally pretty plain. It's a "are you sure?"
 * speed bump, not a wall.
 */
export function LockedField({
  children,
  confirmDescription,
  confirmTitle,
  displayValue,
  locked,
  onConfirmEdit,
}: {
  children: ReactNode;
  confirmDescription: ReactNode;
  confirmTitle: string;
  displayValue: ReactNode;
  locked: boolean;
  onConfirmEdit: () => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);

  if (!locked) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="flex items-center gap-2 rounded-md border border-ink-200 bg-ink-50 px-3 py-2">
        <Lock className="h-3.5 w-3.5 shrink-0 text-ink-500" />
        <div className="min-w-0 flex-1 truncate text-sm text-ink-900">{displayValue}</div>
        <button
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2 text-xs font-medium text-ink-700 transition hover:bg-ink-50"
          onClick={() => setShowConfirm(true)}
          type="button"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
      </div>
      {showConfirm && (
        <ConfirmEditModal
          description={confirmDescription}
          onCancel={() => setShowConfirm(false)}
          onConfirm={() => {
            setShowConfirm(false);
            onConfirmEdit();
          }}
          title={confirmTitle}
        />
      )}
    </>
  );
}

function ConfirmEditModal({
  description,
  onCancel,
  onConfirm,
  title,
}: {
  description: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  useModalAccessibility(onCancel);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/40 p-4 backdrop-blur-sm">
      <button aria-label="Close" className="absolute inset-0" onClick={onCancel} type="button" />
      <div
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded-lg border border-ink-200 bg-white shadow-xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-ink-950">{title}</h2>
            </div>
          </div>
          <button
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
            onClick={onCancel}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 text-sm leading-6 text-ink-700">{description}</div>
        <div className="flex justify-end gap-2 border-t border-ink-200 px-5 py-3">
          <AceternityButton onClick={onCancel} type="button" variant="secondary">
            Keep it as is
          </AceternityButton>
          <AceternityButton onClick={onConfirm} type="button" variant="danger">
            Edit anyway
          </AceternityButton>
        </div>
      </div>
    </div>
  );
}
