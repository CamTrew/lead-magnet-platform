'use client';

import { type ChangeEvent, useState } from 'react';
import { Check, Loader2, Palette, Trash2, X } from 'lucide-react';
import { AceternityButton, AceternityInput } from '@/components/ui/aceternity';
import type { AccountSettings } from '@/lib/types';

/**
 * In-place brand editor. Opens from the lead-magnet editor toolbar so the
 * user can tweak logo + colours and see them ripple through the current
 * preview without having to bounce back to Configure → Brand.
 *
 * Saves to PUT /api/account with the existing payload shape so the server
 * happily ignores the unchanged fields. The parent passes us a fresh
 * snapshot in `account` and an `onSaved` callback that swaps in the
 * authoritative server response.
 */
export function BrandModal({
  account,
  onClose,
  onSaved,
}: {
  account: AccountSettings;
  onClose: () => void;
  onSaved: (next: AccountSettings) => void;
}) {
  const [draft, setDraft] = useState<AccountSettings>(account);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function patch(updates: Partial<AccountSettings>) {
    setError('');
    setDraft((current) => ({ ...current, ...updates }));
  }
  function patchBrand(updates: Partial<AccountSettings['brand']>) {
    setError('');
    setDraft((current) => ({ ...current, brand: { ...current.brand, ...updates } }));
  }

  async function handleLogoFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      setError('Logo must be a PNG, JPG, WebP, or GIF (no SVG).');
      event.target.value = '';
      return;
    }
    if (file.size > 1_000_000) {
      setError('Logo must be 1 MB or smaller.');
      event.target.value = '';
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    patch({ logoUrl: dataUrl });
    event.target.value = '';
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subdomain: draft.subdomain,
          domain: draft.domain,
          logoUrl: draft.logoUrl,
          logoText: draft.logoText,
          brand: draft.brand,
          resendFromEmail: draft.resendFromEmail,
          resendApiKey: draft.resendApiKey,
          resendReturnPath: draft.resendReturnPath,
          beehiivApiKey: draft.beehiivApiKey,
          beehiivPublicationId: draft.beehiivPublicationId,
          substackPublication: draft.substackPublication,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || 'Could not save brand.');
      }
      const data = (await response.json()) as { account: AccountSettings };
      onSaved(data.account);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSaving(false);
    }
  }

  const brandLabel = draft.logoText.trim() || 'Your Brand';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/40 p-4 backdrop-blur-sm">
      <button
        aria-label="Close"
        className="absolute inset-0"
        disabled={saving}
        onClick={onClose}
        type="button"
      />
      <div
        aria-modal="true"
        className="relative z-10 grid w-full max-w-3xl gap-0 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-xl sm:grid-cols-[1fr_280px]"
        role="dialog"
      >
        <div className="border-b border-ink-200 sm:border-b-0 sm:border-r">
          <div className="flex items-center justify-between gap-3 border-b border-ink-200 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md border border-ink-200 bg-ink-50 text-ink-900">
                <Palette className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-ink-950">Brand</h2>
                <p className="text-xs text-ink-500">Applies to every magnet on this account.</p>
              </div>
            </div>
            <button
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-md text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 disabled:opacity-50"
              disabled={saving}
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 px-5 py-5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink-700">Logo text</span>
              <AceternityInput
                disabled={saving}
                maxLength={80}
                onChange={(event) => patch({ logoText: event.target.value })}
                placeholder="Your brand name"
                value={draft.logoText}
              />
            </label>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-ink-700">Logo image</span>
              <div className="flex items-center gap-3">
                <AceternityInput
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink-900"
                  disabled={saving}
                  onChange={handleLogoFile}
                  type="file"
                />
                {draft.logoUrl && (
                  <button
                    aria-label="Remove logo"
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-xs font-medium text-ink-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                    onClick={() => patch({ logoUrl: '' })}
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-xs text-ink-500">PNG, JPG, WebP, or GIF. 1 MB max.</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <ColorField
                label="Primary"
                onChange={(value) => patchBrand({ primary: value })}
                value={draft.brand.primary}
              />
              <ColorField
                label="Accent"
                onChange={(value) => patchBrand({ accent: value })}
                value={draft.brand.accent}
              />
              <ColorField
                label="Success"
                onChange={(value) => patchBrand({ success: value })}
                value={draft.brand.success}
              />
            </div>

            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-ink-200 px-5 py-3">
            <AceternityButton disabled={saving} onClick={onClose} type="button" variant="secondary">
              Cancel
            </AceternityButton>
            <AceternityButton disabled={saving} onClick={save} type="button">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? 'Saving' : 'Save brand'}
            </AceternityButton>
          </div>
        </div>

        <div className="bg-ink-50 px-5 py-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Preview</p>
          <div className="mt-3 overflow-hidden rounded-lg border border-ink-200 bg-white">
            <div
              className="flex items-center gap-2 border-b border-ink-200 px-4 py-3"
              style={{ background: alpha(draft.brand.primary, 0.06) }}
            >
              {draft.logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img alt={brandLabel} src={draft.logoUrl} className="h-7 max-w-[140px] object-contain" />
              ) : (
                <span className="text-sm font-semibold" style={{ color: draft.brand.primary }}>
                  {brandLabel}
                </span>
              )}
            </div>
            <div className="space-y-3 px-4 py-4">
              <p className="text-sm font-semibold text-ink-950">Sample heading</p>
              <p className="text-xs leading-5 text-ink-600">
                This is what the brand looks like on your magnets and in the email.
              </p>
              <div
                className="inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-semibold text-white"
                style={{ background: draft.brand.primary }}
              >
                Call to action
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-ink-500">
            Changes apply to every magnet once you save.
          </p>
        </div>
      </div>
    </div>
  );
}

function ColorField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#111111';
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-700">{label}</span>
      <div className="flex h-9 items-stretch overflow-hidden rounded-md border border-ink-200 bg-white focus-within:border-ink-950 focus-within:ring-1 focus-within:ring-ink-950">
        <input
          aria-label={`${label} picker`}
          className="h-full w-10 cursor-pointer border-0 bg-transparent p-1"
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={safe}
        />
        <input
          aria-label={`${label} hex value`}
          className="min-w-0 flex-1 bg-transparent px-2 text-sm text-ink-900 outline-none"
          maxLength={7}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          value={value}
        />
      </div>
    </label>
  );
}

function alpha(hex: string, opacity: number) {
  const clean = hex.replace('#', '');
  const value =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => `${c}${c}`)
          .join('')
      : clean;
  if (value.length !== 6) return hex;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return hex;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
