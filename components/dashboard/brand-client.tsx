'use client';

import { type ChangeEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Palette, Trash2, Upload } from 'lucide-react';
import { AceternityButton, AceternityCard, AceternityInput } from '@/components/ui/aceternity';
import { PageHeader } from '@/components/dashboard/app-shell';
import type { AccountSettings, DashboardPayload, LeadMagnet } from '@/lib/types';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function sampleMagnet(accountId: string): LeadMagnet {
  const now = new Date().toISOString();

  return {
    id: 'brand-preview',
    accountId,
    slug: 'preview',
    title: '101 Winning Viral Templates That Get Results',
    subtitle: 'Stop staring at a blank page. Start creating content that actually connects.',
    description:
      "You know what works on LinkedIn. You've seen the posts that blow up.\n\nThat's where these templates come in. Real structures pulled from posts that actually performed.",
    bullets: [
      '101 fill-in-the-blank templates for every content scenario',
      'Proven structures for storytelling, advice, and transformation posts',
      'Ready-to-use formats that let you focus on your message',
    ],
    bulletsHeading: 'This playbook breaks down:',
    ctaText: 'Get the templates',
    formHeading: 'Download for free now',
    formSubtext: 'By opting in you consent to receive this resource by email.',
    imageUrl: '',
    downloadLink: 'https://example.com/resource.pdf',
    emailSubject: '',
    emailBody: '',
    emailPreview: '',
    published: false,
    createdAt: now,
    updatedAt: now,
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function BrandClient({ initialData }: { initialData: DashboardPayload }) {
  const router = useRouter();
  const [draft, setDraft] = useState<AccountSettings>(initialData.account);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewMagnet = initialData.leadMagnets[0] ?? sampleMagnet(initialData.account.id);
  const saving = saveState === 'saving';

  function patch(updates: Partial<AccountSettings>) {
    setError('');
    setSaveState('idle');
    setDraft((current) => ({ ...current, ...updates }));
  }

  function patchBrand(updates: Partial<AccountSettings['brand']>) {
    setError('');
    setSaveState('idle');
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

    patch({ logoUrl: await readFileAsDataUrl(file) });
    event.target.value = '';
  }

  async function save() {
    if (saving) return;
    if (!draft.logoText.trim()) {
      setError('Enter your business name.');
      return;
    }
    if (!draft.logoUrl) {
      setError('Upload your logo.');
      return;
    }

    setSaveState('saving');
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
      setDraft(data.account);
      setSaveState('saved');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSaveState('error');
    }
  }

  return (
    <>
      <PageHeader title="Brand" subtitle="Logo, business name, and colors for every magnet" />

      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        <AceternityCard className="p-5">
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-900 shadow-sm">
                <Palette className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-black text-ink-950">Brand settings</h2>
                <p className="mt-1 text-sm leading-6 text-ink-600">
                  These apply to every live page and preview on this account.
                </p>
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink-700">Business name</span>
              <AceternityInput
                disabled={saving}
                maxLength={80}
                onChange={(event) => patch({ logoText: event.target.value })}
                placeholder="Your business name"
                required
                value={draft.logoText}
              />
            </label>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-ink-700">Logo image</span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  disabled={saving}
                  onChange={handleLogoFile}
                  ref={fileInputRef}
                  type="file"
                />
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-ink-200 bg-white px-3 text-sm font-medium text-ink-900 transition hover:bg-ink-50 disabled:pointer-events-none disabled:opacity-50"
                  disabled={saving}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <Upload className="h-4 w-4" />
                  {draft.logoUrl ? 'Replace logo' : 'Choose logo'}
                </button>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-500">
                  {draft.logoUrl ? 'Logo uploaded' : 'No logo uploaded'}
                </span>
                {draft.logoUrl && (
                  <button
                    aria-label="Remove logo"
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-xs font-medium text-ink-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                    disabled={saving}
                    onClick={() => patch({ logoUrl: '' })}
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs leading-5 text-ink-500">Required. PNG, JPG, WebP, or GIF. 1 MB max.</p>
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

            <div className="flex items-center justify-between gap-3 border-t border-ink-200 pt-4">
              <SaveStatus state={saveState} />
              <AceternityButton disabled={saving || !draft.logoText.trim() || !draft.logoUrl} onClick={save} type="button">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {saving ? 'Saving' : 'Save brand'}
              </AceternityButton>
            </div>
          </div>
        </AceternityCard>

        <AceternityCard className="p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-ink-950">Preview</h2>
              <p className="mt-1 text-sm text-ink-600">How your brand appears on a full magnet page.</p>
            </div>
          </div>
          <BrandPagePreview account={draft} magnet={previewMagnet} />
        </AceternityCard>
      </div>
    </>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  if (state === 'idle') return <span className="text-xs text-ink-500">Unsaved changes stay local until saved.</span>;
  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saving...
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
        <Check className="h-3.5 w-3.5" />
        Saved
      </span>
    );
  }
  return <span className="text-xs text-red-700">Could not save</span>;
}

function BrandPagePreview({
  account,
  magnet,
}: {
  account: AccountSettings;
  magnet: LeadMagnet;
}) {
  const businessName = account.logoText.trim() || 'Your business';
  const subtitle = magnet.subtitle.trim();
  const description = magnet.description
    .split('\n\n')
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const bullets = magnet.bullets.filter(Boolean);

  return (
    <div
      className="overflow-hidden rounded-lg border border-ink-200 bg-white text-ink-950"
      style={{
        backgroundImage: [
          'linear-gradient(180deg, #ffffff 0%, #f8fbff 44%, #ffffff 100%)',
          'linear-gradient(to right, rgb(15 23 42 / 0.035) 1px, transparent 1px)',
          'linear-gradient(to bottom, rgb(15 23 42 / 0.035) 1px, transparent 1px)',
        ].join(', '),
        backgroundSize: 'auto, 40px 40px, 40px 40px',
      }}
    >
      <div className="flex items-center justify-center gap-2 px-4 py-6">
        {account.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" src={account.logoUrl} className="h-10 w-auto max-w-[86px] object-contain" />
        ) : (
          <span className="h-10 w-10 rounded-lg border border-dashed border-ink-300 bg-white" />
        )}
        <span className="truncate text-3xl font-black leading-none text-ink-950">{businessName}</span>
      </div>

      <div className="px-5 pb-6">
        <div className="rounded-2xl border border-ink-200/80 bg-white/95 p-5 shadow-[0_24px_70px_-54px_rgba(15,23,42,0.72)]">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
            <section className="min-w-0">
              <h3 className="break-words text-3xl font-black leading-tight text-ink-950">
                {magnet.title || 'Your lead magnet title'}
              </h3>
              {subtitle && (
                <p className="mt-3 text-sm font-medium leading-6 text-ink-600">
                  {subtitle}
                </p>
              )}

              {description.length > 0 && (
                <div className="mt-5 space-y-2 text-[13px] leading-6 text-ink-600">
                  {description.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              )}

              {bullets.length > 0 && (
                <div className="mt-5">
                  {magnet.bulletsHeading && (
                    <p className="mb-3 text-[13px] font-semibold text-ink-800">{magnet.bulletsHeading}</p>
                  )}
                  <ul className="space-y-2">
                    {bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2 text-[13px] leading-5 text-ink-700">
                        <span
                          aria-hidden
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white"
                          style={{ background: account.brand.primary }}
                        >
                          <svg viewBox="0 0 12 12" className="h-3 w-3">
                            <path
                              d="M2.5 6.2l2.4 2.4 4.6-5"
                              fill="none"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2.2"
                            />
                          </svg>
                        </span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <aside className="space-y-3">
              {magnet.imageUrl ? (
                <div className="overflow-hidden rounded-xl border border-ink-200 bg-ink-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="" src={magnet.imageUrl} className="aspect-[16/10] w-full object-cover" />
                </div>
              ) : (
                <div className="aspect-[16/10] rounded-xl border border-dashed border-ink-300 bg-ink-50" />
              )}

              <div
                className="rounded-xl border bg-white p-4"
                style={{
                  borderColor: alpha(account.brand.primary, 0.18),
                  backgroundImage: `linear-gradient(180deg, #ffffff 0%, ${alpha(account.brand.primary, 0.04)} 100%)`,
                  boxShadow: `0 18px 42px -28px ${alpha(account.brand.primary, 0.5)}`,
                }}
              >
                <p className="text-center text-lg font-black leading-tight text-ink-950">
                  {magnet.formHeading || 'Download for free'}
                </p>
                {magnet.formSubtext && (
                  <p className="mt-1 text-center text-[11px] leading-4 text-ink-600">{magnet.formSubtext}</p>
                )}
                <div className="mt-4 space-y-2">
                  <div className="flex h-9 items-center rounded-lg border border-ink-200 bg-white px-3 text-xs text-ink-400">
                    Name
                  </div>
                  <div className="flex h-9 items-center rounded-lg border border-ink-200 bg-white px-3 text-xs text-ink-400">
                    Email
                  </div>
                  <div className="flex min-h-9 items-center justify-center rounded-lg bg-ink-950 px-3 py-2 text-center text-xs font-bold uppercase leading-tight text-white">
                    {magnet.ctaText || 'Send me the resource'}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <div className="border-t border-ink-200/70 bg-white/60 px-4 py-5 text-center text-xs text-ink-500">
        All rights reserved {new Date().getFullYear()} <span className="mx-1 text-ink-400">·</span> Privacy policy
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
