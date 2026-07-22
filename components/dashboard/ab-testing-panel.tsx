'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Image as ImageIcon, Plus, Trash2, Trophy } from 'lucide-react';
import {
  AB_TEST_MINIMUM_DAYS,
  AB_TEST_MINIMUM_VISITS_PER_VERSION,
} from '@/lib/limits';
import type { LeadMagnet, LeadMagnetAnalytics } from '@/lib/types';
import { cn } from '@/lib/utils';

type VariantResult = LeadMagnetAnalytics['variants'][number];

type AbTestingPanelProps = {
  leadMagnet: LeadMagnet;
  onPatch: (updates: Partial<LeadMagnet>) => void;
  onPickImage: (variantIndex: number) => void;
};

function PreviewImage({ imageUrl, label }: { imageUrl: string; label: string }) {
  if (!imageUrl) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-ink-50 text-ink-400">
        <ImageIcon className="h-6 w-6" />
        <span className="text-xs">No image</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- the URL is a user-owned Blob preview.
    <img alt={`${label} preview`} className="h-full w-full object-cover" src={imageUrl} />
  );
}

function VersionLabel({ children, inverse = false }: { children: string; inverse?: boolean }) {
  return (
    <span className={cn(
      'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] shadow-sm',
      inverse ? 'bg-ink-950 text-white' : 'bg-white/95 text-black'
    )}>
      {children}
    </span>
  );
}

function ResultSummary({ result, winner }: { result?: VariantResult; winner: boolean }) {
  return (
    <div className="mt-3 flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-ink-100 pt-3 text-xs">
      {result ? (
        <>
          <span className="font-semibold text-ink-900">{result.conversionRate.toFixed(1)}% conversion</span>
          <span className="text-ink-500">{result.visits} {result.visits === 1 ? 'visitor' : 'visitors'}</span>
        </>
      ) : (
        <span className="text-ink-500">Results appear after the test starts</span>
      )}
      {winner && (
        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
          <Trophy className="h-3.5 w-3.5" /> Winner
        </span>
      )}
    </div>
  );
}

/**
 * Keeps experiment editing and live results together while the parent editor
 * remains responsible only for persistence, uploads, and undo/redo history.
 */
export function AbTestingPanel({ leadMagnet, onPatch, onPickImage }: AbTestingPanelProps) {
  const [analytics, setAnalytics] = useState<Pick<LeadMagnetAnalytics, 'variants'> | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const variantIdsKey = leadMagnet.abTestVariants.map((variant) => variant.id).join(',');

  useEffect(() => {
    if (leadMagnet.abTestVariants.length === 0) {
      setAnalytics(null);
      return;
    }

    let cancelled = false;
    async function loadResults() {
      const response = await fetch(`/api/lead-magnets/${leadMagnet.id}/analytics`, {
        cache: 'no-store',
      }).catch(() => null);
      if (!response?.ok || cancelled) return;

      const data = await response.json().catch(() => null) as {
        analytics?: Pick<LeadMagnetAnalytics, 'variants'>;
      } | null;
      if (!cancelled && data?.analytics) {
        setAnalytics(data.analytics);
        setClock(Date.now());
      }
    }

    void loadResults();
    const interval = leadMagnet.abTestEnabled
      ? window.setInterval(loadResults, 60_000)
      : null;

    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
    };
  }, [leadMagnet.abTestEnabled, leadMagnet.abTestVariants.length, leadMagnet.id, variantIdsKey]);

  const resultsById = useMemo(
    () => new Map(analytics?.variants.map((variant) => [variant.variantId, variant]) || []),
    [analytics]
  );
  const startedAt = leadMagnet.abTestStartedAt ? new Date(leadMagnet.abTestStartedAt) : null;
  const elapsedDays = startedAt
    ? Math.max(1, Math.floor((clock - startedAt.getTime()) / (24 * 60 * 60 * 1000)) + 1)
    : 0;
  const completed = Boolean(leadMagnet.abTestCompletedAt && leadMagnet.abTestWinnerId);
  const winnerLabel = leadMagnet.abTestWinnerId === 'control'
    ? 'Control'
    : leadMagnet.abTestVariants.find((variant) => variant.id === leadMagnet.abTestWinnerId)?.name || 'Version B';
  const hasMeaningfulVariant = leadMagnet.abTestVariants.some((variant) => (
    (variant.title.trim() && variant.title.trim() !== leadMagnet.title.trim())
    || (variant.imageUrl.trim() && variant.imageUrl.trim() !== leadMagnet.imageUrl.trim())
  ));
  const trafficShare = `${Math.round(1000 / (leadMagnet.abTestVariants.length + 1)) / 10}%`;

  function updateVariant(index: number, updates: Partial<LeadMagnet['abTestVariants'][number]>) {
    onPatch({
      abTestVariants: leadMagnet.abTestVariants.map((variant, variantIndex) => (
        variantIndex === index ? { ...variant, ...updates } : variant
      )),
    });
  }

  function removeVariant(index: number) {
    const remaining = leadMagnet.abTestVariants.filter((_, itemIndex) => itemIndex !== index);
    onPatch({
      abTestEnabled: remaining.length > 0 && leadMagnet.abTestEnabled,
      abTestVariants: remaining,
    });
  }

  return (
    <section className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-[0_18px_45px_-38px_rgba(17,17,17,0.45)]">
      <div className="flex flex-col gap-4 border-b border-ink-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-50 text-ink-700">
              <BarChart3 className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold text-ink-950">Test title and image</h2>
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-ink-500">
            Magnets splits new visitors evenly and keeps each person on the same version for an accurate result.
          </p>
        </div>
        <button
          aria-pressed={leadMagnet.abTestEnabled}
          className={cn(
            'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition',
            leadMagnet.abTestEnabled
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50'
          )}
          disabled={!leadMagnet.abTestEnabled && !hasMeaningfulVariant}
          onClick={() => onPatch({ abTestEnabled: !leadMagnet.abTestEnabled })}
          title={!leadMagnet.abTestEnabled && !hasMeaningfulVariant
            ? 'Change Version B before starting the test.'
            : undefined}
          type="button"
        >
          <span className={cn('h-2 w-2 rounded-full', leadMagnet.abTestEnabled ? 'bg-emerald-500' : 'bg-ink-300')} />
          {leadMagnet.abTestEnabled
            ? `Running · day ${Math.min(elapsedDays, AB_TEST_MINIMUM_DAYS)} of ${AB_TEST_MINIMUM_DAYS}`
            : completed
              ? `${winnerLabel} won`
              : 'Start test'}
        </button>
      </div>

      <div className="p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className={cn(
            'overflow-hidden rounded-xl border bg-white shadow-sm',
            completed && leadMagnet.abTestWinnerId === 'control'
              ? 'border-emerald-400 ring-2 ring-emerald-100'
              : 'border-ink-200'
          )}>
            <div className="relative aspect-video overflow-hidden border-b border-ink-200">
              <PreviewImage imageUrl={leadMagnet.imageUrl} label="Control" />
              <div className="absolute left-3 top-3">
                <VersionLabel inverse>{`Control · ${trafficShare}`}</VersionLabel>
              </div>
            </div>
            <div className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">Current page</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-ink-950">{leadMagnet.title}</p>
              <ResultSummary
                result={resultsById.get('control')}
                winner={completed && leadMagnet.abTestWinnerId === 'control'}
              />
            </div>
          </div>

          {leadMagnet.abTestVariants.map((variant, index) => (
            <div className={cn(
              'overflow-hidden rounded-xl border bg-white shadow-sm',
              completed && leadMagnet.abTestWinnerId === variant.id
                ? 'border-emerald-400 ring-2 ring-emerald-100'
                : 'border-ink-200'
            )} key={variant.id}>
              <div className="group relative aspect-video overflow-hidden border-b border-ink-200">
                <PreviewImage imageUrl={variant.imageUrl || leadMagnet.imageUrl} label={variant.name} />
                <div className="absolute left-3 top-3">
                  <VersionLabel>{`Version ${String.fromCharCode(66 + index)} · ${trafficShare}`}</VersionLabel>
                </div>
                <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <button
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink-950 px-3 text-xs font-semibold text-white shadow-lg hover:bg-ink-800"
                    onClick={() => onPickImage(index)}
                    type="button"
                  >
                    <ImageIcon className="h-4 w-4" />
                    {variant.imageUrl ? 'Replace image' : 'Choose image'}
                  </button>
                  <button
                    aria-label={`Remove ${variant.name}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white text-red-600 shadow-lg hover:bg-red-50"
                    onClick={() => removeVariant(index)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="p-4">
                <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500" htmlFor={`ab-title-${variant.id}`}>
                  Version title
                </label>
                <input
                  className="mt-1.5 h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-950 outline-none transition placeholder:text-ink-400 focus:border-ink-500 focus:ring-2 focus:ring-ink-950/10"
                  id={`ab-title-${variant.id}`}
                  maxLength={160}
                  onChange={(event) => updateVariant(index, { title: event.target.value, subtitle: '' })}
                  placeholder={leadMagnet.title}
                  value={variant.title}
                />
                {variant.imageUrl && (
                  <button
                    className="mt-2 text-xs text-ink-500 underline-offset-2 hover:text-ink-900 hover:underline"
                    onClick={() => updateVariant(index, { imageUrl: '' })}
                    type="button"
                  >
                    Use control image
                  </button>
                )}
                <ResultSummary
                  result={resultsById.get(variant.id)}
                  winner={completed && leadMagnet.abTestWinnerId === variant.id}
                />
              </div>
            </div>
          ))}
        </div>

        {leadMagnet.abTestVariants.length === 0 && (
          <button
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ink-300 bg-ink-50 px-4 py-5 text-sm font-semibold text-ink-700 transition hover:border-ink-400 hover:bg-ink-100"
            onClick={() => onPatch({
              abTestVariants: [{
                id: `variant-${crypto.randomUUID().slice(0, 8)}`,
                name: 'Version B',
                title: leadMagnet.title,
                subtitle: '',
                imageUrl: '',
              }],
            })}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Create version B
          </button>
        )}

        {(leadMagnet.abTestEnabled || completed) && (
          <div className={cn(
            'mt-5 flex flex-col gap-2 rounded-xl border px-4 py-3 text-xs leading-5 sm:flex-row sm:items-center sm:justify-between',
            completed
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-ink-200 bg-ink-50 text-ink-600'
          )}>
            <p>
              {completed
                ? `${winnerLabel} was applied automatically at ${resultsById.get(leadMagnet.abTestWinnerId)?.conversionRate.toFixed(1) || '0.0'}% conversion.`
                : `Magnets selects the winner after ${AB_TEST_MINIMUM_DAYS} days once every version has at least ${AB_TEST_MINIMUM_VISITS_PER_VERSION} visitors.`}
            </p>
            {!completed && (
              <span className="shrink-0 font-semibold text-ink-800">
                {Math.max(0, AB_TEST_MINIMUM_DAYS - elapsedDays)} days remaining
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
