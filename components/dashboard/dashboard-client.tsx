'use client';

import type { ChangeEvent } from 'react';
import { useRef, useState } from 'react';
import {
  Check,
  CircleHelp,
  Globe2,
  Loader2,
  Mail,
  Palette,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  AceternityButton,
  AceternityCard,
  AceternityInput,
  Field,
} from '@/components/ui/aceternity';
import { PageHeader } from '@/components/dashboard/app-shell';
import { DeliverySection } from '@/components/dashboard/delivery-section';
import { LockedField } from '@/components/dashboard/locked-field';
import { PublishingWizard } from '@/components/dashboard/publishing-wizard';
import type { AccountSettings, DashboardPayload } from '@/lib/types';
import { cn } from '@/lib/utils';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type SaveSection = 'brand' | 'publishing' | 'delivery';
type SectionIcon = typeof Palette;

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function SectionHeader({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: SectionIcon;
  title: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#d4d4d8] bg-white text-[#18181b] shadow-sm">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <h2 className="text-base font-black text-[#09090b]">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[#52525b]">{description}</p>
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const pickerValue = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#27272a';

  return (
    <Field label={label}>
      <div className="flex h-11 overflow-hidden rounded-lg border border-[#e4e4e7] bg-white focus-within:border-[#09090b] focus-within:ring-2 focus-within:ring-[#09090b]/15">
        <input
          aria-label={`${label} picker`}
          className="h-full w-12 cursor-pointer border-0 bg-transparent p-1"
          type="color"
          value={pickerValue}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          aria-label={`${label} hex value`}
          className="min-w-0 flex-1 bg-transparent px-3 text-sm text-[#09090b] outline-none"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </Field>
  );
}

function HelpTooltip({ ariaLabel, help, width = 'w-64' }: { ariaLabel: string; help: string; width?: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Position via fixed coords so the tooltip escapes any ancestor with
  // `overflow: hidden` (which is true of every AceternityCard). We compute
  // coords just-in-time on hover/focus.
  function recalc() {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition({
      top: rect.top, // tooltip sits above the icon — translate -100% Y via CSS
      left: rect.right, // anchor to the right edge of the icon — translate -100% X via CSS
    });
  }

  return (
    <>
      <span
        aria-label={ariaLabel}
        className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-[#e4e4e7] bg-[#fafafa] text-[#52525b] outline-none transition hover:border-[#d4d4d8] hover:text-[#18181b] focus:border-[#09090b] focus:text-[#18181b]"
        onBlur={() => setOpen(false)}
        onFocus={() => {
          recalc();
          setOpen(true);
        }}
        onMouseEnter={() => {
          recalc();
          setOpen(true);
        }}
        onMouseLeave={() => setOpen(false)}
        ref={triggerRef}
        role="button"
        tabIndex={0}
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </span>
      {open && position && (
        <span
          className={cn(
            'pointer-events-none fixed z-[60] whitespace-pre-line rounded-lg border border-ink-200 bg-white p-3 text-left text-xs font-medium leading-5 text-ink-700 shadow-lg',
            width
          )}
          role="tooltip"
          style={{
            top: position.top - 8,
            left: position.left,
            transform: 'translate(-100%, -100%)',
          }}
        >
          {help}
        </span>
      )}
    </>
  );
}

function LabelHelp({
  help,
  label,
}: {
  help: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <HelpTooltip ariaLabel={`${label} help`} help={help} />
    </span>
  );
}

function SectionSave({
  disabled,
  label,
  onSave,
  state,
}: {
  disabled?: boolean;
  label: string;
  onSave: () => void;
  state: SaveState;
}) {
  const isSaving = state === 'saving';
  const isSaved = state === 'saved';
  const isError = state === 'error';

  return (
    <div className="flex items-center justify-end gap-2 border-t border-[#e4e4e7] pt-4">
      {isError && (
        <span className="inline-flex h-9 items-center rounded-md border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-700">
          Could not save
        </span>
      )}
      <AceternityButton disabled={disabled || isSaving} onClick={onSave}>
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isSaved ? (
          <Check className="h-4 w-4" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {isSaving ? 'Saving' : isSaved ? 'Saved' : label}
      </AceternityButton>
    </div>
  );
}

type SetupItem = {
  key: string;
  label: string;
  detail: string;
  done: boolean;
};

export function DashboardClient({
  initialData,
  setupChecklist = [],
  showRedirectNotice = false,
}: {
  initialData: DashboardPayload;
  setupChecklist?: SetupItem[];
  showRedirectNotice?: boolean;
}) {
  const [account, setAccount] = useState<AccountSettings>(initialData.account);
  const [sectionState, setSectionState] = useState<Record<SaveSection, SaveState>>({
    brand: 'idle',
    delivery: 'idle',
    publishing: 'idle',
  });
  const [error, setError] = useState('');
  // Once a value is committed (root domain attached, Resend key saved, etc.),
  // we hide the input behind a LockedField. Setting one of these to true
  // re-reveals the input until the next save.
  const [unlockDomain, setUnlockDomain] = useState(false);
  const [unlockResendKey, setUnlockResendKey] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  function removeLogo() {
    if (!account.logoUrl) return;
    patchAccount({ logoUrl: '' }, 'brand');
    if (logoInputRef.current) logoInputRef.current.value = '';
    setError('');
  }

  function setSaveState(section: SaveSection, state: SaveState) {
    setSectionState((current) => ({ ...current, [section]: state }));
  }

  function markChanged(section: SaveSection) {
    setError('');
    setSaveState(section, 'idle');
  }

  function patchAccount(updates: Partial<AccountSettings>, section: SaveSection) {
    markChanged(section);
    setAccount((current) => ({ ...current, ...updates }));
  }

  function patchBrand(updates: Partial<AccountSettings['brand']>) {
    markChanged('brand');
    setAccount((current) => ({ ...current, brand: { ...current.brand, ...updates } }));
  }

  async function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
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

    patchAccount({ logoUrl: await readFileAsDataUrl(file) }, 'brand');
  }

  async function saveAccount(section: SaveSection) {
    setSaveState(section, 'saving');
    setError('');

    try {
      const response = await fetch('/api/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subdomain: account.subdomain,
          domain: account.domain,
          logoUrl: account.logoUrl,
          logoText: account.logoText,
          brand: account.brand,
          resendFromEmail: account.resendFromEmail,
          resendApiKey: account.resendApiKey,
          resendReturnPath: account.resendReturnPath,
          beehiivApiKey: account.beehiivApiKey,
          beehiivPublicationId: account.beehiivPublicationId,
          substackPublication: account.substackPublication,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || 'Configuration could not be saved');
      }

      const data = (await response.json()) as { account: AccountSettings };
      setAccount(data.account);
      // After a successful save we re-lock the previously-unlocked fields,
      // so the user has to click Edit again to make further changes.
      if (section === 'publishing') setUnlockDomain(false);
      if (section === 'delivery') setUnlockResendKey(false);
      setSaveState(section, 'saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSaveState(section, 'error');
    }
  }

  const pageSubdomain = account.subdomain || 'get';
  const configuredDomain = account.domain.trim();
  const displayDomain = configuredDomain || 'example.com';
  const pageHost = `${pageSubdomain}.${displayDomain}`;
  const brandLabel = account.logoText.trim() || 'Your logo text';

  return (
    <>
      <PageHeader title="Configure" subtitle="Brand, domain, and delivery" />
      <div className="mx-auto max-w-6xl space-y-4">
        {setupChecklist.length > 0 && setupChecklist.some((item) => !item.done) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-semibold text-amber-900">
              {showRedirectNotice
                ? 'Finish setup first.'
                : 'A few setup steps to go.'}
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              {showRedirectNotice
                ? 'Pages and Signups unlock once the items below are complete.'
                : 'Configure the items below to unlock Pages and Signups.'}
            </p>
            <ul className="mt-3 space-y-2 text-sm text-amber-900">
              {setupChecklist.map((item) => (
                <li key={item.key} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className={
                      item.done
                        ? 'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white'
                        : 'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-400 bg-white text-amber-700'
                    }
                  >
                    {item.done ? (
                      <svg viewBox="0 0 12 12" className="h-3 w-3">
                        <path
                          d="M2.5 6.2l2.4 2.4 4.6-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <span className="text-[10px] font-bold">!</span>
                    )}
                  </span>
                  <span>
                    <span className={item.done ? 'font-medium text-amber-900/70 line-through' : 'font-medium'}>
                      {item.label}
                    </span>
                    <span className="ml-2 text-xs text-amber-800/80">{item.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</p>}

        <AceternityCard className="p-6">
          <div className="space-y-6">
            <SectionHeader
              description="Set the logo, text, and colours used on published pages."
              icon={Palette}
              title="Brand"
            />

            <div className="space-y-5">
              <div className="flex items-center gap-4 rounded-lg border border-ink-200 bg-white p-4">
                <div className="group/logo relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
                  {account.logoUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={account.logoUrl} alt={brandLabel} className="h-full w-full object-contain p-2" />
                      <button
                        aria-label="Remove logo"
                        className="absolute right-0.5 top-0.5 hidden h-5 w-5 items-center justify-center rounded-full bg-ink-950 text-white shadow-sm transition hover:bg-red-600 group-hover/logo:flex focus:flex"
                        onClick={removeLogo}
                        title="Remove logo"
                        type="button"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <span className="text-lg font-semibold" style={{ color: account.brand.primary }}>
                      {brandLabel.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-950">{brandLabel}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    {account.logoUrl
                      ? 'Image uploaded. Save brand to apply.'
                      : 'No image. The first letter shows on pages and emails.'}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Logo image" hint="PNG, JPG, WebP, or GIF. up to 1 MB. Logo text is used when this is empty.">
                  <AceternityInput
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink-900"
                    onChange={handleLogoUpload}
                    ref={logoInputRef}
                    type="file"
                  />
                  {account.logoUrl && (
                    <button
                      className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2 text-xs font-medium text-ink-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                      onClick={removeLogo}
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove logo
                    </button>
                  )}
                </Field>
                <Field label="Logo text" hint="Used when no logo image is uploaded.">
                  <AceternityInput
                    value={account.logoText}
                    onChange={(event) => patchAccount({ logoText: event.target.value }, 'brand')}
                    placeholder="Company name"
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <ColorField label="Primary" value={account.brand.primary} onChange={(value) => patchBrand({ primary: value })} />
                <ColorField label="Accent" value={account.brand.accent} onChange={(value) => patchBrand({ accent: value })} />
                <ColorField label="Success" value={account.brand.success} onChange={(value) => patchBrand({ success: value })} />
              </div>

              <SectionSave
                label="Save brand"
                onSave={() => saveAccount('brand')}
                state={sectionState.brand}
              />
            </div>
          </div>
        </AceternityCard>

        <AceternityCard className="p-6">
          <div className="space-y-6">
            <SectionHeader
              description="Choose where pages will be served and copy the DNS records."
              icon={Globe2}
              title="Publishing"
            />

            <div className="space-y-5">
              <div className="rounded-lg border border-[#e4e4e7] bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase text-[#71717a]">
                  {configuredDomain ? 'Live page host' : 'Example page host'}
                </p>
                <p className="mt-1 break-all font-mono text-sm text-[#09090b]">{pageHost}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Root domain" hint="No https or page paths.">
                  <LockedField
                    confirmDescription={
                      <>
                        <p>
                          Changing your root domain disconnects the current one and clears your ownership
                          verification. Visitors going to{' '}
                          <span className="font-mono text-ink-900">{account.domainAttachedHost}</span> will
                          stop seeing your pages until you finish the new setup.
                        </p>
                        <p className="mt-2 text-ink-600">You can keep using the dashboard while you switch.</p>
                      </>
                    }
                    confirmTitle="Change your root domain?"
                    displayValue={account.domain}
                    locked={Boolean(account.domainAttachedHost) && !unlockDomain}
                    onConfirmEdit={() => setUnlockDomain(true)}
                  >
                    <AceternityInput
                      value={account.domain}
                      onChange={(event) =>
                        patchAccount({
                          domain: event.target.value
                            .toLowerCase()
                            .replace(/^https?:\/\//, '')
                            .replace(/\/.*/, ''),
                        }, 'publishing')
                      }
                      placeholder="example.com"
                    />
                  </LockedField>
                </Field>
                <Field label="Page subdomain" hint="Recommended: get">
                  <LockedField
                    confirmDescription={
                      <>
                        <p>
                          Changing the subdomain disconnects{' '}
                          <span className="font-mono text-ink-900">{account.domainAttachedHost}</span> and
                          requires you to verify the new one. Existing links to your pages will stop working
                          until the new subdomain is live.
                        </p>
                      </>
                    }
                    confirmTitle="Change your subdomain?"
                    displayValue={account.subdomain}
                    locked={Boolean(account.domainAttachedHost) && !unlockDomain}
                    onConfirmEdit={() => setUnlockDomain(true)}
                  >
                    <AceternityInput
                      value={account.subdomain}
                      onChange={(event) => patchAccount({ subdomain: event.target.value.toLowerCase() }, 'publishing')}
                      placeholder="get"
                    />
                  </LockedField>
                </Field>
              </div>

              <PublishingWizard hasDomain={Boolean(configuredDomain)} />

              <SectionSave
                label="Save publishing"
                onSave={() => saveAccount('publishing')}
                state={sectionState.publishing}
              />
            </div>
          </div>
        </AceternityCard>

        <AceternityCard className="p-6">
          <div className="space-y-6">
            <SectionHeader
              description="Set the sender. Connect a newsletter if you want signups added to it."
              icon={Mail}
              title="Delivery"
            />

            <div className="space-y-5">
              <Field
                label={
                  <LabelHelp
                    label="Sending key"
                    help="Create a free Resend account at resend.com, then go to API Keys and create one with full access. The key is used to send the resource email from your sender domain."
                  />
                }
                hint="The key is encrypted at rest and never shown back to you in plaintext."
              >
                <LockedField
                  confirmDescription={
                    <>
                      <p>
                        Replacing your sending key means any emails in flight, or that we retry after this
                        point, will use the new one. If you paste an invalid key here, deliveries will fail
                        until it&apos;s fixed.
                      </p>
                      <p className="mt-2 text-ink-600">Make sure you have the new key ready before continuing.</p>
                    </>
                  }
                  confirmTitle="Replace your sending key?"
                  displayValue={<span className="font-mono text-ink-700">••••••••</span>}
                  locked={Boolean(account.resendApiKey) && !unlockResendKey}
                  onConfirmEdit={() => {
                    patchAccount({ resendApiKey: '' }, 'delivery');
                    setUnlockResendKey(true);
                  }}
                >
                  <AceternityInput
                    value={account.resendApiKey}
                    onChange={(event) => patchAccount({ resendApiKey: event.target.value }, 'delivery')}
                    placeholder="re_xxxxxxxxxxxx"
                  />
                </LockedField>
              </Field>

              <DeliverySection
                account={{
                  domain: account.domain,
                  domainAttachedHost: account.domainAttachedHost,
                  resendApiKey: account.resendApiKey,
                  resendFromEmail: account.resendFromEmail,
                  resendReturnPath: account.resendReturnPath,
                }}
                onPatch={(updates) => patchAccount(updates, 'delivery')}
                onSave={() => saveAccount('delivery')}
                saveState={sectionState.delivery}
              />

              <details className="group rounded-lg border border-ink-200 bg-ink-50 open:bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 transition hover:bg-white">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-950">Add signups to a newsletter</p>
                    <p className="mt-0.5 text-xs leading-5 text-ink-600">
                      Optional. Connect Beehiiv or Substack to forward each signup. Signups are always saved here either way.
                    </p>
                  </div>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-700 transition group-open:rotate-180">
                    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5">
                      <path
                        d="M4 6l4 4 4-4"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                      />
                    </svg>
                  </span>
                </summary>

                <div className="space-y-4 border-t border-ink-200 p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      label={
                        <LabelHelp
                          label="Beehiiv publication ID"
                          help="In Beehiiv, open the publication you want to use, then copy the publication ID from the API settings."
                        />
                      }
                    >
                      <AceternityInput
                        value={account.beehiivPublicationId}
                        onChange={(event) => patchAccount({ beehiivPublicationId: event.target.value }, 'delivery')}
                        placeholder="Publication ID"
                      />
                    </Field>
                    <Field
                      label={
                        <LabelHelp
                          label="Beehiiv API key"
                          help="In Beehiiv, go to Settings, then Integrations or API. Create an API key and paste it here."
                        />
                      }
                    >
                      <AceternityInput
                        value={account.beehiivApiKey}
                        onChange={(event) => patchAccount({ beehiivApiKey: event.target.value }, 'delivery')}
                        placeholder="API key"
                      />
                    </Field>
                  </div>

                  <Field
                    label={
                      <LabelHelp
                        label="Substack publication"
                        help="The subdomain on Substack. for example, type 'myletter' for myletter.substack.com. Substack has no official subscriber API, so this uses their public subscribe endpoint and may break if Substack changes it."
                      />
                    }
                    hint="Just the subdomain. myletter, not myletter.substack.com"
                  >
                    <AceternityInput
                      value={account.substackPublication}
                      onChange={(event) => patchAccount({ substackPublication: event.target.value }, 'delivery')}
                      placeholder="myletter"
                    />
                  </Field>
                </div>
              </details>
            </div>
          </div>
        </AceternityCard>
      </div>
    </>
  );
}
