'use client';

import { useCallback, useEffect, useState } from 'react';
import { AtSign, Check, Loader2, RefreshCw } from 'lucide-react';
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
  providerVerification?: {
    status: 'verified' | 'requested' | 'error';
    message: string;
  } | null;
  section: 'delivery';
  status: 'verified' | 'missing' | 'error';
  error?: string;
};

export type DeliveryAccount = {
  domain: string;
  domainAttachedHost: string;
  resendConfigured: boolean;
  resendFromEmail: string;
  resendReturnPath: string;
};

export type DeliveryPatch = (updates: Partial<DeliveryAccount>) => void;

/**
 * The whole "set up sending" flow rebuilt as a step list.
 *
 * Step 1: Sender subdomain — we suggest one, user can override, locks once saved.
 * Step 2: Sender local part — user types `hello`; we own the @<sub>.<domain> suffix.
 * Step 3: Sending-domain DNS records — only revealed once step 2 is locked.
 *
 * Editing step 2 or 3 invalidates downstream steps until the user re-saves.
 */
export function DeliverySection({
  account,
  onCommit,
  onPatch,
  saveState,
}: {
  account: DeliveryAccount;
  /** Persist whatever's been patched. Wired into the natural commit points
   *  (subdomain picked, sender blur) so the user never has to click Save. */
  onCommit: () => void;
  onPatch: DeliveryPatch;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
}) {
  const [unlockSubdomain, setUnlockSubdomain] = useState(false);
  const [unlockDns, setUnlockDns] = useState(false);
  // Lifted from SendingDnsChecker so we can collapse Step 3 into a "Verified"
  // summary once every record resolves, matching the lock pattern Steps 1 & 2
  // use. The checker still owns the per-record state internally.
  const [dnsVerified, setDnsVerified] = useState(false);
  // Probed via /api/delivery/suggest the first time the user hits the
  // suggest button; we remember it for the rest of the session so we don't
  // re-probe on every render.
  const [apexHasDmarc, setApexHasDmarc] = useState(false);

  const subdomainLocked = Boolean(account.resendReturnPath) && !unlockSubdomain;
  const senderLocked = Boolean(account.resendFromEmail);
  const dnsLocked = dnsVerified && !unlockDns;

  // Once a save completes, re-lock everything.
  useEffect(() => {
    if (saveState === 'saved') {
      setUnlockSubdomain(false);
    }
  }, [saveState]);

  // Sender or return-path change → the records we just verified no longer
  // apply, so drop the verified state and let Step 3 re-prompt for a check.
  useEffect(() => {
    setDnsVerified(false);
  }, [account.resendFromEmail, account.resendReturnPath]);

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
          onCommit={onCommit}
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
          onCommit={onCommit}
          onPatch={onPatch}
        />
      </Step>

      <Step
        active={senderLocked && !dnsLocked}
        blocked={!senderLocked}
        done={dnsLocked}
        index={3}
        subtitle={
          dnsLocked
            ? 'All sending DNS records resolved. Sending is ready.'
            : senderLocked
              ? 'Add these to your DNS provider, then check.'
              : 'These appear once your sender is set.'
        }
        title="Add the sending DNS records"
      >
        {dnsLocked ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-emerald-900">
              <Check className="completion-tick h-3.5 w-3.5" />
              Verified
            </div>
            <button
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-2 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
              onClick={() => setUnlockDns(true)}
              type="button"
            >
              Re-check
            </button>
          </div>
        ) : (
          senderLocked && (
            <SendingDnsChecker
              account={account}
              apexHasDmarc={apexHasDmarc}
              onVerifiedChange={(verified) => {
                setDnsVerified(verified);
                if (verified) setUnlockDns(false);
              }}
            />
          )
        )}
      </Step>

      {saveState !== 'idle' && (
        <div
          className={cn(
            'flex items-center justify-end gap-1.5 border-t border-ink-200 pt-3 text-xs',
            saveState === 'error' ? 'text-red-700' : saveState === 'saved' ? 'text-emerald-700' : 'text-ink-500'
          )}
        >
          {saveState === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saveState === 'saved' && <Check className="completion-tick h-3.5 w-3.5" />}
          {saveState === 'saving'
            ? 'Saving…'
            : saveState === 'saved'
              ? 'Saved'
              : 'Could not save — try editing again.'}
        </div>
      )}
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
            done ? 'status-check-icon border-emerald-300 bg-emerald-500 text-white' : 'border-ink-300 bg-white text-ink-700'
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
  onCommit,
  onConfirmEdit,
  onDmarcDetected,
  onLock,
  onPatch,
}: {
  account: DeliveryAccount;
  dmarcWarning: boolean;
  locked: boolean;
  onCommit: () => void;
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
    // Picking is the commit — push to the server immediately and collapse
    // the picker UI back to its 'value chosen' summary. The patch above
    // queues the new state for the next React render; we defer the commit
    // by a tick so the parent's accountRef has the new value before the
    // PUT payload is built.
    onLock();
    setTimeout(onCommit, 0);
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
  onCommit,
  onPatch,
}: {
  account: DeliveryAccount;
  onCommit: () => void;
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
    <div className="grid gap-3">
      <Field label="Display name (optional)" hint="Shown in the inbox as the sender's name.">
        <AceternityInput
          maxLength={80}
          onBlur={onCommit}
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
            onBlur={onCommit}
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
  onVerifiedChange,
}: {
  account: DeliveryAccount;
  apexHasDmarc: boolean;
  onVerifiedChange: (verified: boolean) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [records, setRecords] = useState<DnsRecordCheck[]>([]);
  const [overall, setOverall] = useState<'idle' | 'verified' | 'missing' | 'error'>('idle');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState('');
  const [providerVerification, setProviderVerification] = useState<DnsVerifyResponse['providerVerification']>(null);

  const check = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    setError('');
    setCooldown('');
    setProviderVerification(null);
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
      setProviderVerification(data.providerVerification || null);
      // Strip DMARC if the user already has their own.
      const filtered = apexHasDmarc
        ? data.records.filter((r) => !r.id.toLowerCase().includes('dmarc'))
        : data.records;
      setRecords(filtered);
      // Verified-from-client's-perspective: every record we *show* the user
      // resolves. The server's `data.status` can disagree when we hide DMARC
      // (the user has their own at the apex) — we don't want that to keep
      // Step 3 expanded forever.
      const allVerified = filtered.length > 0 && filtered.every((r) => r.status === 'verified');
      setOverall(allVerified ? 'verified' : data.status);
    } catch {
      setError('DNS check failed.');
    } finally {
      setChecking(false);
    }
  }, [account.domain, account.resendFromEmail, apexHasDmarc, checking]);

  // Tell the parent whenever the overall verdict flips so it can collapse
  // Step 3 once everything resolves.
  useEffect(() => {
    const providerReady = !providerVerification || providerVerification.status === 'verified';
    onVerifiedChange(overall === 'verified' && providerReady);
  }, [overall, onVerifiedChange, providerVerification]);

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

      {providerVerification && (
        <p
          className={cn(
            'rounded-md border px-3 py-2 text-xs leading-5',
            providerVerification.status === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : providerVerification.status === 'verified'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-blue-200 bg-blue-50 text-blue-800'
          )}
        >
          {providerVerification.message}
        </p>
      )}

      {records.length > 0 && (
        <>
          <p className="text-xs leading-5 text-ink-500">
            <span className="font-medium text-ink-700">Required</span> records prove the email is from you. Skipping them
            quietly tanks deliverability. <span className="font-medium text-ink-700">Recommended</span> records handle
            bounces and protect long-term sender reputation. <span className="font-medium text-ink-700">Optional</span>{' '}
            records you can skip if you already have your own at the apex.
          </p>
          <div className="overflow-hidden rounded-md border border-ink-200">
            {records.map((record) => (
              <RecordRow key={record.id} record={record} />
            ))}
          </div>
        </>
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

type RecordImportance = 'required' | 'recommended' | 'optional';

/**
 * Classify each Resend-supplied record so the UI can tell the user which ones
 * actually matter for deliverability:
 *  - SPF (TXT) + DKIM (CNAME at resend._domainkey...) are required. Without
 *    these, big mailbox providers treat your mail as unauthenticated and your
 *    open rates degrade over weeks.
 *  - MX (return-path for bounces) is recommended. Skipping it means Resend
 *    can't manage your suppression list and reputation slowly accumulates
 *    bad-address dings.
 *  - DMARC is optional from our side. We already skip showing it when the
 *    apex has one, but if it slips through, treat as optional so users feel
 *    safe leaving theirs untouched.
 *
 * Classification is by ID first (Resend always names them email-spf-*,
 * email-dkim-*, etc.) with a name-substring fallback for safety.
 */
function recordImportance(record: DnsRecordCheck): RecordImportance {
  const id = record.id.toLowerCase();
  const name = record.name.toLowerCase();

  if (id.includes('dmarc') || name.includes('_dmarc')) return 'optional';
  if (id.includes('mx') || record.type === 'MX') return 'recommended';
  if (
    id.includes('spf') ||
    id.includes('dkim') ||
    name.includes('_domainkey') ||
    (record.type === 'TXT' && record.value.toLowerCase().startsWith('v=spf1'))
  ) {
    return 'required';
  }

  // Unknown? Be conservative and tell the user it's recommended.
  return 'recommended';
}

const IMPORTANCE_LABEL: Record<RecordImportance, string> = {
  required: 'Required',
  recommended: 'Recommended',
  optional: 'Optional',
};

const IMPORTANCE_HINT: Record<RecordImportance, string> = {
  required: 'Skipping this means mailbox providers can\'t verify it\'s really you sending.',
  recommended: 'Skipping is OK to start, but bounce handling and long-term deliverability suffer.',
  optional: 'Safe to skip if you already have a record for this at your apex.',
};

const IMPORTANCE_TONE: Record<RecordImportance, string> = {
  required: 'border-rose-200 bg-rose-50 text-rose-700',
  recommended: 'border-amber-200 bg-amber-50 text-amber-800',
  optional: 'border-zinc-200 bg-zinc-50 text-zinc-600',
};

function RecordRow({ record }: { record: DnsRecordCheck }) {
  const verified = record.status === 'verified';
  const importance = recordImportance(record);
  return (
    <div className="grid gap-2 border-t border-ink-200 px-3 py-2 first:border-t-0 sm:grid-cols-[60px_minmax(0,1fr)_minmax(0,1.6fr)_180px]">
      <span className="font-mono text-xs text-ink-700">{record.type}</span>
      <code className="break-all rounded bg-ink-50 px-2 py-1 text-xs text-ink-900">{record.name}</code>
      <code className="break-all rounded bg-ink-50 px-2 py-1 text-xs text-ink-900">{record.value}</code>
      <div className="flex flex-wrap items-center gap-1.5">
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
        <span
          className={cn(
            'inline-flex h-7 w-fit items-center rounded-md border px-2 text-[11px] font-medium',
            IMPORTANCE_TONE[importance]
          )}
          title={IMPORTANCE_HINT[importance]}
        >
          {IMPORTANCE_LABEL[importance]}
        </span>
      </div>
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
