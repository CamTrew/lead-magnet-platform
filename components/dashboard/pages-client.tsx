'use client';

import type { FormEvent } from 'react';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  ExternalLink,
  ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  AceternityButton,
  AceternityCard,
  AceternityInput,
} from '@/components/ui/aceternity';
import { useModalAccessibility } from '@/components/ui/use-modal-accessibility';
import { PageHeader } from '@/components/dashboard/app-shell';
import { LeadMagnetAnalyticsView } from '@/components/dashboard/lead-magnet-analytics-view';
import type {
  DashboardBasePayload,
  LeadMagnet,
  LeadMagnetAnalytics,
  LeadMagnetSummary,
} from '@/lib/types';
import { MAX_LEAD_MAGNETS_PER_ACCOUNT } from '@/lib/limits';
import { cn } from '@/lib/utils';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type AnalyticsLeadMagnet = Pick<
  LeadMagnet,
  | 'id'
  | 'title'
  | 'published'
  | 'postSignupMode'
  | 'postSignupVideoUrl'
  | 'postSignupQuizEnabled'
  | 'postSignupQuizQuestions'
  | 'abTestEnabled'
  | 'abTestVariants'
  | 'abTestCompletedAt'
  | 'abTestWinnerId'
>;

type AnalyticsResponse = {
  analytics: LeadMagnetAnalytics;
  leadMagnet: AnalyticsLeadMagnet;
  pageUrl: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function slugifyTitle(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Sanitize while the user is still typing in the slug input. Unlike
 * slugifyTitle this keeps trailing hyphens (so they can keep typing words
 * separated by them) and converts spaces to hyphens live so a space-pressed
 * "hello world" turns into "hello-world" as they type.
 */
function liveSlug(input: string) {
  return input
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
}

function CreatePageModal({
  error,
  isCreating,
  onClose,
  onSubmit,
  setSlug,
  setSlugTouched,
  setTitle,
  slug,
  slugTouched,
  title,
}: {
  error: string;
  isCreating: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setSlug: (value: string) => void;
  setSlugTouched: (value: boolean) => void;
  setTitle: (value: string) => void;
  slug: string;
  slugTouched: boolean;
  title: string;
}) {
  useModalAccessibility(onClose, isCreating);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111111]/20 p-4 backdrop-blur-sm">
      <button
        aria-label="Close new page dialog"
        className="absolute inset-0"
        disabled={isCreating}
        onClick={onClose}
        type="button"
      />
      <div
        aria-label="Create page"
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded-lg border border-ink-300 bg-white p-6 shadow-sm"
        role="dialog"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-950">Create a magnet</h2>
            <p className="mt-1 text-sm leading-6 text-ink-600">
              Name the page and choose its URL.
            </p>
          </div>
          <button
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-500 transition hover:bg-ink-50 hover:text-ink-900 disabled:opacity-50"
            disabled={isCreating}
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-700">Page name</span>
            <AceternityInput
              autoFocus
              disabled={isCreating}
              maxLength={120}
              onChange={(event) => {
                const value = event.target.value;
                setTitle(value);
                if (!slugTouched) setSlug(slugifyTitle(value));
              }}
              placeholder="AI Pipeline Playbook"
              required
              value={title}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-700">URL slug</span>
            <div className="flex h-9 items-stretch overflow-hidden rounded-md border border-ink-200 bg-white focus-within:border-ink-950 focus-within:ring-1 focus-within:ring-ink-950">
              <span className="flex shrink-0 items-center border-r border-ink-200 bg-ink-50 px-2.5 font-mono text-xs text-ink-500">
                /
              </span>
              <input
                className="min-w-0 flex-1 bg-transparent px-2 font-mono text-sm text-ink-900 outline-none placeholder:text-ink-400"
                disabled={isCreating}
                maxLength={80}
                onChange={(event) => {
                  setSlug(liveSlug(event.target.value));
                  setSlugTouched(true);
                }}
                placeholder="ai-pipeline-playbook"
                required
                value={slug}
              />
            </div>
            <span className="mt-1.5 block text-xs leading-5 text-ink-500">
              The path of the page. Lowercase, digits, and hyphens only.
            </span>
          </label>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-ink-200 pt-4">
            <AceternityButton disabled={isCreating} onClick={onClose} type="button" variant="secondary">
              Cancel
            </AceternityButton>
            <AceternityButton
              disabled={isCreating || !title.trim() || !slug.trim()}
              type="submit"
            >
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {isCreating ? 'Creating page' : 'Create page'}
            </AceternityButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function publicUrl(account: DashboardBasePayload['account'], slug: string) {
  const attachedHost = account.domainAttachedHost?.trim();
  if (!attachedHost) return null;
  return `https://${attachedHost}/${slug}`;
}

function platformUrl(username: string, slug: string) {
  if (!username) return null;
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '');
  if (configuredSiteUrl) return `${configuredSiteUrl}/${username}/${slug}`;

  // Keep local development links on the local server. In production the
  // dashboard may live on app.magnets.so, so never derive a public URL from
  // window.location there.
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname.startsWith('127.'))
  ) {
    return `${window.location.origin}/${username}/${slug}`;
  }

  return `https://magnets.so/${username}/${slug}`;
}

function leadMagnetUrl(account: DashboardBasePayload['account'], leadMagnet: LeadMagnetSummary) {
  return publicUrl(account, leadMagnet.slug) || platformUrl(account.username, leadMagnet.slug) || `/p/${leadMagnet.id}`;
}

function PageThumbnail({ imageUrl, title }: Pick<LeadMagnetSummary, 'imageUrl' | 'title'>) {
  const [hasImageError, setHasImageError] = useState(false);

  if (!imageUrl || hasImageError) {
    return (
      <div
        aria-hidden="true"
        className="lead-magnet-thumbnail-placeholder flex aspect-[16/9] w-full items-center justify-center bg-[radial-gradient(circle_at_top,#fff7f2,transparent_55%),linear-gradient(135deg,#f7f5f2,#efebe6)] text-ink-400"
      >
        <div className="dashboard-glass-stat flex h-12 w-12 items-center justify-center rounded-2xl border border-white/80 bg-white/70 shadow-sm backdrop-blur">
          <ImageIcon className="h-5 w-5" />
        </div>
      </div>
    );
  }

  return (
    // Customer images can be served from arbitrary Blob URLs, so this cannot use a fixed Next image-host allowlist.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={`Preview of ${title}`}
      className="aspect-[16/9] w-full bg-ink-50 object-cover transition duration-500 group-hover/card:scale-[1.025]"
      decoding="async"
      onError={() => setHasImageError(true)}
      src={imageUrl}
    />
  );
}

function AnalyticsModal({
  onClose,
  target,
}: {
  onClose: () => void;
  target: Pick<LeadMagnetSummary, 'id' | 'title'>;
}) {
  useModalAccessibility(onClose);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');

    void fetch(`/api/lead-magnets/${target.id}/analytics`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as (AnalyticsResponse & { error?: string }) | null;
        if (!response.ok || !body) throw new Error(body?.error || 'Analytics could not be loaded.');
        setData(body);
      })
      .catch((fetchError) => {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
        setError(fetchError instanceof Error ? fetchError.message : 'Analytics could not be loaded.');
      });

    return () => controller.abort();
  }, [target.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111111]/30 p-3 backdrop-blur-sm sm:p-6">
      <button aria-label="Close analytics" className="absolute inset-0" onClick={onClose} type="button" />
      <div
        aria-label={`Analytics for ${target.title}`}
        aria-modal="true"
        className="relative z-10 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-ink-200 bg-white shadow-2xl"
        role="dialog"
      >
        <div className="flex items-center justify-between gap-4 border-b border-ink-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink-950">Analytics</h2>
            <p className="truncate text-xs text-ink-500">{target.title}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {data?.leadMagnet.published && (
              <a
                aria-label="Open published page"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-700 transition hover:bg-ink-50"
                href={data.pageUrl}
                rel="noreferrer"
                target="_blank"
                title="View page"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button
              aria-label="Close analytics"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-700 transition hover:bg-ink-50"
              onClick={onClose}
              title="Close"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-ink-50 p-4 sm:p-5">
          {!data && !error && (
            <div className="flex min-h-72 items-center justify-center text-sm text-ink-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading analytics
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
              {error}
            </div>
          )}
          {data && (
            <LeadMagnetAnalyticsView
              analytics={data.analytics}
              embedded
              leadMagnet={data.leadMagnet}
              pageUrl={data.pageUrl}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function PagesClient({
  initialData,
  initialLeadMagnets,
  openCreateInitially = false,
}: {
  initialData: DashboardBasePayload;
  initialLeadMagnets: LeadMagnetSummary[];
  openCreateInitially?: boolean;
}) {
  const router = useRouter();
  const account = initialData.account;
  const [isPending, startTransition] = useTransition();
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnetSummary[]>(initialLeadMagnets);
  const [createOpen, setCreateOpen] = useState(
    openCreateInitially && initialLeadMagnets.length < MAX_LEAD_MAGNETS_PER_ACCOUNT
  );
  const [createTitle, setCreateTitle] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [createSlugTouched, setCreateSlugTouched] = useState(false);
  const [createState, setCreateState] = useState<SaveState>('idle');
  const [openingPageId, setOpeningPageId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [createError, setCreateError] = useState('');
  const [analyticsTarget, setAnalyticsTarget] = useState<Pick<LeadMagnetSummary, 'id' | 'title'> | null>(null);
  const [query, setQuery] = useState('');
  const isCreating = createState === 'saving';
  const isCreateBusy = isCreating;
  const isOpening = Boolean(openingPageId) || isPending;
  const pageLimitReached = leadMagnets.length >= MAX_LEAD_MAGNETS_PER_ACCOUNT;
  const actionLabel = pageLimitReached
    ? 'Limit reached'
    : isCreateBusy
      ? 'Creating page'
      : 'New page';
  const publishedCount = leadMagnets.filter((leadMagnet) => leadMagnet.published).length;
  const filteredLeadMagnets = leadMagnets.filter((leadMagnet) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return `${leadMagnet.title} ${leadMagnet.subtitle} ${leadMagnet.slug}`.toLowerCase().includes(needle);
  });

  function openCreateDialog() {
    if (isCreateBusy || isOpening) return;
    if (pageLimitReached) {
      setError(`Accounts are limited to ${MAX_LEAD_MAGNETS_PER_ACCOUNT} pages. Delete a page before creating another.`);
      return;
    }
    setCreateError('');
    setError('');
    setCreateOpen(true);
  }

  function closeCreateDialog() {
    if (isCreateBusy) return;
    setCreateOpen(false);
    setCreateError('');
    // Drop in-flight state so reopening the modal starts from scratch.
    setCreateTitle('');
    setCreateSlug('');
    setCreateSlugTouched(false);
    setCreateState('idle');
  }

  async function createLeadMagnet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCreateBusy || isOpening) return;
    if (pageLimitReached) {
      setCreateError(`Accounts are limited to ${MAX_LEAD_MAGNETS_PER_ACCOUNT} pages. Delete a page before creating another.`);
      return;
    }

    setError('');
    setCreateError('');

    try {
      const title = createTitle.trim();
      const slug = createSlug.trim();

      if (!title) {
        setCreateError('Enter a page name first.');
        return;
      }
      if (!slug) {
        setCreateError('Pick a slug for the page URL.');
        return;
      }
      if (!/^[a-z0-9-]+$/.test(slug)) {
        setCreateError('Slug can only contain lowercase letters, digits, and hyphens.');
        return;
      }

      setCreateState('saving');
      const response = await fetch('/api/lead-magnets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, slug }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || 'Page could not be created');
      }

      const data = (await response.json()) as { leadMagnet: LeadMagnet };
      setLeadMagnets((current) => [
        data.leadMagnet,
        ...current.filter((item) => item.id !== data.leadMagnet.id),
      ]);
      setCreateOpen(false);
      setCreateTitle('');
      setCreateSlug('');
      setCreateSlugTouched(false);
      setCreateState('saved');
      setOpeningPageId(data.leadMagnet.id);
      window.dispatchEvent(new Event('magnets:navigation-start'));
      startTransition(() => {
        router.push(`/dashboard/pages/${data.leadMagnet.id}`);
      });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Something went wrong');
      setOpeningPageId(null);
      setCreateState('error');
    }
  }

  function openLeadMagnet(leadMagnetId: string) {
    if (isCreateBusy || isOpening) return;

    setOpeningPageId(leadMagnetId);
    window.dispatchEvent(new Event('magnets:navigation-start'));
    startTransition(() => {
      router.push(`/dashboard/pages/${leadMagnetId}`);
    });
  }

  return (
    <>
      <PageHeader helpTopic="start" title="Lead magnets" subtitle="Create, publish, and manage your lead magnets" />
      {createOpen && (
        <CreatePageModal
          error={createError}
          isCreating={isCreateBusy}
          onClose={closeCreateDialog}
          onSubmit={createLeadMagnet}
          setSlug={setCreateSlug}
          setSlugTouched={setCreateSlugTouched}
          setTitle={setCreateTitle}
          slug={createSlug}
          slugTouched={createSlugTouched}
          title={createTitle}
        />
      )}
      {analyticsTarget && (
        <AnalyticsModal onClose={() => setAnalyticsTarget(null)} target={analyticsTarget} />
      )}

      <div className="mx-auto max-w-7xl space-y-5">
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</p>}

        <section className="dashboard-hero-panel overflow-hidden rounded-2xl border border-ink-200 bg-[radial-gradient(circle_at_8%_0%,rgba(254,111,52,0.12),transparent_28%),linear-gradient(135deg,#fff,#faf9f7)] px-5 py-6 shadow-[0_18px_60px_-48px_rgba(17,17,17,0.45)] sm:px-7 sm:py-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-orange/20 bg-brand-orange/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-700">
                <Sparkles className="h-3 w-3 text-brand-orange" />
                Conversion workspace
              </span>
              <h2 className="mt-4 text-2xl font-semibold tracking-[-0.025em] text-ink-950 sm:text-3xl">Your lead magnet library</h2>
              <p className="mt-2 text-sm leading-6 text-ink-600 sm:text-base">
                Create the signup page, delivery email, follow-up emails, and post-signup page.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <div className="dashboard-glass-stat rounded-xl border border-white bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Published</p>
                <p className="mt-0.5 text-xl font-semibold text-ink-950">{publishedCount}</p>
              </div>
              <div className="dashboard-glass-stat rounded-xl border border-white bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Total</p>
                <p className="mt-0.5 text-xl font-semibold text-ink-950">{leadMagnets.length}</p>
              </div>
              <AceternityButton
                className="col-span-2 min-h-11 rounded-xl px-5 sm:col-auto"
                disabled={pageLimitReached || isCreateBusy || isOpening}
                onClick={openCreateDialog}
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {actionLabel}
              </AceternityButton>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              aria-label="Search lead magnets"
              className="h-11 w-full rounded-xl border border-ink-200 bg-white pl-10 pr-3 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title or URL…"
              value={query}
            />
          </label>
          <p className="text-xs font-medium text-ink-500">{leadMagnets.length} of {MAX_LEAD_MAGNETS_PER_ACCOUNT} spaces used</p>
        </div>

        {leadMagnets.length === 0 && !isCreating ? (
          <AceternityCard className="flex min-h-72 flex-col items-center justify-center rounded-2xl border-dashed px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-orange/10 text-brand-orange"><Sparkles className="h-5 w-5" /></div>
            <p className="mt-4 font-semibold text-ink-950">Create your first lead magnet</p>
            <p className="mt-1 max-w-sm text-sm leading-6 text-ink-500">Build the landing page, resource email, and follow-up sequence in one guided flow.</p>
                      <AceternityButton
              className="mt-5 rounded-xl"
                        disabled={pageLimitReached || isCreateBusy || isOpening}
                        onClick={openCreateDialog}
                      >
                        <Plus className="h-4 w-4" />
              Create lead magnet
                      </AceternityButton>
          </AceternityCard>
        ) : filteredLeadMagnets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-14 text-center">
            <p className="font-semibold text-ink-950">No lead magnets match “{query.trim()}”</p>
            <button className="mt-2 text-sm font-medium text-brand-orange hover:underline" onClick={() => setQuery('')} type="button">Clear search</button>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredLeadMagnets.map((leadMagnet) => {
                  const url = leadMagnetUrl(account, leadMagnet);

                  return (
                <article
                      key={leadMagnet.id}
                  className="group/card overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[0_1px_2px_rgba(17,17,17,0.03)] transition duration-200 hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-[0_22px_55px_-38px_rgba(17,17,17,0.45)]"
                    >
                  <div className="relative overflow-hidden border-b border-ink-100">
                          <PageThumbnail imageUrl={leadMagnet.imageUrl} title={leadMagnet.title} />
                    <span className={cn('absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm backdrop-blur', leadMagnet.published ? 'border-emerald-200/80 bg-emerald-50/95 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-950/90 dark:text-emerald-300' : 'border-white/80 bg-white/90 text-ink-600 dark:border-ink-700 dark:bg-ink-900/95 dark:text-ink-300')}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', leadMagnet.published ? 'bg-emerald-500' : 'bg-ink-400')} />
                      {leadMagnet.published ? 'Published' : 'Draft'}
                    </span>
                        </div>

                  <div className="p-5">
                    <div className="min-h-[4.75rem]">
                      <h3 className="line-clamp-2 text-base font-semibold leading-6 text-ink-950">{leadMagnet.title}</h3>
                      <p className="mt-1 line-clamp-2 text-sm leading-5 text-ink-500">{leadMagnet.subtitle || 'Add a compelling subheadline in the editor.'}</p>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-ink-100 pt-4">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[11px] text-ink-500" title={url}>/{leadMagnet.slug}</p>
                        <p className="mt-1 text-[11px] text-ink-400">Updated {formatDate(leadMagnet.updatedAt)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          aria-label={`View analytics for ${leadMagnet.title}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 transition hover:border-ink-300 hover:bg-ink-50 hover:text-ink-950"
                          onClick={() => setAnalyticsTarget({ id: leadMagnet.id, title: leadMagnet.title })}
                          title="Analytics"
                          type="button"
                        ><BarChart3 className="h-4 w-4" /></button>
                        {leadMagnet.published && (
                          <a
                            aria-label={`View ${leadMagnet.title}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 transition hover:border-ink-300 hover:bg-ink-50 hover:text-ink-950"
                            href={url}
                            rel="noreferrer"
                            target="_blank"
                            title="View published page"
                          ><ExternalLink className="h-4 w-4" /></a>
                        )}
                          <AceternityButton
                            aria-label={`Open ${leadMagnet.title}`}
                          className="h-9 min-h-9 rounded-lg px-3"
                            disabled={isCreating || isOpening}
                            onClick={() => openLeadMagnet(leadMagnet.id)}
                            size="sm"
                          title="Edit lead magnet"
                          >
                            {openingPageId === leadMagnet.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Pencil className="h-4 w-4" />
                            )}
                          <span className="hidden sm:inline">Edit</span>
                          </AceternityButton>
                        </div>
                    </div>
                  </div>
                </article>
                  );
                })}
          </div>
        )}
      </div>
    </>
  );
}
