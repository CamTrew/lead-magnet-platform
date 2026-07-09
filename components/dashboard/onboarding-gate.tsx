'use client';

import { type ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Image as ImageIcon, Loader2, Trash2 } from 'lucide-react';
import {
  AceternityButton,
  AceternityInput,
  Field,
} from '@/components/ui/aceternity';
import { MagnetsLogoMark } from '@/components/magnets-logo-mark';

const BUSINESS_TYPES = [
  'Solo creator',
  'Newsletter',
  'Small business',
  'SaaS product',
  'Agency',
  'Consultancy',
  'Coach',
  'Other',
] as const;
const MAGNET_TYPES = [
  'Guide / ebook',
  'Checklist',
  'Template',
  'Webinar replay',
  'Course preview',
  'Discount code',
  'Audit / scorecard',
  'Other',
] as const;
const CADENCES = ['Weekly', 'Bi-weekly', 'Monthly', 'Quarterly', 'Ad-hoc'] as const;

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function OnboardingGate({ userName }: { userName: string }) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [magnetType, setMagnetType] = useState('');
  const [cadence, setCadence] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hasBrandIdentity = Boolean(logoUrl || businessName.trim());

  // Prevent body scroll while the modal is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const valid =
    hasBrandIdentity &&
    BUSINESS_TYPES.includes(businessType as (typeof BUSINESS_TYPES)[number]) &&
    MAGNET_TYPES.includes(magnetType as (typeof MAGNET_TYPES)[number]) &&
    CADENCES.includes(cadence as (typeof CADENCES)[number]);

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

    setError('');
    setLogoUrl(await readFileAsDataUrl(file));
    event.target.value = '';
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: businessName.trim(),
          logoUrl,
          businessType,
          magnetType,
          cadence,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || 'Could not save your answers.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <div
      aria-labelledby="onboarding-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/40 p-4 backdrop-blur-md"
      role="dialog"
    >
      <div className="vercel-grid-bg pointer-events-none absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
      <form
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.45)]"
        onSubmit={submit}
      >
        <div className="border-b border-ink-200 bg-ink-50 px-6 py-5">
          <div className="flex items-center gap-3">
            <MagnetsLogoMark className="h-9 w-9" />
            <div>
              <p className="text-xs font-medium uppercase text-ink-500">Welcome</p>
              <h2 id="onboarding-title" className="text-lg font-semibold text-ink-950">
                {userName ? `Nice to meet you, ${userName.split(' ')[0]}.` : 'Welcome to Magnets.'}
              </h2>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-ink-600">
            Add your brand basics before we open the dashboard. Use a logo, a business name, or both.
          </p>
        </div>

        <div className="grid gap-4 px-6 py-6">
          <Field label="Business name">
            <AceternityInput
              autoFocus
              disabled={busy}
              maxLength={80}
              onChange={(event) => setBusinessName(event.target.value)}
              placeholder="Required unless your logo stands alone"
              value={businessName}
            />
          </Field>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-ink-700">Logo image</span>
            <div className="flex items-center gap-3 rounded-lg border border-ink-200 bg-ink-50 p-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ink-200 bg-white text-ink-500">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" className="h-full w-full object-contain p-1.5" src={logoUrl} />
                ) : (
                  <ImageIcon className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                {logoUrl && businessName.trim() ? (
                  <p className="mb-2 truncate text-sm font-semibold text-ink-950">{businessName.trim()}</p>
                ) : logoUrl ? (
                  <p className="mb-2 text-sm font-medium text-ink-700">Logo uploaded</p>
                ) : (
                  <p className="mb-2 text-sm font-medium text-ink-700">PNG, JPG, WebP, or GIF. 1 MB max.</p>
                )}
                <AceternityInput
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink-900"
                  disabled={busy}
                  onChange={handleLogoFile}
                  type="file"
                />
              </div>
              {logoUrl && (
                <button
                  aria-label="Remove logo"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                  disabled={busy}
                  onClick={() => setLogoUrl('')}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <Field label="What kind of business is it?">
            <OnboardingSelect
              disabled={busy}
              onChange={setBusinessType}
              options={BUSINESS_TYPES}
              placeholder="Pick a category"
              value={businessType}
            />
          </Field>

          <Field label="What kind of lead magnet do you usually give away?">
            <OnboardingSelect
              disabled={busy}
              onChange={setMagnetType}
              options={MAGNET_TYPES}
              placeholder="Pick a magnet type"
              value={magnetType}
            />
          </Field>

          <Field label="How often do you ship a new one?">
            <OnboardingSelect
              disabled={busy}
              onChange={setCadence}
              options={CADENCES}
              placeholder="Pick a cadence"
              value={cadence}
            />
          </Field>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-ink-200 bg-white px-6 py-4">
          <p className="text-xs text-ink-500">Business name or logo required. Takes 15 seconds.</p>
          <AceternityButton disabled={!valid || busy} type="submit">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Continue
          </AceternityButton>
        </div>
      </form>
    </div>
  );
}

function OnboardingSelect({
  disabled,
  onChange,
  options,
  placeholder,
  value,
}: {
  disabled?: boolean;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder: string;
  value: string;
}) {
  return (
    <select
      className="h-9 w-full rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900 outline-none focus:border-ink-950 focus:ring-1 focus:ring-ink-950 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      required
      value={value}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
