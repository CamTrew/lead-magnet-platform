'use client';

import { useCallback, useEffect, useState } from 'react';
import { AtSign, Check, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  AceternityButton,
  AceternityInput,
  Field,
} from '@/components/ui/aceternity';
import { LockedField } from '@/components/dashboard/locked-field';
import { cn } from '@/lib/utils';

type SubdomainStatus = {
  label: string;
  fullHost: string;
  clear: boolean;
  collisions: string[];
};

type SuggestResponse = {
  domain: string;
  candidates: SubdomainStatus[];
  recommended: string | null;
  existingDmarc: string[];
};

type DnsRecord = {
  id: string;
  type: 'CNAME' | 'MX' | 'TXT';
  name: string;
  value: string;
};

type DnsRecordCheck = DnsRecord & {
  status: 'verified' | 'missing' | 'error';
  message: string;
  found: string[];
};

type DnsVerifyResponse = {
  checkedAt: string;
  records: DnsRecordCheck[];
  section: 'delivery';
  status: 'verified' | 'missing' | 'error';
  error?: string;
};

export type DeliveryAccount = {
  domain: string;
  domainAttachedHost: string;
  resendApiKey: string;
  resendFromEmail: string;
  resendReturnPath: string;
};

export type DeliveryPatch = (updates: Partial<DeliveryAccount>) => void;

/**
 * The whole "set up sending" flow rebuilt as a step list.
 *
 * Step 1: Resend key is the responsibility of the parent (already laid out).
 * Step 2: Sender subdomain — we suggest one, user can override, locks once saved.
 * Step 3: Sender local part — user types `hello`; we own the @<sub>.<domain> suffix.
 * Step 4: Sending-domain DNS records — only revealed once step 3 is locked.
 *
 * Editing step 2 or 3 invalidates downstream steps until the user re-saves.
 */
export function DeliverySection({
  account,
  onPatch,
  onSave,
  saveState,
}: {
  account: DeliveryAccount;
  onPatch: DeliveryPatch;
  onSave: () => void;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
}) {
  const [unlockSubdomain, setUnlockSubdomain] = useState(false);
  const [unlockSender, setUnlockSender] = useState(false);
  // Probed via /api/delivery/suggest the first time the user hits the
  // suggest button; we remember it for the rest of the session so we don't
  // re-probe on every render.
  const [apexHasDmarc, setApexHasDmarc] = useState(false);

  const subdomainLocked = Boolean(account.resendReturnPath) && !unlockSubdomain;
  const senderLocked = Boolean(account.resendFromEmail) && !unlockSender;

  // Once a save completes, re-lock everything.
  useEffect(() => {
    if (saveState === 'saved') {
      setUnlockSubdomain(false);
      setUnlockSender(false);
    }
  }, [saveState]);

  return (
    <div className="space-y-3">
      <Step
        active={!subdomainLocked}
        done={subdomainLocked}
        index={1}
        subtitle={
          subdomainLocked
            ? `Your sending records will be under ${account.resendReturnPath}.${account.domain}.`
            : 'Pick a subdomain to put the sending records under, so they don\'t collide with anything you already have.'
        }
        title="Pick your sending subdomain"
      >
        <SubdomainPicker
          account={account}
          dmarcWarning={apexHasDmarc}
          locked={subdomainLocked}
          onConfirmEdit={() => setUnlockSubdomain(true)}
          onDmarcDetected={setApexHasDmarc}
          onLock={() => setUnlockSubdomain(false)}
          onPatch={onPatch}
        />
      </Step>

      <Step
        active={subdomainLocked && !senderLocked}
        blocked={!subdomainLocked}
        done={senderLocked}
        index={2}
        subtitle={
          senderLocked
            ? `Subscribers see ${displayFromAddress(account)} in their inbox.`
            : 'Pick the local part. The domain part stays locked to the subdomain you chose above.'
        }
        title="Set your sender address"
      >
        <SenderPicker
          account={account}
          locked={senderLocked}
          onConfirmEdit={() => setUnlockSender(true)}
          onPatch={onPatch}
        />
      </Step>

      <Step
        active={senderLocked}
        blocked={!senderLocked}
        index={3}
        subtitle={
          senderLocked
            ? 'Add these to your DNS provider, then check.'
            : 'These appear once your sender is set.'
        }
        title="Add the sending DNS records"
      >
        {senderLocked && (
          <SendingDnsChecker
            account={account}
            apexHasDmarc={apexHasDmarc}
          />
        )}
      </Step>

      <div className="flex items-center justify-end gap-2 border-t border-ink-200 pt-4">
        {saveState === 'error' && (
          <span className="inline-flex h-9 items-center rounded-md border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-700">
            Could not save
          </span>
        )}
        <AceternityButton disabled={saveState === 'saving'} onClick={onSave}>
          {saveState === 'saving' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saveState === 'saved' ? (
            <Check className="h-4 w-4" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          {saveState === 'saving' ? 'Saving' : saveState === 'saved' ? 'Saved' : 'Save delivery'}
        </AceternityButton>
      </div>
    </div>
  );
}

function Step({
  active,
  blocked,
  children,
  done,
  index,
  subtitle,
  title,
}: {
  active?: boolean;
  blocked?: boolean;
  children: React.ReactNode;
  done?: boolean;
  index: number;
  subtitle: string;
  title: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-5 transition',
        done && 'border-emerald-200 bg-emerald-50/30',
        !done && active && 'border-ink-300 bg-white',
        !done && blocked && 'border-ink-200 bg-ink-50/50 opacity-60',
        !done && !active && !blocked && 'border-ink-200'
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
            done ? 'border-emerald-300 bg-emerald-500 text-white' : 'border-ink-300 bg-white text-ink-700'
          )}
        >
          {done ? <Check className="h-3.5 w-3.5" /> : index}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-950">{title}</p>
          <p className="mt-1 text-xs leading-5 text-ink-600">{subtitle}</p>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function SubdomainPicker({
  account,
  dmarcWarning,
  locked,
  onConfirmEdit,
  onDmarcDetected,
  onLock,
  onPatch,
}: {
  account: DeliveryAccount;
  dmarcWarning: boolean;
  locked: boolean;
  onConfirmEdit: () => void;
  onDmarcDetected: (has: boolean) => void;
  onLock: () => void;
  onPatch: DeliveryPatch;
}) {
  // When the user picks a subdomain we must also re-stitch the stored
  // resendFromEmail so its suffix matches. Otherwise the locked sender
  // display keeps showing the previously composed `local@oldsub.domain`
  // string even after the subdomain has changed.
  const setReturnPath = (label: string) => {
    const updates: Partial<DeliveryAccount> = { resendReturnPath: label };
    if (account.resendFromEmail && account.domain) {
      const parsed = parseStoredFrom(account.resendFromEmail);
      if (parsed.localPart) {
        const newSuffix = `${label}.${account.domain}`;
        const address = `${parsed.localPart}@${newSuffix}`;
        updates.resendFromEmail = parsed.displayName
          ? `${parsed.displayName} <${address}>`
          : address;
      }
    }
    onPatch(updates);
    // After picking, re-lock so the picker UI collapses back into its
    // 'value chosen' summary. The user still needs to hit Save delivery
    // at the bottom of the section to persist the choice; if they want
    // to change again they click Edit on the lock.
    onLock();
  };
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<SuggestResponse | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [error, setError] = useState('');

  async function suggest() {
    if (suggesting) return;
    setSuggesting(true);
    setError('');
    try {
      const response = await fetch(
        `/api/delivery/suggest?domain=${encodeURIComponent(account.domain)}`,
        { cache: 'no-store' }
      );
      const data = (await response.json().catch(() => null)) as
        | (SuggestResponse & { error?: string })
        | null;
      if (!response.ok) {
        setError(data?.error || 'Could not probe DNS.');
        return;
      }
      setSuggestion(data);
      onDmarcDetected((data?.existingDmarc?.length ?? 0) > 0);
      if (!account.resendReturnPath && data?.recommended) {
        setReturnPath(data.recommended);
      }
    } catch {
      setError('Could not probe DNS.');
    } finally {
      setSuggesting(false);
    }
  }

  if (!account.domain) {
    return (
      <p className="text-xs text-ink-500">
        Set your root domain in Publishing first.
      </p>
    );
  }

  return (
    <LockedField
      confirmDescription={
        <>
          <p>
            Changing your sending subdomain means the DNS records you previously added stop matching what we
            expect. You will need to add the new ones at your DNS provider and re-verify before emails go out.
          </p>
          <p className="mt-2 text-ink-600">Any send attempts between now and verification will fail.</p>
        </>
      }
      confirmTitle="Change your sending subdomain?"
      displayValue={
        <span className="font-mono text-ink-900">
          {account.resendReturnPath}.{account.domain}
        </span>
      }
      locked={locked}
      onConfirmEdit={onConfirmEdit}
    >
      <div className="space-y-3">
        {!suggestion ? (
          <div className="flex flex-wrap items-center gap-2">
            <AceternityButton onClick={suggest} disabled={suggesting} variant="secondary">
              {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Find a clear subdomain
            </AceternityButton>
            {error && <span className="text-xs text-red-700">{error}</span>}
          </div>
        ) : (
          <>
            <p className="text-xs font-medium text-ink-700">
              Suggested subdomains for <span className="font-mono">{account.domain}</span>:
            </p>
            <div className="grid gap-1.5">
              {suggestion.candidates.map((candidate) => (
                <CandidateRow
                  candidate={candidate}
                  key={candidate.label}
                  onPick={() => setReturnPath(candidate.label)}
                  selected={candidate.label === account.resendReturnPath}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-ink-200 pt-3">
              <span className="text-xs font-medium text-ink-700">Or type your own:</span>
              <AceternityInput
                className="h-8 w-32 px-2 text-sm"
                onChange={(event) => setCustomLabel(event.target.value.toLowerCase())}
                placeholder="lead"
                value={customLabel}
              />
              <AceternityButton
                disabled={!customLabel.trim()}
                onClick={() => {
                  if (customLabel.trim()) setReturnPath(customLabel.trim());
                }}
                size="sm"
                variant="secondary"
              >
                Use this
              </AceternityButton>
            </div>

            {account.resendReturnPath && (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                Records will live under {account.resendReturnPath}.{account.domain}.
              </p>
            )}
          </>
        )}

        {dmarcWarning && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            We detected a DMARC policy at {account.domain}. We will skip adding ours so we don&apos;t
            overwrite yours. Edit your existing DMARC if you want to align it with this sender.
          </p>
        )}
      </div>
    </LockedField>
  );
}

function CandidateRow({
  candidate,
  onPick,
  selected,
}: {
  candidate: SubdomainStatus;
  onPick: () => void;
  selected: boolean;
}) {
  const clear = candidate.clear;
  return (
    <button
      className={cn(
        'flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition',
        selected ? 'border-ink-950 bg-ink-50' : 'border-ink-200 bg-white hover:bg-ink-50',
        !clear && 'opacity-80'
      )}
      onClick={onPick}
      type="button"
    >
      <span className="font-mono text-ink-900">{candidate.fullHost}</span>
      <span
        className={cn(
          'inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-medium',
          clear
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-amber-200 bg-amber-50 text-amber-800'
        )}
        title={clear ? 'Nothing else lives here' : candidate.collisions.join(', ')}
      >
        {clear ? 'Clear' : 'In use'}
      </span>
    </button>
  );
}

function SenderPicker({
  account,
  locked,
  onConfirmEdit,
  onPatch,
}: {
  account: DeliveryAccount;
  locked: boolean;
  onConfirmEdit: () => void;
  onPatch: DeliveryPatch;
}) {
  // We store the canonical "Display Name <local@sub.domain>" string in
  // resendFromEmail, but the UI only exposes the local part. Anything between
  // the angle brackets is the address; we rewrite the whole field when the
  // local part changes.
  const suffix = account.resendReturnPath && account.domain
    ? `${account.resendReturnPath}.${account.domain}`
    : '';
  const parsed = parseStoredFrom(account.resendFromEmail);
  const localPart = parsed.localPart;
  const displayName = parsed.displayName;

  function update(next: { localPart?: string; displayName?: string }) {
    const newLocal = (next.localPart ?? localPart).replace(/[^a-zA-Z0-9._+-]/g, '');
    const newDisplay = (next.displayName ?? displayName).trim();
    if (!newLocal || !suffix) {
      onPatch({ resendFromEmail: '' });
      return;
    }
    const address = `${newLocal}@${suffix}`;
    const composed = newDisplay ? `${newDisplay} <${address}>` : address;
    onPatch({ resendFromEmail: composed });
  }

  return (
    <LockedField
      confirmDescription={
        <>
          <p>
            Changing your sender address means subscribers see the new one on emails that go out from now on.
            Open or in-flight sends may keep the old address.
          </p>
        </>
      }
      confirmTitle="Change your sender address?"
      displayValue={
        <span className="font-mono text-ink-900">{displayFromAddress(account) || 'No sender set'}</span>
      }
      locked={locked}
      onConfirmEdit={onConfirmEdit}
    >
      <div className="grid gap-3">
        <Field label="Display name (optional)" hint="Shown in the inbox as the sender's name.">
          <AceternityInput
            maxLength={80}
            onChange={(event) => update({ displayName: event.target.value })}
            placeholder="Your Brand"
            value={displayName}
          />
        </Field>
        <Field
          label="Sender address"
          hint={`The part before @ is up to you. The suffix is locked to the subdomain you chose above.`}
        >
          <div className="flex h-9 items-stretch overflow-hidden rounded-md border border-ink-200 bg-white focus-within:border-ink-950 focus-within:ring-1 focus-within:ring-ink-950">
            <AtSign className="my-auto ml-2 h-3.5 w-3.5 shrink-0 text-ink-400" />
            <input
              className="min-w-0 flex-1 bg-transparent px-2 text-sm text-ink-900 outline-none placeholder:text-ink-400"
              maxLength={64}
              onChange={(event) => update({ localPart: event.target.value.toLowerCase() })}
              placeholder="hello"
              value={localPart}
            />
            <span className="flex shrink-0 items-center border-l border-ink-200 bg-ink-50 px-3 font-mono text-xs text-ink-600">
              @{suffix || 'pick subdomain first'}
            </span>
          </div>
        </Field>
      </div>
    </LockedField>
  );
}

/**
 * What to show in the inbox preview. We always compose from the local part of
 * the stored sender + the current `<returnPath>.<domain>` suffix so the UI
 * stays consistent even when the user has changed the subdomain since the
 * sender was last saved.
 */
function displayFromAddress(account: DeliveryAccount): string {
  const suffix = account.resendReturnPath && account.domain
    ? `${account.resendReturnPath}.${account.domain}`
    : '';
  if (!suffix) return account.resendFromEmail || '';
  const parsed = parseStoredFrom(account.resendFromEmail);
  if (!parsed.localPart) return account.resendFromEmail || '';
  const address = `${parsed.localPart}@${suffix}`;
  return parsed.displayName ? `${parsed.displayName} <${address}>` : address;
}

function parseStoredFrom(stored: string): { displayName: string; localPart: string } {
  const trimmed = stored.trim();
  if (!trimmed) return { displayName: '', localPart: '' };
  const bracket = trimmed.match(/^(.*?)\s*<([^<>]+)>\s*$/);
  if (bracket) {
    const local = bracket[2].split('@')[0] || '';
    return { displayName: bracket[1].trim(), localPart: local };
  }
  const at = trimmed.split('@');
  return { displayName: '', localPart: at[0] || '' };
}

function SendingDnsChecker({
  account,
  apexHasDmarc,
}: {
  account: DeliveryAccount;
  apexHasDmarc: boolean;
}) {
  const [checking, setChecking] = useState(false);
  const [records, setRecords] = useState<DnsRecordCheck[]>([]);
  const [overall, setOverall] = useState<'idle' | 'verified' | 'missing' | 'error'>('idle');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState('');

  const check = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    setError('');
    setCooldown('');
    try {
      const response = await fetch('/api/dns/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'delivery',
          domain: account.domain,
          subdomain: '',
          resendFromEmail: account.resendFromEmail,
        }),
      });
      if (response.status === 429) {
        setCooldown(formatRetry(response));
        return;
      }
      const data = (await response.json().catch(() => null)) as
        | (DnsVerifyResponse & { error?: string })
        | null;
      if (!response.ok || !data) {
        setError(data?.error || 'DNS check failed.');
        return;
      }
      // Strip DMARC if the user already has their own.
      const filtered = apexHasDmarc
        ? data.records.filter((r) => !r.id.toLowerCase().includes('dmarc'))
        : data.records;
      setRecords(filtered);
      setOverall(data.status);
    } catch {
      setError('DNS check failed.');
    } finally {
      setChecking(false);
    }
  }, [account.domain, account.resendFromEmail, apexHasDmarc, checking]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <AceternityButton disabled={checking} onClick={check} variant="secondary">
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Reveal and check records
        </AceternityButton>
        {overall === 'verified' && (
          <span className="inline-flex h-7 items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs font-medium text-emerald-700">
            Verified
          </span>
        )}
        {overall === 'missing' && (
          <span className="inline-flex h-7 items-center rounded-md border border-amber-200 bg-amber-50 px-2 text-xs font-medium text-amber-800">
            Some records are missing
          </span>
        )}
        {overall === 'error' && (
          <span className="inline-flex h-7 items-center rounded-md border border-red-200 bg-red-50 px-2 text-xs font-medium text-red-700">
            Check hit an error
          </span>
        )}
        {cooldown && <span className="text-xs text-ink-500">{cooldown}</span>}
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>

      {records.length > 0 && (
        <div className="overflow-hidden rounded-md border border-ink-200">
          {records.map((record) => (
            <RecordRow key={record.id} record={record} />
          ))}
        </div>
      )}

      {apexHasDmarc && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          You already have a DMARC policy at the apex. We left it alone. If your DMARC policy is set to
          <span className="mx-1 font-mono">p=quarantine</span> or
          <span className="mx-1 font-mono">p=reject</span>, make sure it accepts mail signed by this sender.
        </p>
      )}
    </div>
  );
}

function RecordRow({ record }: { record: DnsRecordCheck }) {
  const verified = record.status === 'verified';
  return (
    <div className="grid gap-2 border-t border-ink-200 px-3 py-2 first:border-t-0 sm:grid-cols-[60px_minmax(0,1fr)_minmax(0,1.6fr)_90px]">
      <span className="font-mono text-xs text-ink-700">{record.type}</span>
      <code className="break-all rounded bg-ink-50 px-2 py-1 text-xs text-ink-900">{record.name}</code>
      <code className="break-all rounded bg-ink-50 px-2 py-1 text-xs text-ink-900">{record.value}</code>
      <span
        className={cn(
          'inline-flex h-7 w-fit items-center rounded-md border px-2 text-[11px] font-medium',
          verified
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : record.status === 'missing'
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-red-200 bg-red-50 text-red-700'
        )}
        title={record.message}
      >
        {verified ? 'Verified' : record.status === 'missing' ? 'Missing' : 'Error'}
      </span>
    </div>
  );
}

function formatRetry(response: Response) {
  const retry = Number(response.headers.get('Retry-After') || 120);
  if (!Number.isFinite(retry) || retry <= 0) {
    return 'Wait a couple of minutes before checking again.';
  }
  if (retry >= 60) {
    const m = Math.ceil(retry / 60);
    return `Wait ${m} minute${m === 1 ? '' : 's'} before checking again.`;
  }
  return `Wait ${retry} seconds before checking again.`;
}
