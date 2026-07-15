'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Globe2,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { AceternityButton } from '@/components/ui/aceternity';
import type { DomainStage } from '@/lib/types';
import { cn } from '@/lib/utils';

type DnsRecord = {
  type: string;
  name: string;
  value: string;
  fullName?: string;
  reason?: string;
};

type StatusResponse = {
  stage: DomainStage;
  host: string;
  verificationRecord: DnsRecord | null;
  cnameRecord: DnsRecord | null;
  platformVerificationRecords: DnsRecord[];
  liveStatus: {
    verified: boolean;
    misconfigured: boolean;
    configured?: boolean;
    issue?: 'deployment_not_found' | 'check_failed' | 'invalid_dns';
  } | null;
  attachedHost: string;
  verifiedAt: string | null;
};

export function PublishingWizard({
  hasDomain,
  refreshKey = 0,
}: {
  hasDomain: boolean;
  refreshKey?: number;
}) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [checkingRouting, setCheckingRouting] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string>('');
  const [verifyError, setVerifyError] = useState<string>('');
  const [verifyFound, setVerifyFound] = useState<string[]>([]);
  const [attachError, setAttachError] = useState<string>('');
  const refreshInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7_000);

    try {
      const response = await fetch('/api/domain/status', {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status !== 401) {
          setVerifyError('Could not load domain status.');
        }
        return;
      }
      const data = (await response.json()) as StatusResponse;
      setStatus(data);
    } catch {
      setVerifyError('Could not load domain status.');
    } finally {
      window.clearTimeout(timeout);
      refreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, refreshKey]);

  // Poll while we're waiting for DNS propagation.
  useEffect(() => {
    if (!status) return;
    if (status.stage !== 'attached-pending') return;
    const handle = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15_000);
    return () => window.clearInterval(handle);
  }, [refresh, status]);

  async function verifyOwnership() {
    if (verifying) return;
    setVerifying(true);
    setVerifyError('');
    setVerifyMessage('');
    setVerifyFound([]);
    try {
      const response = await fetch('/api/domain/verify-ownership', { method: 'POST' });
      const data = (await response.json().catch(() => null)) as
        | { verified?: boolean; message?: string; error?: string; found?: string[] }
        | null;
      if (response.status === 429) {
        setVerifyError(formatCooldown(response));
      } else if (!response.ok) {
        setVerifyError(data?.error || 'Verification check failed.');
      } else if (data?.verified) {
        setVerifyMessage('Ownership confirmed.');
        await refresh();
      } else {
        setVerifyMessage(data?.message || 'Not found yet.');
        setVerifyFound(data?.found || []);
      }
    } catch {
      setVerifyError('Verification check failed.');
    } finally {
      setVerifying(false);
    }
  }

  async function checkRouting() {
    if (checkingRouting) return;
    setCheckingRouting(true);
    setAttachError('');
    await refresh();
    setCheckingRouting(false);
  }

  async function attach() {
    if (attaching) return;
    setAttaching(true);
    setAttachError('');
    try {
      const response = await fetch('/api/domain/attach', { method: 'POST' });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (response.status === 429) {
        setAttachError(formatCooldown(response));
      } else if (!response.ok) {
        setAttachError(data?.error || 'Could not connect that subdomain.');
      } else {
        await refresh();
      }
    } catch {
      setAttachError('Could not connect that subdomain.');
    } finally {
      setAttaching(false);
    }
  }

  if (!hasDomain) {
    return (
      <div className="rounded-lg border border-ink-200 bg-ink-50 p-5">
        <div className="flex items-start gap-3">
          <Globe2 className="mt-0.5 h-4 w-4 text-ink-500" />
          <div>
            <p className="text-sm font-medium text-ink-900">
              Enter your root domain and subdomain above to start connecting.
            </p>
            <p className="mt-1 text-xs text-ink-500">
              You will prove ownership with one DNS record, then add a second to route traffic.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !status) {
    return (
      <div className="rounded-lg border border-ink-200 bg-white p-5">
        <div className="flex items-center gap-2 text-sm text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading domain status.
        </div>
      </div>
    );
  }

  const stage = status.stage;
  const ownershipDone = stage === 'verified' || stage === 'attached-pending' || stage === 'live';
  const routingDone = stage === 'live';
  const platformVerificationRecords = status.platformVerificationRecords || [];
  const needsPlatformVerification = platformVerificationRecords.length > 0 && !routingDone;
  const needsCnameUpdate =
    !needsPlatformVerification &&
    stage === 'attached-pending' &&
    (status.liveStatus?.issue === 'invalid_dns' || status.liveStatus?.misconfigured);
  const needsReconnect =
    !needsPlatformVerification &&
    !needsCnameUpdate &&
    stage === 'attached-pending' &&
    (status.liveStatus?.issue === 'deployment_not_found' || status.liveStatus?.configured === false);

  if (stage === 'live') {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-semibold text-emerald-950">Domain is live</p>
          <p className="mt-0.5 text-xs leading-5 text-emerald-800">
            {status.host} is connected and serving your Magnets pages.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <StepCard
        active={!ownershipDone}
        done={ownershipDone}
        index={1}
        title="Prove you own this domain"
        description="Add this TXT record to your DNS provider. Then click Check."
      >
        {status.verificationRecord ? (
          <>
            <RecordRow record={status.verificationRecord} />
            {!ownershipDone && (
              <div className="mt-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <AceternityButton onClick={verifyOwnership} disabled={verifying} variant="secondary">
                    {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Check ownership
                  </AceternityButton>
                  {verifyMessage && <span className="text-xs leading-5 text-ink-600">{verifyMessage}</span>}
                  {verifyError && <span className="text-xs text-red-700">{verifyError}</span>}
                </div>
                {verifyFound.length > 0 && (
                  <div className="rounded-md border border-ink-200 bg-ink-50 p-2 text-[11px]">
                    <p className="font-medium text-ink-700">What we found at that host:</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 font-mono text-ink-700">
                      {verifyFound.map((v, i) => (
                        <li key={i} className="break-all">{v}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {ownershipDone && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ownership verified
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-ink-500">Saving your domain reveals the record to add.</p>
        )}
      </StepCard>

      <StepCard
        active={ownershipDone && !routingDone}
        done={routingDone}
        index={2}
        title="Point traffic at your magnets"
        description={
          stage === 'attached-pending'
            ? 'Add this CNAME at your DNS provider. We refresh status automatically.'
            : 'After ownership is verified, we will give you a CNAME unique to your account.'
        }
        disabled={!ownershipDone}
      >
        {stage === 'verified' && (
          <div className="flex flex-wrap items-center gap-2">
            <AceternityButton onClick={attach} disabled={attaching}>
              {attaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Connect subdomain
            </AceternityButton>
            <span className="text-xs text-ink-500">One click. Reveals the CNAME to add.</span>
            {attachError && <span className="text-xs text-red-700">{attachError}</span>}
          </div>
        )}

        {stage === 'attached-pending' && status.cnameRecord && (
          <>
            <RecordRow record={status.cnameRecord} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium"
                style={{
                  borderColor: routingDone ? '#a7f3d0' : '#fde68a',
                  background: routingDone ? '#ecfdf5' : '#fffbeb',
                  color: routingDone ? '#047857' : '#92400e',
                }}
              >
                {routingDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                {routingDone
                  ? 'Live and serving'
                  : needsPlatformVerification
                    ? 'Vercel needs one more verification record'
                    : needsCnameUpdate
                      ? 'Update this CNAME in your DNS provider'
                    : needsReconnect
                      ? 'DNS is set, but the subdomain is not connected'
                      : 'Waiting for DNS to propagate'}
              </p>
              {needsReconnect && (
                <AceternityButton
                  disabled={attaching}
                  onClick={attach}
                  size="sm"
                  type="button"
                >
                  {attaching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  Reconnect subdomain
                </AceternityButton>
              )}
              {!routingDone && (
                <AceternityButton
                  disabled={checkingRouting}
                  onClick={checkRouting}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {checkingRouting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Check again
                </AceternityButton>
              )}
              {attachError && <span className="text-xs text-red-700">{attachError}</span>}
            </div>
            {needsPlatformVerification && (
              <div className="mt-4 space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                <div>
                  <p className="text-xs font-semibold text-amber-900">Vercel verification needed</p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    Add the record below at your DNS provider, then click Check again.
                  </p>
                </div>
                <div className="space-y-2">
                  {platformVerificationRecords.map((record) => (
                    <RecordRow key={`${record.type}:${record.fullName || record.name}:${record.value}`} record={record} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {stage === 'attached-pending' && !status.cnameRecord && (
          <p className="text-xs text-ink-500">Looking up the CNAME unique to your account.</p>
        )}
      </StepCard>
    </div>
  );
}

function StepCard({
  active,
  children,
  description,
  disabled,
  done,
  index,
  title,
}: {
  active?: boolean;
  children: React.ReactNode;
  description: string;
  disabled?: boolean;
  done?: boolean;
  index: number;
  title: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-white p-5 transition',
        done && 'border-emerald-200 bg-emerald-50/30',
        !done && active && 'border-ink-300',
        !done && !active && 'border-ink-200',
        disabled && 'opacity-60'
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
          <p className="mt-1 text-xs leading-5 text-ink-600">{description}</p>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function RecordRow({ record }: { record: DnsRecord }) {
  return (
    <div className="overflow-hidden rounded-md border border-ink-200 bg-white">
      <div className="grid gap-px bg-ink-100 text-xs sm:grid-cols-[80px_minmax(0,1fr)_minmax(0,1.4fr)]">
        <Cell label="Type">
          <span className="font-mono text-ink-900">{record.type}</span>
        </Cell>
        <Cell label="Host">
          <Copyable value={record.name} />
          {record.fullName && record.fullName !== record.name && (
            <p className="mt-1 text-[10px] text-ink-500">Full hostname: {record.fullName}</p>
          )}
        </Cell>
        <Cell label="Value">
          <Copyable value={record.value} mono />
        </Cell>
      </div>
    </div>
  );
}

function Cell({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="bg-white px-3 py-2">
      <p className="text-[10px] font-medium uppercase text-ink-500">{label}</p>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

function Copyable({ value, mono }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="flex items-center gap-2">
      <code className={cn('flex-1 break-all rounded bg-ink-50 px-1.5 py-0.5 text-xs', mono && 'font-mono')}>
        {value}
      </code>
      <button
        aria-label={`Copy ${value}`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-700 transition hover:bg-ink-50"
        onClick={copy}
        type="button"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function formatCooldown(response: Response) {
  const retryAfter = Number(response.headers.get('Retry-After') || 120);
  if (!Number.isFinite(retryAfter) || retryAfter <= 0) {
    return 'Wait a couple of minutes before checking again.';
  }
  if (retryAfter >= 60) {
    const minutes = Math.ceil(retryAfter / 60);
    return `Wait ${minutes} minute${minutes === 1 ? '' : 's'} before checking again.`;
  }
  return `Wait ${retryAfter} seconds before checking again.`;
}
