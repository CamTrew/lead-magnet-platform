'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  BriefcaseBusiness,
  CalendarCheck,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Globe2,
  Loader2,
  Mail,
  MessageSquare,
  Newspaper,
  ScrollText,
  Sparkles,
  Webhook,
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
import type { AccountSettings, CalendarProvider, DashboardBasePayload } from '@/lib/types';
import { cn } from '@/lib/utils';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type SaveSection = 'publishing' | 'delivery';
type SectionIcon = typeof Globe2;

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
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-900 shadow-sm">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <h2 className="text-base font-semibold text-ink-950">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-600">{description}</p>
      </div>
    </div>
  );
}

function ConnectionIcon({
  icon: Icon,
  tone = 'orange',
}: {
  icon: typeof Globe2;
  tone?: 'aqua' | 'orange' | 'yellow';
}) {
  const toneClass = {
    aqua: 'connection-icon--aqua bg-[#e6f7f8] text-[#167984]',
    orange: 'connection-icon--orange bg-[#fff0e9] text-brand-orange',
    yellow: 'connection-icon--yellow bg-[#fff8df] text-[#9a6400]',
  }[tone];

  return (
    <span className={cn('connection-icon mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink-200', toneClass)}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

function BrandConnectionIcon({
  alt,
  src,
  tone,
}: {
  alt: string;
  src: string;
  tone: 'aqua' | 'green';
}) {
  const toneClass = {
    aqua: 'brand-connection-icon--aqua bg-[#f7f2f8]',
    green: 'brand-connection-icon--green bg-[#edf8f1]',
  }[tone];

  return (
    <span
      className={cn(
        'brand-connection-icon mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink-200',
        toneClass
      )}
      title={alt}
    >
      <Image
        alt=""
        aria-hidden="true"
        className="h-5 w-5 object-contain"
        height={20}
        sizes="20px"
        src={src}
        width={20}
      />
    </span>
  );
}

function ConnectionChevron() {
  return (
    <span className="connection-chevron flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-700 transition group-open:rotate-180">
      <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
    </span>
  );
}

function ConnectionStatus({
  children,
  tone = 'connected',
}: {
  children: React.ReactNode;
  tone?: 'connected' | 'pending' | 'platform';
}) {
  const toneClass = {
    connected: 'connection-status--connected border-emerald-200 bg-emerald-50 text-emerald-800',
    pending: 'connection-status--pending border-amber-200 bg-amber-50 text-amber-800',
    platform: 'connection-status--platform border-brand-orange/20 bg-brand-orange/10 text-brand-orange',
  }[tone];

  return (
    <span className={cn('connection-status inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold', toneClass)}>
      {children}
    </span>
  );
}

const connectionCardClass =
  'connection-card group overflow-hidden bg-white transition hover:bg-ink-50 open:col-span-full open:bg-white';

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
        className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-ink-200 bg-ink-50 text-ink-600 outline-none transition hover:border-ink-300 hover:text-ink-900 focus:border-ink-950 focus:text-ink-900"
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
      <div className="flex items-center justify-end gap-1.5 border-t border-ink-200 pt-3 text-xs text-ink-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saving…
      </div>
    );
  }
  if (state === 'saved') {
    return (
      <div className="flex items-center justify-end gap-1.5 border-t border-ink-200 pt-3 text-xs text-emerald-700">
        <Check className="completion-tick h-3.5 w-3.5" />
        Saved
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-1.5 border-t border-ink-200 pt-3 text-xs text-red-700">
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
  const [provider, setProvider] = useState<CalendarProvider>(account.calendarProvider || 'calendly');
  const [apiKey, setApiKey] = useState(account.calendarApiKey);
  const [webhookSecret, setWebhookSecret] = useState(account.calendarWebhookSecret);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [localError, setLocalError] = useState('');
  const [copied, setCopied] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookUrlError, setWebhookUrlError] = useState('');
  const [open, setOpen] = useState(false);

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

  useEffect(() => {
    if (!connected || !open) {
      setWebhookUrl('');
      setWebhookUrlError('');
      return;
    }

    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/account/calendar');
        const data = (await response.json().catch(() => null)) as {
          webhookUrl?: string;
          error?: string;
        } | null;

        if (!response.ok) {
          throw new Error(data?.error || 'Could not load the calendar webhook URL.');
        }

        if (active) {
          setWebhookUrl(data?.webhookUrl || '');
          setWebhookUrlError('');
        }
      } catch (err) {
        if (active) {
          setWebhookUrl('');
          setWebhookUrlError(err instanceof Error ? err.message : 'Could not load the calendar webhook URL.');
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [account.id, connected, open]);

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
    <details
      className={connectionCardClass}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition">
        <div className="flex min-w-0 gap-3">
          <ConnectionIcon icon={CalendarCheck} tone="yellow" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-ink-950">Calendar booking</p>
              {connected && <ConnectionStatus>Connected</ConnectionStatus>}
            </div>
            <p className="mt-0.5 text-xs leading-5 text-ink-600">
              {connected
                ? `Connected to ${providerLabel(account.calendarProvider)}. Stop sequences when a lead books.`
                : 'Stop sequences after a Calendly or Cal.com booking.'}
            </p>
          </div>
        </div>
        <ConnectionChevron />
      </summary>

      <div className="space-y-4 border-t border-ink-200 p-4">
        {!resendConfigured && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            Magnets-managed sending is not available yet. Contact support before connecting a calendar.
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
              className="flex h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-brand-orange focus:ring-1 focus:ring-brand-orange disabled:cursor-not-allowed disabled:opacity-50 sm:h-9"
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

        {connected && (
          <div className="rounded-md border border-ink-200 bg-ink-50 p-3">
            <p className="text-xs font-medium text-ink-500">Account webhook URL</p>
            {webhookUrl ? (
              <div className="mt-2 flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-md border border-ink-200 bg-white px-3 py-2 font-mono text-xs text-ink-700 outline-none"
                  readOnly
                  value={webhookUrl}
                />
                <button
                  aria-label="Copy account webhook URL"
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 text-xs font-medium text-ink-700 transition hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => copyUrl(webhookUrl)}
                  type="button"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            ) : (
              <p className="mt-2 text-xs leading-5 text-ink-600">
                {webhookUrlError || 'Loading connection details.'}
              </p>
            )}
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

function SlackNotificationsSetup({
  account,
  onCommit,
  onPatch,
  onTest,
  saveState,
  testMessage,
  testState,
}: {
  account: AccountSettings;
  onCommit: () => void;
  onPatch: (updates: Partial<AccountSettings>) => void;
  onTest: () => void;
  saveState: SaveState;
  testMessage: string;
  testState: SaveState;
}) {
  const connected = Boolean(account.slackWebhookUrl);

  return (
    <details className={connectionCardClass}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition">
        <div className="flex min-w-0 gap-3">
          <BrandConnectionIcon
            alt="Slack"
            src="/brand/slack.svg"
            tone="aqua"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-ink-950">Slack</p>
              {connected && <ConnectionStatus>Connected</ConnectionStatus>}
            </div>
            <p className="mt-0.5 text-xs leading-5 text-ink-600">
              Get a compact Slack message whenever a new lead signs up.
            </p>
          </div>
        </div>
        <ConnectionChevron />
      </summary>

      <div className="space-y-4 border-t border-ink-200 p-4">
        <Field
          label="Slack incoming-webhook URL"
          hint="In Slack, create an Incoming Webhook, choose its channel, then paste the generated hooks.slack.com URL here. Leave it blank to disconnect."
        >
          <AceternityInput
            autoComplete="new-password"
            onBlur={onCommit}
            onChange={(event) => onPatch({ slackWebhookUrl: event.target.value })}
            placeholder="https://hooks.slack.com/services/..."
            type="password"
            value={account.slackWebhookUrl}
          />
        </Field>

        <div className="flex flex-col gap-3 border-t border-ink-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-ink-500">
            Slack receives the name, email, lead magnet title, and a link to the page. It never blocks the signup or resource email.
          </p>
          <AceternityButton
            disabled={!connected || saveState === 'saving' || testState === 'saving'}
            onClick={onTest}
            size="sm"
            type="button"
            variant="secondary"
          >
            {testState === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
            Send test
          </AceternityButton>
        </div>

        {testMessage && (
          <p className={testState === 'error' ? 'text-xs font-medium text-red-700' : 'text-xs font-medium text-emerald-700'}>
            {testMessage}
          </p>
        )}
      </div>
    </details>
  );
}

function ZapierSetup({
  account,
  onCommit,
  onPatch,
  onTest,
  saveState,
  testMessage,
  testState,
}: {
  account: AccountSettings;
  onCommit: () => void;
  onPatch: (updates: Partial<AccountSettings>) => void;
  onTest: () => void;
  saveState: SaveState;
  testMessage: string;
  testState: SaveState;
}) {
  const connected = Boolean(account.zapierWebhookUrl);

  return (
    <details className={connectionCardClass}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition">
        <div className="flex min-w-0 gap-3">
          <ConnectionIcon icon={Webhook} tone="orange" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-ink-950">Zapier</p>
              {connected && <ConnectionStatus>Connected</ConnectionStatus>}
            </div>
            <p className="mt-0.5 text-xs leading-5 text-ink-600">
              Trigger a Zap whenever a new lead signs up.
            </p>
          </div>
        </div>
        <ConnectionChevron />
      </summary>

      <div className="space-y-4 border-t border-ink-200 p-4">
        <div className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-3 text-xs leading-5 text-ink-600">
          In Zapier, choose <strong>Webhooks by Zapier</strong> as the trigger, select <strong>Catch Hook</strong>, then copy its webhook URL.
        </div>
        <Field
          label="Zapier Catch Hook URL"
          hint="Paste the unique hooks.zapier.com URL from the Test tab. Leave it blank to disconnect."
        >
          <AceternityInput
            autoComplete="new-password"
            onBlur={onCommit}
            onChange={(event) => onPatch({ zapierWebhookUrl: event.target.value })}
            placeholder="https://hooks.zapier.com/hooks/catch/..."
            type="password"
            value={account.zapierWebhookUrl}
          />
        </Field>

        <div className="flex flex-col gap-3 border-t border-ink-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-ink-500">
            Each event includes the lead, signup ID, lead magnet, and public page URL. Zapier never blocks the signup or resource email.
          </p>
          <AceternityButton
            disabled={!connected || saveState === 'saving' || testState === 'saving'}
            onClick={onTest}
            size="sm"
            type="button"
            variant="secondary"
          >
            {testState === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Webhook className="h-3.5 w-3.5" />}
            Send test
          </AceternityButton>
        </div>

        {testMessage && (
          <p className={testState === 'error' ? 'text-xs font-medium text-red-700' : 'text-xs font-medium text-emerald-700'}>
            {testMessage}
          </p>
        )}
      </div>
    </details>
  );
}

function KitConnectionSetup({
  account,
  onAccountUpdated,
}: {
  account: AccountSettings;
  onAccountUpdated: (account: AccountSettings) => void;
}) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('kit');
    if (!result) return;

    if (result === 'connected') setMessage('Kit connected. New signups will sync automatically.');
    if (result === 'denied') setError('Kit connection was cancelled.');
    if (result === 'error') setError('Kit could not be connected. Please try again.');
    url.searchParams.delete('kit');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  async function disconnect() {
    if (disconnecting || !account.kitConnected) return;
    setDisconnecting(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/account/kit', { method: 'DELETE' });
      const data = (await response.json().catch(() => null)) as {
        account?: AccountSettings;
        error?: string;
      } | null;
      if (!response.ok || !data?.account) {
        throw new Error(data?.error || 'Kit could not be disconnected.');
      }
      onAccountUpdated(data.account);
      setMessage('Kit disconnected.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Kit could not be disconnected.');
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <details className={connectionCardClass}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition">
        <div className="flex min-w-0 gap-3">
          <ConnectionIcon icon={Mail} tone="orange" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-ink-950">Kit</p>
              {account.kitConnected && <ConnectionStatus>Connected</ConnectionStatus>}
            </div>
            <p className="mt-0.5 text-xs leading-5 text-ink-600">
              Add every signup to Kit and tag the lead magnet they requested.
            </p>
          </div>
        </div>
        <ConnectionChevron />
      </summary>

      <div className="space-y-4 border-t border-ink-200 p-4">
        {account.kitConnected ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
            <p className="text-sm font-semibold text-emerald-900">
              {account.kitAccountName || 'Kit account'} is connected
            </p>
            <p className="mt-1 text-xs leading-5 text-emerald-800">
              Existing subscribers are updated by email. Each signup receives a “Lead magnet: …” tag in Kit.
            </p>
          </div>
        ) : (
          <p className="text-sm leading-6 text-ink-600">
            Connect with Kit&apos;s secure authorization screen. Magnets never asks you to paste an API key and never exposes Kit credentials in the browser.
          </p>
        )}

        <div className="flex flex-col gap-3 border-t border-ink-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-ink-500">
            Kit sync runs after the resource email is accepted, so a temporary Kit issue never blocks the signup.
          </p>
          {account.kitConnected ? (
            <AceternityButton
              disabled={disconnecting}
              onClick={() => void disconnect()}
              size="sm"
              type="button"
              variant="secondary"
            >
              {disconnecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Disconnect
            </AceternityButton>
          ) : (
            <AceternityButton
              onClick={() => window.location.assign('/api/account/kit/connect')}
              size="sm"
              type="button"
            >
              Connect Kit
            </AceternityButton>
          )}
        </div>

        {message && <p className="text-xs font-medium text-emerald-700">{message}</p>}
        {error && <p className="text-xs font-medium text-red-700" role="alert">{error}</p>}
      </div>
    </details>
  );
}

function PipedriveSetup({
  account,
  onCommit,
  onPatch,
  onTest,
  saveState,
  testMessage,
  testState,
}: {
  account: AccountSettings;
  onCommit: () => void;
  onPatch: (updates: Partial<AccountSettings>) => void;
  onTest: () => void;
  saveState: SaveState;
  testMessage: string;
  testState: SaveState;
}) {
  const connected = Boolean(account.pipedriveApiToken);

  return (
    <details className={connectionCardClass}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition">
        <div className="flex min-w-0 gap-3">
          <BrandConnectionIcon
            alt="Pipedrive"
            src="/brand/pipedrive.svg"
            tone="green"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-ink-950">Pipedrive</p>
              {connected && <ConnectionStatus>Connected</ConnectionStatus>}
            </div>
            <p className="mt-0.5 text-xs leading-5 text-ink-600">
              Create or update a person for each signup using their email address.
            </p>
          </div>
        </div>
        <ConnectionChevron />
      </summary>
      <div className="space-y-4 border-t border-ink-200 p-4">
        <Field
          label="Pipedrive API token"
          hint="In Pipedrive, open Personal preferences, then API. Paste the API token here. Leave it blank to disconnect."
        >
          <AceternityInput
            autoComplete="new-password"
            onBlur={onCommit}
            onChange={(event) => onPatch({ pipedriveApiToken: event.target.value })}
            placeholder="Paste your Pipedrive API token"
            type="password"
            value={account.pipedriveApiToken}
          />
        </Field>
        <div className="flex flex-col gap-3 border-t border-ink-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-ink-500">
            Existing contacts are matched by email. Pipedrive sync never blocks the signup or resource email.
          </p>
          <AceternityButton
            disabled={!connected || saveState === 'saving' || testState === 'saving'}
            onClick={onTest}
            size="sm"
            type="button"
            variant="secondary"
          >
            {testState === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Test connection
          </AceternityButton>
        </div>
        {testMessage && (
          <p className={testState === 'error' ? 'text-xs font-medium text-red-700' : 'text-xs font-medium text-emerald-700'}>
            {testMessage}
          </p>
        )}
      </div>
    </details>
  );
}

export function DashboardClient({
  initialData,
}: {
  initialData: DashboardBasePayload;
}) {
  const initialAccount = initialData.account;
  const [account, setAccount] = useState<AccountSettings>(initialAccount);
  const [sectionState, setSectionState] = useState<Record<SaveSection, SaveState>>({
    delivery: 'idle',
    publishing: 'idle',
  });
  const [publishingStatusVersion, setPublishingStatusVersion] = useState(0);
  const [error, setError] = useState('');
  const [slackTestState, setSlackTestState] = useState<SaveState>('idle');
  const [slackTestMessage, setSlackTestMessage] = useState('');
  const [zapierTestState, setZapierTestState] = useState<SaveState>('idle');
  const [zapierTestMessage, setZapierTestMessage] = useState('');
  const [pipedriveTestState, setPipedriveTestState] = useState<SaveState>('idle');
  const [pipedriveTestMessage, setPipedriveTestMessage] = useState('');
  // Once a value is committed (for example, a root domain is attached),
  // we hide the input behind a LockedField. Setting one of these to true
  // re-reveals the input until the next save.
  const [unlockDomain, setUnlockDomain] = useState(false);
  const [customDomainOpen, setCustomDomainOpen] = useState(false);

  // We commit on blur instead of making the user click Save. The dirty refs
  // tell us whether a section has unsaved edits — without that flag every
  // focus-change would fire a no-op PUT.
  const dirty = useRef<Record<SaveSection, boolean>>({ delivery: false, publishing: false });
  // The latest account snapshot, kept in a ref so the blur handler doesn't
  // close over a stale `account` from the render that registered it.
  const accountRef = useRef(account);
  accountRef.current = account;

  useEffect(() => {
    accountRef.current = initialAccount;
    setAccount(initialAccount);
    dirty.current = { delivery: false, publishing: false };
    setSectionState({ delivery: 'idle', publishing: 'idle' });
    setPublishingStatusVersion((version) => version + 1);
    setError('');
    setSlackTestState('idle');
    setSlackTestMessage('');
    setZapierTestState('idle');
    setZapierTestMessage('');
    setPipedriveTestState('idle');
    setPipedriveTestMessage('');
    setUnlockDomain(false);
    setCustomDomainOpen(false);
  }, [initialAccount]);

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
          username: snapshot.username,
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
          slackWebhookUrl: snapshot.slackWebhookUrl,
          zapierWebhookUrl: snapshot.zapierWebhookUrl,
          pipedriveApiToken: snapshot.pipedriveApiToken,
          calendarWebhookEnabled: snapshot.calendarWebhookEnabled,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || 'Configuration could not be saved');
      }

      const data = (await response.json()) as {
        account: AccountSettings;
        attachError?: string | null;
        detachError?: string | null;
      };
      accountRef.current = data.account;
      setAccount(data.account);
      dirty.current[section] = false;
      // After a successful publishing save, re-lock the custom-domain fields.
      if (section === 'publishing') {
        setUnlockDomain(false);
        setPublishingStatusVersion((version) => version + 1);
      }
      setSaveState(section, 'saved');
      if (section === 'publishing' && (data.attachError || data.detachError)) {
        setError(data.attachError || data.detachError || '');
      }
      return data.account;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSaveState(section, 'error');
      return null;
    }
  }

  async function testSlack() {
    setSlackTestState('saving');
    setSlackTestMessage('');

    const savedAccount = dirty.current.delivery
      ? await saveAccount('delivery')
      : accountRef.current;

    if (!savedAccount) {
      setSlackTestState('error');
      setSlackTestMessage('Save the Slack webhook first, then try the test again.');
      return;
    }

    if (!savedAccount.slackWebhookUrl) {
      setSlackTestState('error');
      setSlackTestMessage('Add a Slack incoming-webhook URL before sending a test.');
      return;
    }

    try {
      const response = await fetch('/api/account/slack/test', { method: 'POST' });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || 'Could not send a Slack test notification.');
      setSlackTestState('saved');
      setSlackTestMessage('Test notification sent.');
    } catch (testError) {
      setSlackTestState('error');
      setSlackTestMessage(
        testError instanceof Error ? testError.message : 'Could not send a Slack test notification.'
      );
    }
  }

  async function testPipedrive() {
    setPipedriveTestState('saving');
    setPipedriveTestMessage('');
    const savedAccount = dirty.current.delivery ? await saveAccount('delivery') : accountRef.current;
    if (!savedAccount?.pipedriveApiToken) {
      setPipedriveTestState('error');
      setPipedriveTestMessage('Add a Pipedrive API token before testing the connection.');
      return;
    }
    try {
      const response = await fetch('/api/account/pipedrive/test', { method: 'POST' });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || 'Could not test the Pipedrive connection.');
      setPipedriveTestState('saved');
      setPipedriveTestMessage('Pipedrive is connected.');
    } catch (testError) {
      setPipedriveTestState('error');
      setPipedriveTestMessage(testError instanceof Error ? testError.message : 'Could not test the Pipedrive connection.');
    }
  }

  async function testZapier() {
    setZapierTestState('saving');
    setZapierTestMessage('');
    const savedAccount = dirty.current.delivery ? await saveAccount('delivery') : accountRef.current;
    if (!savedAccount?.zapierWebhookUrl) {
      setZapierTestState('error');
      setZapierTestMessage('Add a Zapier Catch Hook URL before sending a test.');
      return;
    }
    try {
      const response = await fetch('/api/account/zapier/test', { method: 'POST' });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || 'Could not send a Zapier test webhook.');
      setZapierTestState('saved');
      setZapierTestMessage('Test event sent. Return to Zapier and test the trigger.');
    } catch (testError) {
      setZapierTestState('error');
      setZapierTestMessage(testError instanceof Error ? testError.message : 'Could not send a Zapier test webhook.');
    }
  }

  const platformHost = account.username ? `magnets.so/${account.username}` : 'magnets.so/username';
  const pageSubdomain = account.subdomain || 'get';
  const configuredDomain = account.domain.trim();
  const displayDomain = configuredDomain || 'example.com';
  const pageHost = `${pageSubdomain}.${displayDomain}`;
  const resendConfigured = account.resendConfigured;
  const hasCustomSender = Boolean(account.resendFromEmail.trim());
  const customSenderConfigured = hasCustomSender && account.resendConfigured;

  return (
    <>
      <PageHeader title="Workspace setup" subtitle="Manage your publishing address, email delivery, and connections" />
      <div className="mx-auto max-w-5xl space-y-5">
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</p>}

        <section className="dashboard-hero-panel overflow-hidden rounded-2xl border border-ink-200 bg-[radial-gradient(circle_at_6%_0%,rgba(254,111,52,0.13),transparent_32%),linear-gradient(135deg,#fff,#faf9f7)] px-5 py-6 shadow-[0_18px_60px_-48px_rgba(17,17,17,0.5)] sm:px-7 sm:py-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-orange/20 bg-brand-orange/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-700">
                <Sparkles className="h-3 w-3 text-brand-orange" />
                Workspace essentials
              </span>
              <h2 className="mt-4 text-2xl font-semibold tracking-[-0.025em] text-ink-950 sm:text-3xl">Set up once, then get back to creating</h2>
              <p className="mt-2 text-sm leading-6 text-ink-600 sm:text-base">Your Magnets URL is the only required setting. Domains and integrations stay out of the way until you need them.</p>
            </div>
            <div className="dashboard-glass-stat min-w-0 rounded-xl border border-white bg-white/85 px-4 py-3 shadow-sm backdrop-blur md:w-72">
              <div className="flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full', account.username ? 'bg-emerald-500' : 'bg-amber-500')} />
                <p className="text-xs font-semibold text-ink-900">{account.username ? 'Public URL ready' : 'Choose your public URL'}</p>
              </div>
              <p className="mt-1 truncate font-mono text-xs text-ink-500">{account.domainAttachedHost ? pageHost : platformHost}</p>
            </div>
          </div>
        </section>

        <AceternityCard className="overflow-hidden rounded-2xl p-0">
          <div className="p-5 sm:p-7">
          <div className="space-y-6">
            <SectionHeader
              description="This is the link you can share immediately. A custom domain is completely optional."
              icon={Globe2}
              title="Public URL"
            />

            <div className="space-y-5">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <Field
                  label="Magnets URL"
                  hint="Lowercase letters, numbers, and hyphens."
                >
                  <div className="flex h-11 items-stretch overflow-hidden rounded-lg border border-ink-200 bg-white focus-within:border-brand-orange focus-within:ring-2 focus-within:ring-brand-orange/15">
                    <span className="flex shrink-0 items-center border-r border-ink-200 bg-ink-50 px-3 font-mono text-sm text-ink-500">
                      magnets.so/
                    </span>
                    <input
                      className="min-w-0 flex-1 bg-transparent px-3 text-sm text-ink-900 outline-none placeholder:text-ink-400"
                      maxLength={40}
                      onBlur={() => commitSection('publishing')}
                      onChange={(event) => patchAccount({ username: event.target.value.toLowerCase() }, 'publishing')}
                      placeholder="your-brand"
                      value={account.username}
                    />
                  </div>
                </Field>

                <div className="rounded-xl border border-ink-200 bg-ink-50 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-ink-400">Share this link</p>
                  <p className="mt-1.5 truncate font-mono text-sm text-ink-900" title={account.domainAttachedHost ? pageHost : platformHost}>
                    {account.domainAttachedHost ? pageHost : platformHost}
                  </p>
                </div>
              </div>

              <details
                className="group rounded-xl border border-ink-200 bg-ink-50/70 transition open:bg-white open:shadow-[0_12px_35px_-28px_rgba(17,17,17,0.45)]"
                onToggle={(event) => setCustomDomainOpen(event.currentTarget.open)}
                open={customDomainOpen}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3.5 transition hover:bg-white">
                  <div className="flex min-w-0 gap-3">
                    <ConnectionIcon icon={Globe2} tone="aqua" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-ink-950">Custom domain</p>
                        {account.domainAttachedHost && <ConnectionStatus>Connected</ConnectionStatus>}
                      </div>
                      <p className="mt-0.5 text-xs leading-5 text-ink-600">
                        {account.domainAttachedHost
                          ? `${pageHost} is live and serving your pages.`
                          : 'Use your own domain whenever you are ready. Your Magnets link already works.'}
                      </p>
                    </div>
                  </div>
                  <ConnectionChevron />
                </summary>
                <div className="space-y-5 border-t border-ink-200 p-4">
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

                  {customDomainOpen && (
                    <PublishingWizard
                      hasDomain={Boolean(configuredDomain)}
                      refreshKey={publishingStatusVersion}
                    />
                  )}
                </div>
              </details>

              <SaveStatus state={sectionState.publishing} />
            </div>
          </div>
          </div>
        </AceternityCard>

        <AceternityCard className="overflow-hidden p-0">
          <details className="optional-connections-drawer">
            <summary className="connection-section-header flex cursor-pointer list-none items-center justify-between gap-4 bg-brand-soft px-6 py-5 transition hover:bg-brand-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange [&::-webkit-details-marker]:hidden">
              <div className="flex min-w-0 items-start gap-3">
                <ConnectionIcon icon={BriefcaseBusiness} tone="orange" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-950">Optional connections</p>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-600">
                    Your page and first email work without these. Add a connection only when it helps your workflow.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {account.resendConfigured && <ConnectionStatus>Email ready</ConnectionStatus>}
                <span className="optional-connections-chevron connection-chevron flex h-8 w-8 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-700 transition-transform">
                  <ChevronDown aria-hidden="true" className="h-4 w-4" />
                </span>
              </div>
            </summary>
            <div className="space-y-6 border-t border-ink-200 p-4 sm:p-6">
              <section>
                <div className="mb-2 flex items-center justify-between gap-3 px-1">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">Email &amp; scheduling</h3>
                    <p className="mt-1 text-xs text-ink-500">Where messages come from and when sequences should stop.</p>
                  </div>
                  <ConnectionStatus tone={account.resendManagedByPlatform ? 'platform' : account.resendConfigured ? 'connected' : 'pending'}>
                    {account.resendConfigured ? 'Sending ready' : 'Needs attention'}
                  </ConnectionStatus>
                </div>
                <div className="grid items-start gap-px overflow-hidden rounded-xl border border-ink-200 bg-ink-200 lg:grid-cols-2">
              <details className={connectionCardClass}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition">
                  <div className="flex min-w-0 gap-3">
                    <ConnectionIcon icon={Mail} tone="orange" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-ink-950">Your sender domain</p>
                        {customSenderConfigured && <ConnectionStatus>Configured</ConnectionStatus>}
                        {hasCustomSender && !customSenderConfigured && <ConnectionStatus tone="pending">Needs verification</ConnectionStatus>}
                      </div>
                      <p className="mt-0.5 text-xs leading-5 text-ink-600">
                        {customSenderConfigured
                          ? account.resendFromEmail
                          : hasCustomSender
                            ? 'Finish verification to send from this address.'
                            : 'Send from your own address instead of Magnets.'}
                      </p>
                    </div>
                  </div>
                  <ConnectionChevron />
                </summary>
                <div className="border-t border-ink-200 p-4">
                  <DeliverySection
                    account={{
                      domain: account.domain,
                      domainAttachedHost: account.domainAttachedHost,
                      resendConfigured: account.resendConfigured,
                      resendFromEmail: account.resendFromEmail,
                      resendReturnPath: account.resendReturnPath,
                    }}
                    onCommit={() => commitSection('delivery')}
                    onPatch={(updates) => patchAccount(updates, 'delivery')}
                    saveState={sectionState.delivery}
                  />
                </div>
              </details>

              <CalendarConnectionSetup
                account={account}
                onAccountUpdated={(nextAccount) => {
                  accountRef.current = nextAccount;
                  setAccount(nextAccount);
                  dirty.current.delivery = false;
                }}
                resendConfigured={resendConfigured}
              />
                </div>
              </section>

              <section>
                <div className="mb-2 px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">Automations</h3>
                  <p className="mt-1 text-xs text-ink-500">Send each new signup to the tools your team already uses.</p>
                </div>
                <div className="grid items-start gap-px overflow-hidden rounded-xl border border-ink-200 bg-ink-200 lg:grid-cols-2">
              <SlackNotificationsSetup
                account={account}
                onCommit={() => commitSection('delivery')}
                onPatch={(updates) => patchAccount(updates, 'delivery')}
                onTest={() => void testSlack()}
                saveState={sectionState.delivery}
                testMessage={slackTestMessage}
                testState={slackTestState}
              />

              <ZapierSetup
                account={account}
                onCommit={() => commitSection('delivery')}
                onPatch={(updates) => patchAccount(updates, 'delivery')}
                onTest={() => void testZapier()}
                saveState={sectionState.delivery}
                testMessage={zapierTestMessage}
                testState={zapierTestState}
              />

              <PipedriveSetup
                account={account}
                onCommit={() => commitSection('delivery')}
                onPatch={(updates) => patchAccount(updates, 'delivery')}
                onTest={() => void testPipedrive()}
                saveState={sectionState.delivery}
                testMessage={pipedriveTestMessage}
                testState={pipedriveTestState}
              />

              <KitConnectionSetup
                account={account}
                onAccountUpdated={(nextAccount) => {
                  accountRef.current = nextAccount;
                  setAccount(nextAccount);
                }}
              />
                </div>
              </section>

              <section>
                <div className="mb-2 px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">Audience sync</h3>
                  <p className="mt-1 text-xs text-ink-500">Forward signups into an existing newsletter audience.</p>
                </div>
                <div className="overflow-hidden rounded-xl border border-ink-200 bg-ink-200">
              <details className={connectionCardClass}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition">
                  <div className="flex min-w-0 gap-3">
                    <ConnectionIcon icon={Newspaper} tone="yellow" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-950">Newsletter</p>
                      <p className="mt-0.5 text-xs leading-5 text-ink-600">
                        Forward signups to Beehiiv, Substack, or Kit. They are always saved in Magnets too.
                      </p>
                    </div>
                  </div>
                  <ConnectionChevron />
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
              </section>
            </div>
          </details>
        </AceternityCard>

        <AceternityCard className="overflow-hidden p-0">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 transition hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange [&::-webkit-details-marker]:hidden">
              <div className="flex min-w-0 items-start gap-3">
                <ConnectionIcon icon={ScrollText} tone="orange" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-950">Legal links</p>
                  <p className="mt-1 text-sm leading-6 text-ink-600">
                    Optionally add your own privacy policy and terms to every page footer.
                  </p>
                </div>
              </div>
              <ConnectionChevron />
            </summary>
            <div className="space-y-4 border-t border-ink-200 p-5 sm:p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Privacy policy URL" hint="Leave blank to hide this link.">
                  <AceternityInput
                    inputMode="url"
                    onBlur={() => commitSection('delivery')}
                    onChange={(event) =>
                      patchAccount(
                        {
                          brand: {
                            ...accountRef.current.brand,
                            privacyPolicyUrl: event.target.value,
                          },
                        },
                        'delivery'
                      )
                    }
                    placeholder="https://your-site.com/privacy"
                    type="url"
                    value={account.brand.privacyPolicyUrl}
                  />
                </Field>
                <Field label="Terms URL" hint="Leave blank to hide this link.">
                  <AceternityInput
                    inputMode="url"
                    onBlur={() => commitSection('delivery')}
                    onChange={(event) =>
                      patchAccount(
                        {
                          brand: {
                            ...accountRef.current.brand,
                            termsUrl: event.target.value,
                          },
                        },
                        'delivery'
                      )
                    }
                    placeholder="https://your-site.com/terms"
                    type="url"
                    value={account.brand.termsUrl}
                  />
                </Field>
              </div>
              <SaveStatus state={sectionState.delivery} />
            </div>
          </details>
        </AceternityCard>
      </div>
    </>
  );
}
