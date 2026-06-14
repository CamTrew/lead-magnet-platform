'use client';

import type { FormEvent } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ExternalLink,
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
import type { DashboardPayload, LeadMagnet } from '@/lib/types';
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
  downloadLink,
  error,
  isCreating,
  onClose,
  onSubmit,
  setDownloadLink,
  setSlug,
  setSlugTouched,
  setTitle,
  slug,
  slugTouched,
  title,
}: {
  downloadLink: string;
  error: string;
  isCreating: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setDownloadLink: (value: string) => void;
  setSlug: (value: string) => void;
  setSlugTouched: (value: boolean) => void;
  setTitle: (value: string) => void;
  slug: string;
  slugTouched: boolean;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#09090b]/20 p-4 backdrop-blur-sm">
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
        className="relative z-10 w-full max-w-md rounded-lg border border-[#d4d4d8] bg-white p-6 shadow-sm"
        role="dialog"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-950">Create a magnet</h2>
            <p className="mt-1 text-sm leading-6 text-ink-600">
              Name the page and add the link people will get by email.
            </p>
          </div>
          <button
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#71717a] transition hover:bg-[#f4f4f5] hover:text-[#18181b] disabled:opacity-50"
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

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-700">Resource URL</span>
            <AceternityInput
              disabled={isCreating}
              maxLength={2048}
              onChange={(event) => setDownloadLink(event.target.value)}
              placeholder="https://example.com/my-guide.pdf"
              required
              type="url"
              value={downloadLink}
            />
            <span className="mt-1.5 block text-xs leading-5 text-ink-500">
              Where the download button in the email points. You can change this later.
            </span>
          </label>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-[#e4e4e7] pt-4">
            <AceternityButton disabled={isCreating} onClick={onClose} type="button" variant="secondary">
              Cancel
            </AceternityButton>
            <AceternityButton
              disabled={isCreating || !title.trim() || !downloadLink.trim() || !slug.trim()}
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

function publicUrl(account: DashboardPayload['account'], slug: string) {
  const subdomain = account.subdomain?.trim();
  const domain = account.domain?.trim();
  if (!domain) return null;
  const host = subdomain ? `${subdomain}.${domain}` : domain;
  return `https://${host}/${slug}`;
}

function platformUrl(id: string) {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/p/${id}`;
  }
  return `/p/${id}`;
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
  const [createDownloadLink, setCreateDownloadLink] = useState('');
  const [createState, setCreateState] = useState<SaveState>('idle');
  const [openingPageId, setOpeningPageId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [createError, setCreateError] = useState('');
  const isCreating = createState === 'saving';
  const isOpening = Boolean(openingPageId) || isPending;
  const actionLabel = isOpening ? 'Opening editor' : isCreating ? 'Creating page' : 'New page';

  function openCreateDialog() {
    if (isCreating || isOpening) return;
    setCreateError('');
    setError('');
    setCreateOpen(true);
  }

  function closeCreateDialog() {
    if (isCreating) return;
    setCreateOpen(false);
    setCreateError('');
    // Drop in-flight state so reopening the modal starts from scratch.
    setCreateTitle('');
    setCreateSlug('');
    setCreateSlugTouched(false);
    setCreateDownloadLink('');
    setCreateState('idle');
  }

  async function createLeadMagnet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCreating || isOpening) return;

    const title = createTitle.trim();
    const downloadLink = createDownloadLink.trim();
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
    if (!downloadLink) {
      setCreateError('Add the URL people will get by email.');
      return;
    }
    try {
      const parsed = new URL(downloadLink);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setCreateError('Resource URL must start with http:// or https://');
        return;
      }
    } catch {
      setCreateError('Resource URL is not a valid URL.');
      return;
    }

    setCreateState('saving');
    setError('');
    setCreateError('');

    try {
      const response = await fetch('/api/lead-magnets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, slug, downloadLink }),
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
      setCreateDownloadLink('');
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
    if (isCreating || isOpening) return;

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
          downloadLink={createDownloadLink}
          error={createError}
          isCreating={isCreating}
          onClose={closeCreateDialog}
          onSubmit={createLeadMagnet}
          setDownloadLink={setCreateDownloadLink}
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
          <div className="flex flex-col gap-4 border-b border-[#e4e4e7] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-black text-[#09090b]">All pages</h2>
              <p className="mt-1 text-sm text-[#52525b]">
                Open a page to edit the copy, email, and download link.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <AceternityButton className="min-w-[152px]" disabled={isCreating || isOpening} onClick={openCreateDialog}>
                {isCreating || isOpening ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {actionLabel}
              </AceternityButton>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-[#e4e4e7] bg-[#fafafa] text-xs font-black uppercase text-[#71717a]">
                <tr>
                  <th className="px-5 py-3">Page</th>
                  <th className="px-5 py-3">Path</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Updated</th>
                  <th className="w-32 px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e4e4e7]">
                {leadMagnets.length === 0 && !isCreating && (
                  <tr className="bg-white">
                    <td colSpan={5} className="px-5 py-10 text-center">
                      <p className="font-black text-[#09090b]">No pages yet</p>
                      <p className="mt-1 text-sm text-[#71717a]">Create a page when the resource is ready.</p>
                      <AceternityButton className="mt-4 min-w-[152px]" disabled={isOpening} onClick={openCreateDialog}>
                        <Plus className="h-4 w-4" />
                        Create page
                      </AceternityButton>
                    </td>
                  </tr>
                )}
                {leadMagnets.map((leadMagnet) => (
                  <tr
                    key={leadMagnet.id}
                    className="bg-white transition hover:bg-[#fafafa]"
                  >
                    <td className="max-w-[320px] px-5 py-4">
                      <p className="truncate font-black text-[#09090b]">{leadMagnet.title}</p>
                      <p className="truncate text-xs text-[#71717a]">{leadMagnet.subtitle}</p>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-[#52525b]">/{leadMagnet.slug}</td>
                    <td className="px-5 py-4">
                      <span
                        className={cn(
                          'rounded-lg border px-2 py-1 text-xs font-bold',
                          leadMagnet.published
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-[#e4e4e7] bg-[#f4f4f5] text-[#18181b]'
                        )}
                      >
                        {leadMagnet.published ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[#52525b]">{formatDate(leadMagnet.updatedAt)}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        {leadMagnet.published && (() => {
                          const branded = publicUrl(account, leadMagnet.slug);
                          const fallback = platformUrl(leadMagnet.id);
                          const url = branded || fallback;
                          const title = branded
                            ? branded
                            : `Open on magnets.so. your branded URL appears once your domain is set up.`;
                          return (
                            <a
                              aria-label={`View ${leadMagnet.title}`}
                              className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-ink-200 bg-white px-3 text-xs font-medium text-ink-900 transition hover:bg-ink-50"
                              href={url}
                              rel="noreferrer"
                              target="_blank"
                              title={title}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              View
                            </a>
                          );
                        })()}
                        <AceternityButton
                          aria-label={`Open ${leadMagnet.title}`}
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
                          Open
                        </AceternityButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AceternityCard>
      </div>
    </>
  );
}
