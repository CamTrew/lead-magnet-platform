import { Check, Trophy } from 'lucide-react';
import type { LeadMagnet, LeadMagnetAnalytics } from '@/lib/types';
import { cn } from '@/lib/utils';

type AbTestResultsCardProps = {
  experiment: Pick<
    LeadMagnet,
    'abTestVariants' | 'abTestCompletedAt' | 'abTestWinnerId'
  >;
  variants: LeadMagnetAnalytics['variants'];
};

function versionName(
  variantId: string,
  experiment: AbTestResultsCardProps['experiment']
) {
  if (variantId === 'control') return 'Control';
  return experiment.abTestVariants.find((variant) => variant.id === variantId)?.name || 'Version B';
}

export function AbTestResultsCard({ experiment, variants }: AbTestResultsCardProps) {
  const completed = Boolean(experiment.abTestCompletedAt && experiment.abTestWinnerId);
  const winnerName = completed ? versionName(experiment.abTestWinnerId, experiment) : '';

  return (
    <section className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-[0_18px_45px_-38px_rgba(17,17,17,0.45)]">
      <div className="flex flex-col gap-3 border-b border-ink-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-50 text-ink-700">
              {completed ? <Trophy className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-emerald-500" />}
            </span>
            <h2 className="text-sm font-semibold text-ink-950">
              {completed ? 'Title and image test complete' : 'Title and image test'}
            </h2>
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-ink-500">
            {completed
              ? `${winnerName} was selected automatically using conversion rate.`
              : 'New visitor sessions are split evenly and keep the same version throughout signup.'}
          </p>
        </div>
        {completed && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <Check className="h-3.5 w-3.5" />
            {winnerName} won
          </span>
        )}
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2">
        {variants.map((variant) => {
          const winner = completed && experiment.abTestWinnerId === variant.variantId;
          return (
            <article className={cn(
              'rounded-xl border p-4 transition',
              winner
                ? 'border-emerald-300 bg-emerald-50/60 ring-1 ring-emerald-100'
                : 'border-ink-200 bg-ink-50/60'
            )} key={variant.variantId}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink-950">
                  {versionName(variant.variantId, experiment)}
                </p>
                {winner && <Trophy className="h-4 w-4 text-emerald-600" />}
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-ink-950">
                {variant.conversionRate.toFixed(1)}%
              </p>
              <p className="mt-1 text-xs text-ink-500">Conversion rate</p>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-200 pt-3">
                <div>
                  <p className="text-sm font-semibold text-ink-900">{variant.visits}</p>
                  <p className="text-[11px] text-ink-500">Visitors</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink-900">{variant.conversions}</p>
                  <p className="text-[11px] text-ink-500">Conversions</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
