'use client';

import type { ChangeEvent, ReactNode } from 'react';
import { useState } from 'react';
import {
  AlertCircle,
  AtSign,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Copy,
  Globe2,
  Loader2,
  Mail,
  Palette,
  RefreshCw,
  Save,
} from 'lucide-react';
import {
  AceternityButton,
  AceternityCard,
  AceternityInput,
  Field,
  StatusPill,
} from '@/components/ui/aceternity';
import { PageHeader } from '@/components/dashboard/app-shell';
import {
  buildEmailDnsRecords,
  buildPageDnsRecords,
  parseSenderEmail,
  type DnsRecordDefinition,
} from '@/lib/dns-records';
import type { AccountSettings, DashboardPayload } from '@/lib/types';
import { cn } from '@/lib/utils';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type SaveSection = 'brand' | 'publishing' | 'delivery';
type DnsSection = 'publishing' | 'delivery';
type DnsRecordStatus = 'verified' | 'missing' | 'error';
type DnsCheckStatus = 'idle' | 'checking' | DnsRecordStatus;

type SectionIcon = typeof Palette;

type DnsRecordCheck = DnsRecordDefinition & {
  found: string[];
  message: string;
  status: DnsRecordStatus;
};

type DnsSectionCheck = {
  checkedAt?: string;
  error?: string;
  recordOrder: string[];
  records: Record<string, DnsRecordCheck>;
  status: DnsCheckStatus;
};

type DnsVerifyResponse = {
  checkedAt: string;
  records: DnsRecordCheck[];
  section: DnsSection;
  status: DnsRecordStatus;
};

function idleDnsCheck(): DnsSectionCheck {
  return {
    recordOrder: [],
    records: {},
    status: 'idle',
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

function DnsStatusBadge({ check }: { check?: DnsRecordCheck }) {
  const label = check?.status === 'verified'
    ? 'Verified'
    : check?.status === 'missing'
      ? 'Missing'
      : check?.status === 'error'
        ? 'Error'
        : 'Not checked';
  const Icon = check?.status === 'verified'
    ? CheckCircle2
    : check?.status === 'missing' || check?.status === 'error'
      ? AlertCircle
      : Clock3;

  return (
    <span
      title={check?.message}
      className={cn(
        'inline-flex h-7 w-fit items-center gap-1.5 rounded-lg border px-2 text-xs font-bold',
        !check && 'border-[#e4e4e7] bg-white text-[#71717a]',
        check?.status === 'verified' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
        check?.status === 'missing' && 'border-amber-200 bg-amber-50 text-amber-700',
        check?.status === 'error' && 'border-red-200 bg-red-50 text-red-700'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function DnsRecord({
  check,
  record,
}: {
  check?: DnsRecordCheck;
  record: DnsRecordDefinition;
}) {
  const [copied, setCopied] = useState(false);

  async function copyRecord() {
    try {
      await navigator.clipboard.writeText(`${record.type}\t${record.name}\t${record.value}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid gap-2 border-t border-[#e4e4e7] px-4 py-3 text-sm first:border-t-0 md:grid-cols-[88px_minmax(0,1fr)_minmax(0,1.45fr)_116px_40px]">
      <span className="font-semibold text-[#18181b]">{record.type}</span>
      <code className="break-all rounded-md border border-[#e4e4e7] bg-[#fafafa] px-2 py-1 text-xs text-[#3f3f46]">{record.name}</code>
      <code className="break-all rounded-md border border-[#e4e4e7] bg-[#fafafa] px-2 py-1 text-xs text-[#3f3f46]">{record.value}</code>
      <DnsStatusBadge check={check} />
      <button
        aria-label={`Copy ${record.type} record`}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#e4e4e7] bg-white text-[#18181b] transition hover:border-[#d4d4d8] hover:bg-[#f4f4f5]"
        onClick={copyRecord}
        type="button"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

function DnsTable({
  children,
  checkState,
  description,
  help,
  onVerify,
  title,
  verifyDisabled,
}: {
  children: ReactNode;
  checkState: DnsSectionCheck;
  description: string;
  help?: string;
  onVerify: () => void;
  title: string;
  verifyDisabled?: boolean;
}) {
  const checking = checkState.status === 'checking';
  const statusLabel = checkState.status === 'verified'
    ? 'All records verified'
    : checkState.status === 'missing'
      ? 'Some records are missing'
      : checkState.status === 'error'
        ? 'DNS check hit an error'
        : checking
          ? 'Checking public DNS'
          : '';

  return (
    <div className="overflow-hidden rounded-lg border border-[#e4e4e7]">
      <div className="flex flex-col gap-3 bg-[#fafafa] px-4 py-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-bold text-[#09090b]">
            {title}
            {help && <HelpTooltip ariaLabel={`${title} help`} help={help} width="w-80" />}
          </p>
          <p className="mt-1 text-xs leading-5 text-[#71717a]">{description}</p>
          {(statusLabel || checkState.error) && (
            <p
              className={cn(
                'mt-2 inline-flex rounded-lg border px-2.5 py-1 text-xs font-bold',
                checking && 'border-[#d4d4d8] bg-white text-[#18181b]',
                checkState.status === 'verified' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                checkState.status === 'missing' && 'border-amber-200 bg-amber-50 text-amber-700',
                (checkState.status === 'error' || checkState.error) && 'border-red-200 bg-red-50 text-red-700'
              )}
            >
              {checkState.error || statusLabel}
              {checkState.checkedAt && checkState.status !== 'checking'
                ? ` at ${new Date(checkState.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : ''}
            </p>
          )}
        </div>
        <AceternityButton
          disabled={verifyDisabled || checking}
          onClick={onVerify}
          size="sm"
          type="button"
          variant="secondary"
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Check DNS
        </AceternityButton>
      </div>
      <div className="hidden grid-cols-[88px_minmax(0,1fr)_minmax(0,1.45fr)_116px_40px] gap-2 border-t border-[#e4e4e7] bg-white px-4 py-2 text-xs font-bold uppercase text-[#71717a] md:grid">
        <span>Type</span>
        <span>Host</span>
        <span>Value</span>
        <span>Status</span>
        <span />
      </div>
      {children}
    </div>
  );
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
  return (
    <span className="group/help relative inline-flex">
      <span
        aria-label={ariaLabel}
        className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-[#e4e4e7] bg-[#fafafa] text-[#52525b] outline-none transition hover:border-[#d4d4d8] hover:text-[#18181b] focus:border-[#09090b] focus:text-[#18181b]"
        role="button"
        tabIndex={0}
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </span>
      <span
        className={cn(
          'pointer-events-none absolute bottom-full right-0 z-30 mb-2 hidden whitespace-pre-line rounded-lg border border-[#e4e4e7] bg-white p-3 text-left text-xs font-medium leading-5 text-[#3f3f46] shadow-sm group-hover/help:block group-focus-within/help:block',
          width
        )}
        role="tooltip"
      >
        {help}
      </span>
    </span>
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
  return (
    <div className="flex items-center justify-end gap-2 border-t border-[#e4e4e7] pt-4">
      <StatusPill state={state} />
      <AceternityButton disabled={disabled || state === 'saving'} onClick={onSave}>
        <Save className="h-4 w-4" />
        {label}
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
  const [dnsChecks, setDnsChecks] = useState<Record<DnsSection, DnsSectionCheck>>({
    delivery: idleDnsCheck(),
    publishing: idleDnsCheck(),
  });
  const [error, setError] = useState('');

  function setSaveState(section: SaveSection, state: SaveState) {
    setSectionState((current) => ({ ...current, [section]: state }));
  }

  function markChanged(section: SaveSection) {
    setError('');
    setSaveState(section, 'idle');
    if (section === 'publishing' || section === 'delivery') {
      setDnsChecks((current) => ({ ...current, [section]: idleDnsCheck() }));
    }
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
      setSaveState(section, 'saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSaveState(section, 'error');
    }
  }

  async function verifyDns(section: DnsSection) {
    setError('');
    setDnsChecks((current) => ({
      ...current,
      [section]: {
        ...current[section],
        error: undefined,
        status: 'checking',
      },
    }));

    try {
      const response = await fetch('/api/dns/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section,
          domain: account.domain,
          subdomain: account.subdomain,
          resendFromEmail: account.resendFromEmail,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | (Partial<DnsVerifyResponse> & { error?: string })
        | null;

      const records = data?.records;
      const status = data?.status;
      const checkedAt = data?.checkedAt;

      if (!response.ok || !records || !status || !checkedAt) {
        throw new Error(data?.error || 'DNS could not be checked');
      }

      setDnsChecks((current) => ({
        ...current,
        [section]: {
          checkedAt,
          recordOrder: records.map((record) => record.id),
          records: Object.fromEntries(records.map((record) => [record.id, record])),
          status,
        },
      }));
    } catch (err) {
      setDnsChecks((current) => ({
        ...current,
        [section]: {
          ...current[section],
          error: err instanceof Error ? err.message : 'DNS could not be checked',
          status: 'error',
        },
      }));
    }
  }

  const pageSubdomain = account.subdomain || 'get';
  const configuredDomain = account.domain.trim();
  const displayDomain = configuredDomain || 'example.com';
  const pageHost = `${pageSubdomain}.${displayDomain}`;
  const sender = parseSenderEmail(account.resendFromEmail);
  const senderInvalid = Boolean(account.resendFromEmail.trim() && !sender);
  const fromDomain = sender?.domain || '';
  const displayFromDomain = fromDomain || displayDomain;
  const brandLabel = account.logoText.trim() || 'Your logo text';
  const pageDnsRecords = buildPageDnsRecords({
    accountId: account.id,
    domain: displayDomain,
    subdomain: pageSubdomain,
  });
  const deliveryDnsRecords = buildEmailDnsRecords(displayFromDomain);
  const checkedDeliveryDnsRecords = dnsChecks.delivery.recordOrder
    .map((id) => dnsChecks.delivery.records[id])
    .filter((record): record is DnsRecordCheck => Boolean(record));
  const visibleDeliveryDnsRecords = checkedDeliveryDnsRecords.length
    ? checkedDeliveryDnsRecords
    : deliveryDnsRecords;

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
              <div className="flex items-center gap-4 rounded-lg border border-[#e4e4e7] bg-white p-4 shadow-sm">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#e4e4e7] bg-[#fafafa]">
                  {account.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={account.logoUrl} alt={brandLabel} className="h-full w-full object-contain p-2" />
                  ) : (
                    <span className="text-lg font-black" style={{ color: account.brand.primary }}>
                      {brandLabel.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#09090b]">{brandLabel}</p>
                  <p className="mt-1 text-xs text-[#71717a]">Shown on pages and emails.</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Logo image" hint="PNG, JPG, WebP, or GIF — up to 1 MB. Logo text is used when this is empty.">
                  <AceternityInput
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#f4f4f5] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#18181b]"
                    onChange={handleLogoUpload}
                    type="file"
                  />
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
                </Field>
                <Field label="Page subdomain" hint="Recommended: get">
                  <AceternityInput
                    value={account.subdomain}
                    onChange={(event) => patchAccount({ subdomain: event.target.value.toLowerCase() }, 'publishing')}
                    placeholder="get"
                  />
                </Field>
              </div>

              <DnsTable
                checkState={dnsChecks.publishing}
                title="Page DNS records"
                description={
                  configuredDomain
                    ? `Add these where DNS is managed for ${configuredDomain}.`
                    : 'Add your root domain above. Until then these show exactly what the records will look like.'
                }
                help={
                  'These two records make get.yourdomain.com show your published magnets.\n\n' +
                  'Where to add them: log in to wherever you bought your domain — Cloudflare, GoDaddy, Namecheap, Google Domains, Vercel, Squarespace — and open the DNS settings for the domain. Look for "DNS", "DNS records", or "Manage DNS".\n\n' +
                  'For each row below, click "Add record", pick the Type (CNAME or TXT), paste the Host into the Name field, and paste the Value into the Value/Content field. Leave TTL as the default (Auto or 3600).\n\n' +
                  'Tip: some providers want the Host without your domain (e.g. "get"), others want it with (e.g. "get.example.com"). Both usually work — try without first.\n\n' +
                  'After saving, click "Check DNS" here. Records can take a few minutes to a couple of hours to show up.'
                }
                onVerify={() => verifyDns('publishing')}
                verifyDisabled={!configuredDomain}
              >
                {pageDnsRecords.map((record) => (
                  <DnsRecord
                    key={record.id}
                    check={dnsChecks.publishing.records[record.id]}
                    record={record}
                  />
                ))}
              </DnsTable>

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
              <div className="grid gap-4">
                <Field label="From email" hint="Example: Your Brand <hello@example.com>">
                  <div className="relative">
                    <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a1a1aa]" />
                    <AceternityInput
                      className="pl-9"
                      value={account.resendFromEmail}
                      onChange={(event) => patchAccount({ resendFromEmail: event.target.value }, 'delivery')}
                      placeholder="Sender name and email"
                    />
                  </div>
                  {senderInvalid && (
                    <span className="mt-2 block text-xs font-bold leading-5 text-red-600">
                      Enter a full sender email, for example Your Brand &lt;hello@example.com&gt;.
                    </span>
                  )}
                </Field>

                <Field
                  label={
                    <LabelHelp
                      label="Resend API key"
                      help="Create a free Resend account at resend.com, then go to API Keys and create one with full access. The key is used to send the resource email from your sender domain."
                    />
                  }
                  hint="Used to send the resource email. Bring your own Resend key so sending stays in your account."
                >
                  <AceternityInput
                    value={account.resendApiKey}
                    onChange={(event) => patchAccount({ resendApiKey: event.target.value }, 'delivery')}
                    placeholder="re_xxxxxxxxxxxx"
                  />
                </Field>

                <details className="group rounded-lg border border-[#e4e4e7] bg-[#fafafa] open:bg-white">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 transition hover:bg-white">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-[#09090b]">Add signups to a newsletter</p>
                      <p className="mt-0.5 text-xs leading-5 text-[#52525b]">
                        Optional. Connect Beehiiv or Substack to forward each signup. Signups are always saved here either way.
                      </p>
                    </div>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#e4e4e7] bg-white text-[#18181b] transition group-open:rotate-180">
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

                  <div className="space-y-4 border-t border-[#e4e4e7] p-4">
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
                          help="The subdomain on Substack — for example, type 'myletter' for myletter.substack.com. Substack has no official subscriber API, so this uses their public subscribe endpoint and may break if Substack changes it."
                        />
                      }
                      hint="Just the subdomain — myletter, not myletter.substack.com"
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

              {senderInvalid ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                  Add a valid sender email before copying or checking sending DNS records.
                </div>
              ) : (
                <DnsTable
                  checkState={dnsChecks.delivery}
                  title="Sending-domain DNS records"
                  description={
                    fromDomain
                      ? `These records help verify sending for ${fromDomain}.`
                      : 'Add a sender email above. Until then these use the publishing domain as an example.'
                  }
                  help={
                    'These records prove to Gmail and Outlook that you own the domain you send from — without them, your emails land in spam.\n\n' +
                    'Where to add them: log in to wherever DNS is managed for your sender domain (Cloudflare, GoDaddy, Namecheap, etc.). Open DNS records.\n\n' +
                    'There are three kinds:\n' +
                    '• MX — directs return-path mail. Pick "MX" as the type, paste Host into Name, paste Value into the mail-server field. Priority is 10.\n' +
                    '• TXT (SPF / DKIM / DMARC) — pick "TXT", paste Host into Name, paste the whole Value (quotes included) into the Value/Content field.\n\n' +
                    'Click "Check DNS" here once added. Records often appear within minutes but can take a few hours.\n\n' +
                    'These records come straight from your Resend account — they are unique to your sender, so do not copy them from anywhere else.'
                  }
                  onVerify={() => verifyDns('delivery')}
                  verifyDisabled={!fromDomain}
                >
                  {visibleDeliveryDnsRecords.map((record) => (
                    <DnsRecord
                      key={record.id}
                      check={dnsChecks.delivery.records[record.id]}
                      record={record}
                    />
                  ))}
                </DnsTable>
              )}

              <p className="rounded-lg border border-[#e4e4e7] bg-[#fafafa] p-3 text-xs font-medium leading-5 text-[#52525b]">
                Click Check DNS to create or find the sender domain in Resend, then show the exact records, including DKIM.
              </p>

              <SectionSave
                disabled={senderInvalid}
                label="Save delivery"
                onSave={() => saveAccount('delivery')}
                state={sectionState.delivery}
              />
            </div>
          </div>
        </AceternityCard>
      </div>
    </>
  );
}
