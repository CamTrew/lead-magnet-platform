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
  Sparkles,
  X,
} from 'lucide-react';
import {
  AceternityButton,
  AceternityCard,
  AceternityInput,
  AceternityTextarea,
} from '@/components/ui/aceternity';
import { PageHeader } from '@/components/dashboard/app-shell';
import type { DashboardPayload, LeadMagnet } from '@/lib/types';
import type { GeneratedLeadMagnet } from '@/lib/lead-magnet-ai';
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
  aiBrief,
  createWithAi,
  error,
  isCreating,
  onClose,
  onSubmit,
  setAiBrief,
  setCreateWithAi,
  setSlug,
  setSlugTouched,
  setTitle,
  slug,
  slugTouched,
  title,
}: {
  aiBrief: string;
  createWithAi: boolean;
  error: string;
  isCreating: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setAiBrief: (value: string) => void;
  setCreateWithAi: (value: boolean) => void;
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
        className="relative z-10 w-full max-w-md rounded-lg border border-[#c9bfb2] bg-white p-6 shadow-sm"
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#746d64] transition hover:bg-[#f7f5f1] hover:text-[#1f1d1b] disabled:opacity-50"
            disabled={isCreating}
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid grid-cols-2 rounded-lg border border-[#dfd8cf] bg-[#f7f5f1] p-1">
            <button
              className={cn(
                'flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition',
                !createWithAi ? 'bg-white text-[#111111] shadow-sm' : 'text-[#746d64] hover:text-[#1f1d1b]'
              )}
              disabled={isCreating}
              onClick={() => setCreateWithAi(false)}
              type="button"
            >
              Start blank
            </button>
            <button
              className={cn(
                'flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition',
                createWithAi ? 'bg-white text-[#111111] shadow-sm' : 'text-[#746d64] hover:text-[#1f1d1b]'
              )}
              disabled={isCreating}
              onClick={() => setCreateWithAi(true)}
              type="button"
            >
              <Sparkles className="h-4 w-4" />
              Write with AI
            </button>
          </div>

          {createWithAi ? (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink-700">What is this lead magnet about?</span>
              <AceternityTextarea
                autoFocus
                className="min-h-44"
                disabled={isCreating}
                maxLength={12000}
                onChange={(event) => setAiBrief(event.target.value)}
                placeholder="Paste your notes, offer details, audience, what they will get, why it matters, and any proof or examples you want included."
                required
                value={aiBrief}
              />
              <span className="mt-1.5 block text-xs leading-5 text-ink-500">
                We will write the page and delivery email. You can edit every word before publishing.
              </span>
            </label>
          ) : (
            <>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-ink-700">Page name</span>
                <AceternityInput
                  autoFocus
                  disabled={isCreating}
                  maxLength={120}
                  onChange={(event) => {
                    const value = event.target.value;
                    setTitle(value);
                    // Auto-derive the slug from the title until the user manually edits it.
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
            </>
          )}

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-[#dfd8cf] pt-4">
            <AceternityButton disabled={isCreating} onClick={onClose} type="button" variant="secondary">
              Cancel
            </AceternityButton>
            <AceternityButton
              disabled={isCreating || (createWithAi ? aiBrief.trim().length < 40 : !title.trim() || !slug.trim())}
              type="submit"
            >
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {isCreating ? (createWithAi ? 'Writing page' : 'Creating page') : (createWithAi ? 'Write page' : 'Create page')}
            </AceternityButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function publicUrl(account: DashboardPayload['account'], slug: string) {
  const subdomain = account.subdomain?.trim();
  const domain = account.domain?.trim();
  if (!domain || !account.domainAttachedHost) return null;
  const host = subdomain ? `${subdomain}.${domain}` : domain;
  return `https://${host}/${slug}`;
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

function leadMagnetUrl(account: DashboardPayload['account'], leadMagnet: LeadMagnet) {
  return publicUrl(account, leadMagnet.slug) || platformUrl(account.username, leadMagnet.slug) || `/p/${leadMagnet.id}`;
}

function PageThumbnail({ imageUrl, title }: Pick<LeadMagnet, 'imageUrl' | 'title'>) {
  const [hasImageError, setHasImageError] = useState(false);

  if (!imageUrl || hasImageError) {
    return (
      <div
        aria-hidden="true"
        className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md border border-[#dfd8cf] bg-[#f7f5f1] text-[#9b9388]"
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
      className="h-12 w-16 shrink-0 rounded-md border border-[#dfd8cf] bg-[#f7f5f1] object-cover"
      decoding="async"
      onError={() => setHasImageError(true)}
      src={imageUrl}
    />
  );
}

export function PagesClient({ initialData }: { initialData: DashboardPayload }) {
  const router = useRouter();
  const account = initialData.account;
  const [isPending, startTransition] = useTransition();
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnet[]>(initialData.leadMagnets);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [createSlugTouched, setCreateSlugTouched] = useState(false);
  const [createWithAi, setCreateWithAi] = useState(false);
  const [aiBrief, setAiBrief] = useState('');
  const [isWritingWithAi, setIsWritingWithAi] = useState(false);
  const [createState, setCreateState] = useState<SaveState>('idle');
  const [openingPageId, setOpeningPageId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [createError, setCreateError] = useState('');
  const isCreating = createState === 'saving';
  const isCreateBusy = isCreating || isWritingWithAi;
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
    setCreateWithAi(false);
    setAiBrief('');
    setIsWritingWithAi(false);
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
      let title = createTitle.trim();
      let slug = createSlug.trim();
      let generatedDraft: GeneratedLeadMagnet | undefined;

      if (createWithAi) {
        if (aiBrief.trim().length < 40) {
          setCreateError('Add a little more detail so the draft has something real to work with.');
          return;
        }

        setIsWritingWithAi(true);
        const generateResponse = await fetch('/api/lead-magnets/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brief: aiBrief }),
        });
        const generated = (await generateResponse.json().catch(() => null)) as {
          draft?: GeneratedLeadMagnet & { slug: string };
          error?: string;
        } | null;
        if (!generateResponse.ok || !generated?.draft) {
          throw new Error(generated?.error || 'Could not write a draft right now. Please try again.');
        }
        const { slug: generatedSlug, ...draft } = generated.draft;
        title = draft.title;
        slug = generatedSlug;
        generatedDraft = draft;
        setIsWritingWithAi(false);
      } else {
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
      }

      setCreateState('saving');
      const response = await fetch('/api/lead-magnets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, slug, generatedDraft }),
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
      setCreateWithAi(false);
      setAiBrief('');
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
    } finally {
      setIsWritingWithAi(false);
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
          aiBrief={aiBrief}
          createWithAi={createWithAi}
          error={createError}
          isCreating={isCreateBusy}
          onClose={closeCreateDialog}
          onSubmit={createLeadMagnet}
          setAiBrief={setAiBrief}
          setCreateWithAi={setCreateWithAi}
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
          <div className="flex flex-col gap-4 border-b border-[#dfd8cf] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-black text-[#111111]">All pages</h2>
              <p className="mt-1 text-sm text-[#5c554e]">
                Open a page to edit the copy and email.
              </p>
              <p className="mt-1 text-xs font-medium text-[#746d64]">
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

          <div className="md:overflow-x-auto">
            <table className="block w-full text-left text-sm md:table md:min-w-[920px]">
              <thead className="hidden border-b border-[#dfd8cf] bg-[#f7f5f1] text-xs font-black uppercase text-[#746d64] md:table-header-group">
                <tr>
                  <th className="px-5 py-3">Page</th>
                  <th className="px-5 py-3">URL</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Updated</th>
                  <th className="w-32 px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="block divide-y divide-[#dfd8cf] md:table-row-group">
                {leadMagnets.length === 0 && !isCreating && (
                  <tr className="block bg-white md:table-row">
                    <td colSpan={5} className="block px-5 py-10 text-center md:table-cell">
                      <p className="font-black text-[#111111]">No pages yet</p>
                      <p className="mt-1 text-sm text-[#746d64]">Create a page when the resource is ready.</p>
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
                      className="block bg-white px-5 py-4 transition hover:bg-[#f7f5f1] md:table-row md:px-0 md:py-0"
                    >
                      <td className="block max-w-[360px] py-0 md:table-cell md:px-5 md:py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <PageThumbnail imageUrl={leadMagnet.imageUrl} title={leadMagnet.title} />
                          <div className="min-w-0">
                            <p className="truncate font-black text-[#111111]">{leadMagnet.title}</p>
                            <p className="mt-0.5 truncate text-xs text-[#746d64]">{leadMagnet.subtitle}</p>
                          </div>
                        </div>
                      </td>
                      <td className="mt-3 block max-w-[360px] md:mt-0 md:table-cell md:px-5 md:py-4">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#746d64] md:hidden">URL</span>
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
                          <span className="block truncate font-mono text-xs text-[#5c554e]" title={url}>
                            {url}
                          </span>
                        )}
                      </td>
                      <td className="mt-3 block md:mt-0 md:table-cell md:px-5 md:py-4">
                        <span className="mr-2 text-[11px] font-semibold uppercase tracking-wide text-[#746d64] md:hidden">Status</span>
                        <span
                          className={cn(
                            'rounded-lg border px-2 py-1 text-xs font-bold',
                            leadMagnet.published
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-[#dfd8cf] bg-[#f7f5f1] text-[#1f1d1b]'
                          )}
                        >
                          {leadMagnet.published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="mt-3 block text-[#5c554e] md:mt-0 md:table-cell md:px-5 md:py-4">
                        <span className="mr-2 text-[11px] font-semibold uppercase tracking-wide text-[#746d64] md:hidden">Updated</span>
                        {formatDate(leadMagnet.updatedAt)}
                      </td>
                      <td className="mt-4 block md:mt-0 md:table-cell md:px-5 md:py-4">
                        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[#746d64] md:hidden">
                          Actions
                        </span>
                        <div className="flex flex-nowrap items-center gap-2 md:justify-end">
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
