'use client';

import {
  ArrowLeft,
  BarChart3,
  CirclePlay,
  Clock3,
  ExternalLink,
  ListChecks,
  MousePointerClick,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/dashboard/app-shell';
import { aceternityButtonClassName } from '@/components/ui/aceternity';
import { postSignupVideoEmbedUrl } from '@/lib/post-signup';
import type { LeadMagnet, LeadMagnetAnalytics } from '@/lib/types';
import { cn } from '@/lib/utils';

function formatNumber(value: number) {
  return new Intl.NumberFormat('en').format(value);
}

function formatDuration(totalSeconds: number) {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00Z`));
}

export function LeadMagnetAnalyticsView({
  analytics,
  embedded = false,
  leadMagnet,
  pageUrl,
}: {
  analytics: LeadMagnetAnalytics;
  embedded?: boolean;
  leadMagnet: Pick<
    LeadMagnet,
    | 'id'
    | 'title'
    | 'published'
    | 'postSignupMode'
    | 'postSignupVideoUrl'
    | 'postSignupQuizEnabled'
    | 'postSignupQuizQuestions'
  >;
  pageUrl: string;
}) {
  const maxDailyVisits = Math.max(...analytics.daily.map((day) => day.visits), 1);
  const hasVideo = leadMagnet.postSignupMode === 'page'
    && Boolean(postSignupVideoEmbedUrl(leadMagnet.postSignupVideoUrl));
  const hasQuiz = leadMagnet.postSignupMode === 'page'
    && leadMagnet.postSignupQuizEnabled
    && leadMagnet.postSignupQuizQuestions.length > 0;
  const metricCards = [
    {
      label: 'Visits',
      value: formatNumber(analytics.totalVisits),
      detail: `${formatNumber(analytics.recentVisits)} in the last 30 days`,
      icon: Users,
    },
    {
      label: 'Conversions',
      value: formatNumber(analytics.totalConversions),
      detail: `${formatNumber(analytics.recentConversions)} in the last 30 days`,
      icon: MousePointerClick,
    },
    {
      label: 'Conversion rate',
      value: `${analytics.conversionRate.toFixed(1)}%`,
      detail: 'Successful page signups ÷ visits',
      icon: BarChart3,
    },
    {
      label: 'Average engaged time',
      value: formatDuration(analytics.averageEngagedSeconds),
      detail: 'Time the page was actively visible',
      icon: Clock3,
    },
  ];
  if (hasVideo) {
    metricCards.push({
      label: 'Video plays',
      value: formatNumber(analytics.totalVideoPlays),
      detail: `${formatNumber(analytics.recentVideoPlays)} in the last 30 days`,
      icon: CirclePlay,
    });
  }
  if (hasQuiz) {
    metricCards.push({
      label: 'Quiz completions',
      value: formatNumber(analytics.totalQuizCompletions),
      detail: `${formatNumber(analytics.recentQuizCompletions)} in the last 30 days`,
      icon: ListChecks,
    });
  }

  return (
    <>
      {!embedded && <PageHeader
        title="Analytics"
        subtitle={leadMagnet.title}
        actions={(
          <>
            <Link className={aceternityButtonClassName({ variant: 'secondary' })} href="/dashboard/pages">
              <ArrowLeft className="h-4 w-4" />
              All pages
            </Link>
            <Link
              className={aceternityButtonClassName({ variant: 'secondary' })}
              href={`/dashboard/pages/${leadMagnet.id}`}
            >
              Edit magnet
            </Link>
            {leadMagnet.published && (
              <a
                className={aceternityButtonClassName()}
                href={pageUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink className="h-4 w-4" />
                View page
              </a>
            )}
          </>
        )}
      />}

      <div className={cn('space-y-5', !embedded && 'mx-auto max-w-6xl')}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {metricCards.map((metric) => {
            const Icon = metric.icon;
            return (
              <section className="rounded-lg border border-ink-200 bg-white p-5" key={metric.label}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-ink-500">{metric.label}</p>
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink-50 text-ink-700">
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-4 text-3xl font-semibold tracking-tight text-ink-950">{metric.value}</p>
                <p className="mt-1.5 text-xs leading-5 text-ink-500">{metric.detail}</p>
              </section>
            );
          })}
        </div>

        <section className="overflow-hidden rounded-lg border border-ink-200 bg-white">
          <div className="flex flex-col gap-1 border-b border-ink-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-ink-950">Visits over the last 30 days</h2>
              <p className="mt-1 text-xs text-ink-500">Each bar is one day. Orange shows converted visits.</p>
            </div>
            <div className="mt-2 flex items-center gap-4 text-[11px] text-ink-500 sm:mt-0">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-ink-800" />Visits</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-brand-orange" />Conversions</span>
            </div>
          </div>

          {analytics.totalVisits === 0 ? (
            <div className="px-6 py-14 text-center">
              <BarChart3 className="mx-auto h-7 w-7 text-ink-400" />
              <h3 className="mt-3 text-sm font-semibold text-ink-950">No visits recorded yet</h3>
              <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-ink-500">
                Publish and share this magnet. New visits and successful form submissions will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="px-4 pb-4 pt-6 sm:px-5">
              <div className="flex h-56 items-end gap-0.5 border-b border-ink-200 sm:gap-1.5">
                {analytics.daily.map((day, index) => {
                  const height = day.visits > 0
                    ? Math.max((day.visits / maxDailyVisits) * 100, 4)
                    : 0;
                  const conversionHeight = day.visits > 0
                    ? Math.min((day.conversions / day.visits) * 100, 100)
                    : 0;
                  const showLabel = index === 0 || index === analytics.daily.length - 1 || index % 7 === 0;
                  return (
                    <div
                      className="group relative flex h-full min-w-0 flex-1 items-end"
                      key={day.date}
                      title={`${shortDate(day.date)}: ${day.visits} visits, ${day.conversions} conversions`}
                    >
                      <div
                        className="relative w-full overflow-hidden rounded-t-sm bg-ink-800 transition group-hover:bg-ink-950"
                        style={{ height: `${height}%` }}
                      >
                        {conversionHeight > 0 && (
                          <span
                            className="absolute inset-x-0 bottom-0 bg-brand-orange"
                            style={{ height: `${conversionHeight}%` }}
                          />
                        )}
                      </div>
                      {showLabel && (
                        <span className="absolute top-[calc(100%+0.45rem)] whitespace-nowrap text-[9px] text-ink-400">
                          {shortDate(day.date)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="h-6" />
            </div>
          )}
        </section>

        <div className="rounded-md border border-ink-200 bg-ink-50 px-4 py-3 text-xs leading-5 text-ink-600">
          A visit is one anonymous browser-tab session, so refreshing the same page does not inflate the count. Engaged time only counts while the page is visible. A video play is one successful signup explicitly pressing Play, counted once. A quiz completion requires every configured answer to be saved. No names, emails, cookies, or raw IP addresses are stored in visit analytics. Tracking starts when each metric is deployed; historical activity cannot be reconstructed.
        </div>
      </div>
    </>
  );
}
