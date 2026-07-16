'use client';

import type { FormEvent } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ExternalLink,
  ImageIcon,
  Loader2,
  Pencil,
  Plus,
  X,
} from 'lucide-react';
import {
  AceternityButton,
  AceternityCard,
  AceternityInput,
} from '@/components/ui/aceternity';
import { PageHeader } from '@/components/dashboard/app-shell';
import type { DashboardBasePayload, LeadMagnet, LeadMagnetSummary } from '@/lib/types';
import { MAX_LEAD_MAGNETS_PER_ACCOUNT } from '@/lib/limits';
import { cn } from '@/lib/utils';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

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
        className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-ink-50 text-ink-400"
      >
        <ImageIcon className="h-4 w-4" />
      </div>
    );
  }

  return (
    // Customer images can be served from arbitrary Blob URLs, so this cannot use a fixed Next image-host allowlist.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={`Preview of ${title}`}
      className="h-12 w-16 shrink-0 rounded-md border border-ink-200 bg-ink-50 object-cover"
      decoding="async"
      onError={() => setHasImageError(true)}
      src={imageUrl}
    />
  );
}

export function PagesClient({
  initialData,
  initialLeadMagnets,
}: {
  initialData: DashboardBasePayload;
  initialLeadMagnets: LeadMagnetSummary[];
}) {
  const router = useRouter();
  const account = initialData.account;
  const [isPending, startTransition] = useTransition();
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnetSummary[]>(initialLeadMagnets);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [createSlugTouched, setCreateSlugTouched] = useState(false);
  const [createState, setCreateState] = useState<SaveState>('idle');
  const [openingPageId, setOpeningPageId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [createError, setCreateError] = useState('');
  const isCreating = createState === 'saving';
  const isCreateBusy = isCreating;
  const isOpening = Boolean(openingPageId) || isPending;
  const pageLimitReached = leadMagnets.length >= MAX_LEAD_MAGNETS_PER_ACCOUNT;
  const actionLabel = pageLimitReached
    ? 'Limit reached'
    : isCreateBusy
      ? 'Creating page'
      : 'New page';

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
      <PageHeader title="Pages" subtitle="Create and edit magnets" />
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

      <div className="mx-auto max-w-6xl space-y-4">
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</p>}

        <AceternityCard className="overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-ink-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-ink-950">All pages</h2>
              <p className="mt-1 text-sm text-ink-600">
                Open a page to edit the copy and email.
              </p>
              <p className="mt-1 text-xs font-medium text-ink-500">
                {leadMagnets.length} / {MAX_LEAD_MAGNETS_PER_ACCOUNT} pages used
              </p>
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <AceternityButton
                className="w-full min-w-[152px] sm:w-auto"
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

          <div className="xl:overflow-x-auto">
            <table className="block w-full text-left text-sm xl:table xl:min-w-[920px]">
              <thead className="hidden border-b border-ink-200 bg-ink-50 text-xs font-semibold uppercase text-ink-500 xl:table-header-group">
                <tr>
                  <th className="px-5 py-3">Page</th>
                  <th className="px-5 py-3">URL</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Updated</th>
                  <th className="w-32 px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="block divide-y divide-[#dfd8cf] xl:table-row-group">
                {leadMagnets.length === 0 && !isCreating && (
                  <tr className="block bg-white xl:table-row">
                    <td colSpan={5} className="block px-5 py-10 text-center xl:table-cell">
                      <p className="font-semibold text-ink-950">No pages yet</p>
                      <p className="mt-1 text-sm text-ink-500">Create a page when the resource is ready.</p>
                      <AceternityButton
                        className="mt-4 min-w-[152px]"
                        disabled={pageLimitReached || isCreateBusy || isOpening}
                        onClick={openCreateDialog}
                      >
                        <Plus className="h-4 w-4" />
                        Create page
                      </AceternityButton>
                    </td>
                  </tr>
                )}
                {leadMagnets.map((leadMagnet) => {
                  const url = leadMagnetUrl(account, leadMagnet);

                  return (
                    <tr
                      key={leadMagnet.id}
                      className="block bg-white px-5 py-4 transition hover:bg-ink-50 xl:table-row xl:px-0 xl:py-0"
                    >
                      <td className="block max-w-[360px] py-0 xl:table-cell xl:px-5 xl:py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <PageThumbnail imageUrl={leadMagnet.imageUrl} title={leadMagnet.title} />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink-950">{leadMagnet.title}</p>
                            <p className="mt-0.5 truncate text-xs text-ink-500">{leadMagnet.subtitle}</p>
                          </div>
                        </div>
                      </td>
                      <td className="mt-3 block max-w-[360px] xl:mt-0 xl:table-cell xl:px-5 xl:py-4">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-500 xl:hidden">URL</span>
                        {leadMagnet.published ? (
                          <a
                            className="block truncate font-mono text-xs text-ink-700 underline-offset-2 hover:text-ink-950 hover:underline"
                            href={url}
                            rel="noreferrer"
                            target="_blank"
                            title={url}
                          >
                            {url}
                          </a>
                        ) : (
                          <span className="block truncate font-mono text-xs text-ink-600" title={url}>
                            {url}
                          </span>
                        )}
                      </td>
                      <td className="mt-3 block xl:mt-0 xl:table-cell xl:px-5 xl:py-4">
                        <span className="mr-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500 xl:hidden">Status</span>
                        <span
                          className={cn(
                            'rounded-lg border px-2 py-1 text-xs font-bold',
                            leadMagnet.published
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-ink-200 bg-ink-50 text-ink-900'
                          )}
                        >
                          {leadMagnet.published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="mt-3 block text-ink-600 xl:mt-0 xl:table-cell xl:px-5 xl:py-4">
                        <span className="mr-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500 xl:hidden">Updated</span>
                        {formatDate(leadMagnet.updatedAt)}
                      </td>
                      <td className="mt-4 block xl:mt-0 xl:table-cell xl:px-5 xl:py-4">
                        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-ink-500 xl:hidden">
                          Actions
                        </span>
                        <div className="flex flex-nowrap items-center gap-2 xl:justify-end">
                          {leadMagnet.published && (
                            <a
                              aria-label={`View ${leadMagnet.title}`}
                              className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-md border border-ink-200 bg-white px-0 text-xs font-medium text-ink-900 transition hover:bg-ink-50 sm:h-8 sm:w-auto sm:px-3"
                              href={url}
                              rel="noreferrer"
                              target="_blank"
                              title={url}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">View</span>
                            </a>
                          )}
                          <AceternityButton
                            aria-label={`Open ${leadMagnet.title}`}
                            className="h-10 min-h-10 w-10 shrink-0 px-0 sm:h-8 sm:min-h-8 sm:w-auto sm:px-3"
                            disabled={isCreating || isOpening}
                            onClick={() => openLeadMagnet(leadMagnet.id)}
                            size="sm"
                            title="Open"
                          >
                            {openingPageId === leadMagnet.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Pencil className="h-4 w-4" />
                            )}
                            <span className="hidden sm:inline">Open</span>
                          </AceternityButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </AceternityCard>
      </div>
    </>
  );
}
