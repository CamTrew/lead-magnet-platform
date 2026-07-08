'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarCheck,
  Check,
  CircleHelp,
  Copy,
  Globe2,
  Loader2,
  Mail,
} from 'lucide-react';
import {
  AceternityCard,
  AceternityButton,
  AceternityInput,
  Field,
} from '@/components/ui/aceternity';
import { PageHeader } from '@/components/dashboard/app-shell';
import { DeliverySection } from '@/components/dashboard/delivery-section';
import { LockedField } from '@/components/dashboard/locked-field';
import { PublishingWizard } from '@/components/dashboard/publishing-wizard';
import type { AccountSettings, CalendarProvider, DashboardPayload } from '@/lib/types';
import { cn } from '@/lib/utils';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type SaveSection = 'publishing' | 'delivery';
type SectionIcon = typeof Globe2;

function calendarWebhookUrl({
  accountId,
  origin,
  token,
}: {
  accountId: string;
  origin: string;
  token: string;
}) {
  if (!origin || !token) return '';
  return `${origin}/api/calendar-webhooks/${accountId}?token=${encodeURIComponent(token)}`;
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
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#c9bfb2] bg-white text-[#1f1d1b] shadow-sm">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <h2 className="text-base font-black text-[#111111]">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[#5c554e]">{description}</p>
      </div>
    </div>
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
        className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-[#dfd8cf] bg-[#f7f5f1] text-[#5c554e] outline-none transition hover:border-[#c9bfb2] hover:text-[#1f1d1b] focus:border-[#111111] focus:text-[#1f1d1b]"
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

/**
 * Inline save-state indicator. Replaces the explicit "Save section" button —
 * saves happen on blur, so the user just needs to know the result, not press
 * anything. We render nothing while the section is idle to avoid drawing the
 * eye to a useless status pill.
 */
function SaveStatus({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  if (state === 'saving') {
    return (
      <div className="flex items-center justify-end gap-1.5 border-t border-[#dfd8cf] pt-3 text-xs text-ink-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saving…
      </div>
    );
  }
  if (state === 'saved') {
    return (
      <div className="flex items-center justify-end gap-1.5 border-t border-[#dfd8cf] pt-3 text-xs text-emerald-700">
        <Check className="h-3.5 w-3.5" />
        Saved
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-1.5 border-t border-[#dfd8cf] pt-3 text-xs text-red-700">
      Could not save — try editing again.
    </div>
  );
}

function providerLabel(provider: CalendarProvider) {
  if (provider === 'calendly') return 'Calendly';
  if (provider === 'calcom') return 'Cal.com';
  return 'Calendar';
}

function CalendarConnectionSetup({
  account,
  onAccountUpdated,
  resendConfigured,
}: {
  account: AccountSettings;
  onAccountUpdated: (account: AccountSettings) => void;
  resendConfigured: boolean;
}) {
  const [origin, setOrigin] = useState('');
  const [provider, setProvider] = useState<CalendarProvider>(account.calendarProvider || 'calendly');
  const [apiKey, setApiKey] = useState(account.calendarApiKey);
  const [webhookSecret, setWebhookSecret] = useState(account.calendarWebhookSecret);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [localError, setLocalError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    setProvider(account.calendarProvider || 'calendly');
    setApiKey(account.calendarApiKey);
    setWebhookSecret(account.calendarWebhookSecret);
  }, [
    account.calendarApiKey,
    account.calendarProvider,
    account.calendarWebhookSecret,
    account.id,
  ]);

  const connected = Boolean(account.calendarWebhookEnabled && account.calendarProvider);
  const webhookUrl = calendarWebhookUrl({
    accountId: account.id,
    origin,
    token: account.calendarWebhookToken,
  });

  async function copyUrl(value: string) {
    if (!value) return;
    await navigator.clipboard?.writeText(value).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function saveConnection() {
    if (!resendConfigured || saveState === 'saving') return;
    setSaveState('saving');
    setLocalError('');

    try {
      const response = await fetch('/api/account/calendar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          provider,
          apiKey,
          webhookSecret,
        }),
      });
      const data = (await response.json().catch(() => null)) as { account?: AccountSettings; error?: string } | null;

      if (!response.ok || !data?.account) {
        throw new Error(data?.error || 'Could not connect calendar.');
      }

      onAccountUpdated(data.account);
      setSaveState('saved');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Something went wrong');
      setSaveState('error');
    }
  }

  async function disconnect() {
    if (saveState === 'saving') return;
    setSaveState('saving');
    setLocalError('');

    try {
      const response = await fetch('/api/account/calendar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: false,
          provider: '',
          apiKey: '',
          webhookSecret: '',
        }),
      });
      const data = (await response.json().catch(() => null)) as { account?: AccountSettings; error?: string } | null;

      if (!response.ok || !data?.account) {
        throw new Error(data?.error || 'Could not disconnect calendar.');
      }

      onAccountUpdated(data.account);
      setSaveState('saved');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Something went wrong');
      setSaveState('error');
    }
  }

  return (
    <details className="group rounded-lg border border-ink-200 bg-ink-50 open:bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 transition hover:bg-white">
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-900">
            <CalendarCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-950">Calendar booking connection</p>
            <p className="mt-0.5 text-xs leading-5 text-ink-600">
              {connected
                ? `Connected to ${providerLabel(account.calendarProvider)}. Magnet sequences decide whether bookings stop follow-up emails.`
                : 'Optional. Connect Calendly or Cal.com once, then control booking cancellation inside each magnet.'}
            </p>
          </div>
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
        {!resendConfigured && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            Finish your Resend sending key, sender address, and sending domain first.
          </p>
        )}

        {localError && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {localError}
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Calendar provider">
            <select
              className="flex h-9 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-brand-orange focus:ring-1 focus:ring-brand-orange disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!resendConfigured || saveState === 'saving'}
              onChange={(event) => {
                setProvider(event.target.value as CalendarProvider);
                setSaveState('idle');
                setLocalError('');
              }}
              value={provider}
            >
              <option value="calendly">Calendly</option>
              <option value="calcom">Cal.com</option>
            </select>
          </Field>

          <Field
            label={provider === 'calendly' ? 'Calendly personal access token' : 'Cal.com API key'}
            hint={
              provider === 'calendly'
                ? 'Calendly requires a paid plan for webhooks.'
                : 'Use an API key from Cal.com. We listen for BOOKING_CREATED.'
            }
          >
            <AceternityInput
              autoComplete="new-password"
              disabled={!resendConfigured || saveState === 'saving'}
              onChange={(event) => {
                setApiKey(event.target.value);
                setSaveState('idle');
                setLocalError('');
              }}
              placeholder={provider === 'calendly' ? 'Calendly API token' : 'cal_live_xxxxxxxxxxxx'}
              type="password"
              value={apiKey}
            />
          </Field>
        </div>

        {provider === 'calcom' && (
          <Field label="Webhook signing secret" hint="Optional. Leave blank and we will generate one for Cal.com.">
            <AceternityInput
              autoComplete="new-password"
              disabled={!resendConfigured || saveState === 'saving'}
              onChange={(event) => {
                setWebhookSecret(event.target.value);
                setSaveState('idle');
                setLocalError('');
              }}
              placeholder="Generate automatically"
              type="password"
              value={webhookSecret}
            />
          </Field>
        )}

        {connected && webhookUrl && (
          <div className="rounded-md border border-ink-200 bg-ink-50 p-3">
            <p className="text-xs font-semibold uppercase text-ink-500">Account webhook URL</p>
            <div className="mt-2 flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-md border border-ink-200 bg-white px-3 py-2 font-mono text-xs text-ink-700 outline-none"
                readOnly
                value={webhookUrl}
              />
              <button
                aria-label="Copy account webhook URL"
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 text-xs font-medium text-ink-700 transition hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!webhookUrl}
                onClick={() => copyUrl(webhookUrl)}
                type="button"
              >
                <Copy className="h-4 w-4" />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-ink-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-ink-500">
            One calendar connection applies to the account. Each magnet controls its sequence and stop-on-booking setting in the Sequence tab.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {connected && (
              <AceternityButton
                disabled={saveState === 'saving'}
                onClick={disconnect}
                size="sm"
                type="button"
                variant="secondary"
              >
                Disconnect
              </AceternityButton>
            )}
            <AceternityButton
              disabled={!resendConfigured || saveState === 'saving'}
              onClick={saveConnection}
              size="sm"
              type="button"
            >
              {saveState === 'saving' ? 'Connecting' : connected ? 'Update connection' : 'Connect calendar'}
            </AceternityButton>
          </div>
        </div>

        {saveState === 'saved' && (
          <p className="text-right text-xs font-medium text-emerald-700">Saved</p>
        )}
      </div>
    </details>
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
    delivery: 'idle',
    publishing: 'idle',
  });
  const [error, setError] = useState('');
  // Once a value is committed (root domain attached, Resend key saved, etc.),
  // we hide the input behind a LockedField. Setting one of these to true
  // re-reveals the input until the next save.
  const [unlockDomain, setUnlockDomain] = useState(false);
  const [unlockResendKey, setUnlockResendKey] = useState(false);

  // We commit on blur instead of making the user click Save. The dirty refs
  // tell us whether a section has unsaved edits — without that flag every
  // focus-change would fire a no-op PUT.
  const dirty = useRef<Record<SaveSection, boolean>>({ delivery: false, publishing: false });
  // The latest account snapshot, kept in a ref so the blur handler doesn't
  // close over a stale `account` from the render that registered it.
  const accountRef = useRef(account);
  accountRef.current = account;

  function setSaveState(section: SaveSection, state: SaveState) {
    setSectionState((current) => ({ ...current, [section]: state }));
  }

  function markChanged(section: SaveSection) {
    setError('');
    dirty.current[section] = true;
    setSaveState(section, 'idle');
  }

  function patchAccount(updates: Partial<AccountSettings>, section: SaveSection) {
    markChanged(section);
    const next = { ...accountRef.current, ...updates };
    accountRef.current = next;
    setAccount(next);
  }

  const commitSection = useCallback(
    (section: SaveSection) => {
      if (!dirty.current[section]) return;
      if (sectionState[section] === 'saving') return;
      void saveAccount(section);
    },
    // saveAccount is stable enough — we only need to re-bind when the
    // current section save state changes so we don't double-fire while a
    // save is already in flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sectionState.publishing, sectionState.delivery]
  );

  async function saveAccount(section: SaveSection, snapshotOverride?: AccountSettings) {
    setSaveState(section, 'saving');
    setError('');

    try {
      const snapshot = snapshotOverride || accountRef.current;
      const response = await fetch('/api/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subdomain: snapshot.subdomain,
          domain: snapshot.domain,
          logoUrl: snapshot.logoUrl,
          logoText: snapshot.logoText,
          brand: snapshot.brand,
          resendFromEmail: snapshot.resendFromEmail,
          resendApiKey: snapshot.resendApiKey,
          resendReturnPath: snapshot.resendReturnPath,
          beehiivApiKey: snapshot.beehiivApiKey,
          beehiivPublicationId: snapshot.beehiivPublicationId,
          substackPublication: snapshot.substackPublication,
          calendarWebhookEnabled: snapshot.calendarWebhookEnabled,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || 'Configuration could not be saved');
      }

      const data = (await response.json()) as { account: AccountSettings };
      setAccount(data.account);
      dirty.current[section] = false;
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
  const resendConfigured = Boolean(
    account.resendApiKey &&
    account.resendFromEmail &&
    account.resendReturnPath
  );

  return (
    <>
      <PageHeader title="Configure" subtitle="Domain and delivery" />
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
                ? 'Brand, Pages, and Signups unlock as the items below are completed.'
                : 'Configure the items below to unlock Brand, Pages, and Signups.'}
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
              description="Choose where pages will be served and copy the DNS records."
              icon={Globe2}
              title="Publishing"
            />

            <div className="space-y-5">
              <div className="rounded-lg border border-[#dfd8cf] bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase text-[#746d64]">
                  {configuredDomain ? 'Live page host' : 'Example page host'}
                </p>
                <p className="mt-1 break-all font-mono text-sm text-[#111111]">{pageHost}</p>
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
                      onBlur={() => commitSection('publishing')}
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
                      onBlur={() => commitSection('publishing')}
                      onChange={(event) => patchAccount({ subdomain: event.target.value.toLowerCase() }, 'publishing')}
                      placeholder="get"
                    />
                  </LockedField>
                </Field>
              </div>

              <PublishingWizard hasDomain={Boolean(configuredDomain)} />

              <SaveStatus state={sectionState.publishing} />
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
                    onBlur={() => commitSection('delivery')}
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
                onCommit={() => commitSection('delivery')}
                onPatch={(updates) => patchAccount(updates, 'delivery')}
                saveState={sectionState.delivery}
              />

              <CalendarConnectionSetup
                account={account}
                onAccountUpdated={(nextAccount) => {
                  accountRef.current = nextAccount;
                  setAccount(nextAccount);
                  dirty.current.delivery = false;
                }}
                resendConfigured={resendConfigured}
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
                        onBlur={() => commitSection('delivery')}
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
                        onBlur={() => commitSection('delivery')}
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
                      onBlur={() => commitSection('delivery')}
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
