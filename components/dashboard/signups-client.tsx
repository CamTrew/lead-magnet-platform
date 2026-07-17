'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  ClipboardCheck,
  Download,
  FileText,
  ListFilter,
  Loader2,
  Mail,
  Plus,
  Search,
  Square,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  AceternityButton,
  AceternityCard,
  AceternityInput,
  Field,
} from '@/components/ui/aceternity';
import { PageHeader } from '@/components/dashboard/app-shell';
import { parseCsv } from '@/lib/csv';
import type { AccountSignup } from '@/lib/types';

type LeadMagnetOption = { id: string; title: string; slug: string };

type ImportSummary = { imported: number; skipped: number; invalid: number; total: number };

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

const MAX_CSV_CHARS = 2_000_000;
const MAX_PREVIEW_ROWS = 5;

export function SignupsClient({
  initialSignups,
  leadMagnets,
}: {
  initialSignups: AccountSignup[];
  leadMagnets: LeadMagnetOption[];
}) {
  const router = useRouter();
  const [signups, setSignups] = useState<AccountSignup[]>(initialSignups);
  const [search, setSearch] = useState('');
  const [leadMagnetFilter, setLeadMagnetFilter] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [signupToRemove, setSignupToRemove] = useState<AccountSignup | null>(null);
  const [stoppingEmail, setStoppingEmail] = useState('');
  const [actionError, setActionError] = useState('');

  const magnetFiltered = useMemo(() => {
    if (!leadMagnetFilter) return signups;
    return signups.filter((signup) =>
      signup.leadMagnets.some((magnet) => magnet.id === leadMagnetFilter)
    );
  }, [leadMagnetFilter, signups]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return magnetFiltered;
    return magnetFiltered.filter(
      (signup) =>
        signup.email.toLowerCase().includes(query) ||
        signup.name.toLowerCase().includes(query) ||
        signup.leadMagnets.some(
          (magnet) =>
            magnet.title.toLowerCase().includes(query) ||
            magnet.slug.toLowerCase().includes(query)
        )
    );
  }, [magnetFiltered, search]);

  const totalCount = signups.length;
  const exportCount = magnetFiltered.length;
  const matchCount = filtered.length;
  const hasMagnets = leadMagnets.length > 0;
  const exportHref = leadMagnetFilter
    ? `/api/signups/export?leadMagnetId=${encodeURIComponent(leadMagnetFilter)}`
    : '/api/signups/export';

  function onAfterImport() {
    setManualOpen(false);
    setImportOpen(false);
    router.refresh();
  }

  async function stopSequence(signup: AccountSignup) {
    if (stoppingEmail) return;
    setStoppingEmail(signup.email);
    setActionError('');
    try {
      const response = await fetch('/api/signups/sequence/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: signup.email,
          leadMagnetId: signup.firstLeadMagnetId,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || 'Could not stop sequence');
      }
      setSignups((current) =>
        current.map((item) =>
          item.email.toLowerCase() === signup.email.toLowerCase()
            ? {
                ...item,
                followUpStatus: 'stopped',
                followUpStopReason: 'manual',
                followUpStoppedAt: new Date().toISOString(),
              }
            : item
        )
      );
      router.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not stop sequence');
    } finally {
      setStoppingEmail('');
    }
  }

  return (
    <>
      <PageHeader title="Signups" subtitle="Everyone who has signed up to a magnet" />

      {manualOpen && (
        <ManualAddModal
          leadMagnets={leadMagnets}
          onClose={() => setManualOpen(false)}
          onSuccess={onAfterImport}
        />
      )}
      {importOpen && (
        <ImportModal
          leadMagnets={leadMagnets}
          onClose={() => setImportOpen(false)}
          onSuccess={onAfterImport}
        />
      )}
      {signupToRemove && (
        <RemoveSignupModal
          onClose={() => setSignupToRemove(null)}
          onRemoved={(email) => {
            setSignups((current) =>
              current.filter((signup) => signup.email.toLowerCase() !== email.toLowerCase())
            );
            setSignupToRemove(null);
            router.refresh();
          }}
          signup={signupToRemove}
        />
      )}

      <div className="mx-auto max-w-6xl space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <AceternityCard className="flex items-center gap-3 p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-ink-200 bg-ink-50 text-ink-900">
              <Users className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase text-ink-500">Unique signups</p>
              <p className="mt-0.5 text-2xl font-semibold text-ink-950">{totalCount}</p>
            </div>
          </AceternityCard>
          <AceternityCard className="flex items-center gap-3 p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-ink-200 bg-ink-50 text-ink-900">
              <Mail className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase text-ink-500">Latest signup</p>
              <p className="mt-0.5 truncate text-sm font-medium text-ink-900">
                {signups[0] ? formatDate(signups[0].latestSignupAt) : 'No signups yet'}
              </p>
            </div>
          </AceternityCard>
          <AceternityCard className="flex items-center gap-3 p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-ink-200 bg-ink-50 text-ink-900">
              <Download className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase text-ink-500">Export</p>
              <p className="mt-0.5 text-sm font-medium text-ink-900">CSV ready to download</p>
            </div>
          </AceternityCard>
        </div>

        <AceternityCard className="overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-ink-200 bg-white p-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 xl:max-w-sm">
              <h2 className="text-base font-semibold text-ink-950">All signups</h2>
              <p className="mt-1 text-sm text-ink-500">
                One row per email, deduplicated across every magnet on this account.
              </p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto xl:flex-nowrap xl:justify-end">
              <div className="relative w-full sm:w-auto xl:w-52">
                <ListFilter className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <select
                  aria-label="Filter signups by lead magnet"
                  className="h-9 w-full rounded-md border border-ink-200 bg-white py-0 pl-8 pr-8 text-sm text-ink-900 outline-none transition focus:border-ink-950 focus:ring-1 focus:ring-ink-950 sm:w-64 xl:w-52"
                  onChange={(event) => setLeadMagnetFilter(event.target.value)}
                  value={leadMagnetFilter}
                >
                  <option value="">All lead magnets</option>
                  {leadMagnets.map((magnet) => (
                    <option key={magnet.id} value={magnet.id}>
                      {magnet.title} (/{magnet.slug})
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative w-full sm:w-auto xl:w-52">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <AceternityInput
                  className="pl-8 sm:w-64 xl:w-52"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search email, name, or magnet"
                  value={search}
                />
              </div>
              <AceternityButton
                className="shrink-0"
                disabled={!hasMagnets}
                onClick={() => setManualOpen(true)}
                size="md"
                variant="secondary"
                title={hasMagnets ? 'Add a single email' : 'Create a magnet first'}
              >
                <Plus className="h-4 w-4" />
                Add manually
              </AceternityButton>
              <AceternityButton
                className="shrink-0"
                disabled={!hasMagnets}
                onClick={() => setImportOpen(true)}
                size="md"
                variant="secondary"
                title={hasMagnets ? 'Upload a CSV' : 'Create a magnet first'}
              >
                <Upload className="h-4 w-4" />
                Import CSV
              </AceternityButton>
              <a
                aria-disabled={exportCount === 0}
                className={
                  exportCount === 0
                    ? 'pointer-events-none inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-ink-200 bg-white px-3.5 text-sm font-medium text-ink-400 opacity-60'
                    : 'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-ink-950 bg-ink-950 px-3.5 text-sm font-medium text-white transition hover:bg-ink-800'
                }
                href={exportHref}
                download
              >
                <Download className="h-4 w-4" />
                Export CSV
              </a>
            </div>
          </div>

          {(search.trim() || leadMagnetFilter) && (
            <p className="border-b border-ink-200 bg-ink-50 px-5 py-2 text-xs font-medium text-ink-500">
              {matchCount} of {totalCount} signups match
            </p>
          )}
          {actionError && (
            <p className="border-b border-red-200 bg-red-50 px-5 py-2 text-xs font-medium text-red-700">
              {actionError}
            </p>
          )}

          <div className="w-full overflow-hidden">
            <table className="block w-full text-left text-sm xl:table xl:table-fixed">
              <colgroup className="hidden xl:table-column-group">
                <col className="w-[22%]" />
                <col className="w-[10%]" />
                <col className="w-[24%]" />
                <col className="w-[12%]" />
                <col className="w-[7%]" />
                <col className="w-[9%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead className="hidden border-b border-ink-200 bg-ink-50 text-xs font-medium uppercase text-ink-500 xl:table-header-group">
                <tr>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Lead magnets</th>
                  <th className="px-4 py-3">First signup</th>
                  <th className="px-4 py-3">Signups</th>
                  <th className="px-4 py-3">Sequence</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="block divide-y divide-ink-200 xl:table-row-group">
                {filtered.length === 0 ? (
                  <tr className="block bg-white xl:table-row">
                    <td colSpan={7} className="block px-5 py-12 text-center xl:table-cell">
                      <p className="font-semibold text-ink-950">
                        {totalCount === 0 ? 'No signups yet' : 'No matches'}
                      </p>
                      <p className="mt-1 text-sm text-ink-500">
                        {totalCount === 0
                          ? 'Signups appear here once someone enters their email on a published magnet. Or use Import CSV / Add manually.'
                          : 'Try a different search term or lead magnet filter.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((signup) => {
                    const associatedMagnets = signup.leadMagnets.length
                      ? signup.leadMagnets
                      : [
                          {
                            id: signup.firstLeadMagnetId,
                            title: signup.firstLeadMagnetTitle,
                            slug: signup.firstLeadMagnetSlug,
                          },
                        ];

                    return (
                    <tr key={signup.email} className="block bg-white px-5 py-4 transition hover:bg-ink-50 xl:table-row xl:px-0 xl:py-0">
                      <td className="block min-w-0 py-0 xl:table-cell xl:px-4 xl:py-3">
                        <p className="truncate font-medium text-ink-950">{signup.email}</p>
                      </td>
                      <td className="mt-2 block min-w-0 text-ink-700 xl:mt-0 xl:table-cell xl:px-4 xl:py-3">
                        {signup.name && <><span className="mr-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500 xl:hidden">Name</span><span className="break-words">{signup.name}</span></>}
                      </td>
                      <td className="mt-3 block min-w-0 xl:mt-0 xl:table-cell xl:px-4 xl:py-3">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-500 xl:hidden">Lead magnets</span>
                        <div className="space-y-1.5">
                          {associatedMagnets.map((magnet) => (
                            <div
                              className="flex min-w-0 items-center gap-2 rounded-lg border border-ink-200 bg-ink-50/70 px-2.5 py-2"
                              key={magnet.id}
                              title={`/${magnet.slug}`}
                            >
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-600">
                                <FileText className="h-3.5 w-3.5" />
                              </span>
                              <span className="line-clamp-2 min-w-0 text-xs font-medium leading-4 text-ink-800">
                                {magnet.title}
                              </span>
                            </div>
                          ))}
                        </div>
                        {signup.quizAnswers.length > 0 && (
                          <details className="group mt-2 max-w-xs text-xs text-ink-600">
                            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 font-medium text-ink-700 transition hover:bg-ink-50 hover:text-ink-950 [&::-webkit-details-marker]:hidden">
                              <ClipboardCheck className="h-4 w-4 text-ink-500" />
                              <span>{signup.quizAnswers.length} quiz {signup.quizAnswers.length === 1 ? 'answer' : 'answers'}</span>
                              <ChevronDown className="ml-auto h-3.5 w-3.5 text-ink-400 transition-transform duration-200 group-open:rotate-180" />
                            </summary>
                            <div className="mt-1.5 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
                              {signup.quizAnswers.map((answer, index) => (
                                <div
                                  className="border-b border-ink-100 px-3 py-2.5 last:border-b-0"
                                  key={`${answer.question}-${answer.optionLabel}-${index}`}
                                >
                                  <p className="text-[10px] font-medium uppercase leading-4 tracking-wide text-ink-400">
                                    {answer.question}
                                  </p>
                                  <p className="mt-0.5 break-words text-xs font-semibold leading-5 text-ink-900">
                                    {answer.optionLabel}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </td>
                      <td className="mt-3 block text-ink-600 xl:mt-0 xl:table-cell xl:px-4 xl:py-3">
                        <span className="mr-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500 xl:hidden">First signup</span>
                        {formatDate(signup.firstSignupAt)}
                      </td>
                      <td className="mt-3 block xl:mt-0 xl:table-cell xl:px-4 xl:py-3">
                        <span className="mr-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500 xl:hidden">Signups</span>
                        <span className="inline-flex rounded-md border border-ink-200 bg-ink-50 px-2 py-0.5 text-xs font-medium text-ink-800">
                          {signup.signupCount}
                        </span>
                      </td>
                      <td className="mt-3 block xl:mt-0 xl:table-cell xl:px-4 xl:py-3">
                        <span className="mr-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500 xl:hidden">Sequence</span>
                        <SequenceStatus signup={signup} />
                      </td>
                      <td className="mt-4 block xl:mt-0 xl:table-cell xl:px-4 xl:py-3">
                        <div className="flex gap-1 xl:justify-end">
                          {signup.followUpStatus === 'active' && (
                            <button
                              aria-label={`Stop sequence for ${signup.email}`}
                              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-xs font-medium text-ink-700 transition hover:bg-ink-100 hover:text-ink-950 disabled:opacity-50"
                              disabled={stoppingEmail === signup.email}
                              onClick={() => stopSequence(signup)}
                              title="Stop follow-up sequence"
                              type="button"
                            >
                              {stoppingEmail === signup.email ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Square className="h-4 w-4" />
                              )}
                              {stoppingEmail === signup.email ? 'Stopping' : 'Stop sequence'}
                            </button>
                          )}
                          <button
                            aria-label={`Remove ${signup.email}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-500 transition hover:bg-red-50 hover:text-red-700"
                            onClick={() => setSignupToRemove(signup)}
                            title="Remove signup"
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </AceternityCard>
      </div>
    </>
  );
}

function SequenceStatus({ signup }: { signup: AccountSignup }) {
  const status = signup.followUpStatus;
  if (status === 'none') {
    return <span className="text-xs text-ink-400">None</span>;
  }

  const className =
    status === 'active'
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : status === 'stopped'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : status === 'completed'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-red-200 bg-red-50 text-red-700';
  const label =
    status === 'active'
      ? 'Active'
      : status === 'stopped'
        ? 'Stopped'
        : status === 'completed'
          ? 'Completed'
          : 'Failed';

  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

function ModalShell({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/20 p-4 backdrop-blur-sm">
      <button aria-label="Close" className="absolute inset-0" onClick={onClose} type="button" />
      <div
        aria-modal="true"
        className="relative z-10 w-full max-w-xl rounded-lg border border-ink-200 bg-white shadow-xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
          <h2 className="text-base font-semibold text-ink-950">{title}</h2>
          <button
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function RemoveSignupModal({
  onClose,
  onRemoved,
  signup,
}: {
  onClose: () => void;
  onRemoved: (email: string) => void;
  signup: AccountSignup;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function removeSignup() {
    if (busy) return;
    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/signups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: signup.email }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || 'Could not remove this signup');
      }

      onRemoved(signup.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <ModalShell onClose={onClose} title="Remove signup">
      <div className="space-y-4">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Remove {signup.email}?</p>
          <p className="mt-1 leading-6">
            This removes the email from your signups list across every magnet on this account. It does not unsubscribe them
            from Beehiiv, Substack, or any external tool.
          </p>
        </div>
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-ink-200 pt-4">
          <AceternityButton disabled={busy} onClick={onClose} type="button" variant="secondary">
            Cancel
          </AceternityButton>
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-red-600 bg-red-600 px-3.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:pointer-events-none disabled:opacity-60"
            disabled={busy}
            onClick={removeSignup}
            type="button"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Remove signup
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function MagnetSelect({
  leadMagnets,
  onChange,
  value,
}: {
  leadMagnets: LeadMagnetOption[];
  onChange: (id: string) => void;
  value: string;
}) {
  return (
    <select
      className="h-10 w-full rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900 outline-none focus:border-ink-950 focus:ring-1 focus:ring-ink-950 sm:h-9"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {leadMagnets.map((magnet) => (
        <option key={magnet.id} value={magnet.id}>
          {magnet.title} (/{magnet.slug})
        </option>
      ))}
    </select>
  );
}

function ManualAddModal({
  leadMagnets,
  onClose,
  onSuccess,
}: {
  leadMagnets: LeadMagnetOption[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [leadMagnetId, setLeadMagnetId] = useState(leadMagnets[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/signups/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'manual',
          leadMagnetId,
          name: name.trim(),
          email: email.trim(),
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || 'Could not add this signup');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <ModalShell onClose={onClose} title="Add a signup manually">
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Lead magnet">
          <MagnetSelect leadMagnets={leadMagnets} onChange={setLeadMagnetId} value={leadMagnetId} />
        </Field>
        <Field label="Name">
          <AceternityInput
            autoFocus
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            placeholder="Full name"
            required
            value={name}
          />
        </Field>
        <Field label="Email">
          <AceternityInput
            maxLength={254}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="person@example.com"
            required
            type="email"
            value={email}
          />
        </Field>
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-ink-200 pt-4">
          <AceternityButton onClick={onClose} type="button" variant="secondary" disabled={busy}>
            Cancel
          </AceternityButton>
          <AceternityButton type="submit" disabled={busy || !leadMagnetId}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add signup
          </AceternityButton>
        </div>
      </form>
    </ModalShell>
  );
}

type ImportStage = 'pick' | 'map' | 'importing' | 'done';

function ImportModal({
  leadMagnets,
  onClose,
  onSuccess,
}: {
  leadMagnets: LeadMagnetOption[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [stage, setStage] = useState<ImportStage>('pick');
  const [csvText, setCsvText] = useState('');
  const [headerRow, setHeaderRow] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [emailColumn, setEmailColumn] = useState<number | null>(null);
  const [nameColumn, setNameColumn] = useState<number | null>(null);
  const [leadMagnetId, setLeadMagnetId] = useState(leadMagnets[0]?.id || '');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.size > MAX_CSV_CHARS) {
      setError('CSV is larger than 2 MB. Split the file and import in batches.');
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      setError('Could not read the file.');
      return;
    }

    const rows = parseCsv(text);
    if (rows.length === 0) {
      setError('CSV looks empty.');
      return;
    }

    setError('');
    setCsvText(text);
    setHeaderRow(rows[0]);
    setPreviewRows(rows.slice(0, MAX_PREVIEW_ROWS + 1));
    setEmailColumn(null);
    setNameColumn(null);
    setStage('map');
  }

  async function submit() {
    if (emailColumn == null) {
      setError('Pick which column has the email address.');
      return;
    }
    if (!leadMagnetId) {
      setError('Pick a magnet to attach these signups to.');
      return;
    }

    setStage('importing');
    setError('');

    try {
      const response = await fetch('/api/signups/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'csv',
          leadMagnetId,
          csv: csvText,
          hasHeader,
          emailColumn,
          nameColumn,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | (ImportSummary & { error?: string })
        | null;

      if (!response.ok || !data) {
        throw new Error((data && data.error) || 'Import failed');
      }

      setSummary({
        imported: data.imported,
        skipped: data.skipped,
        invalid: data.invalid,
        total: data.total,
      });
      setStage('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStage('map');
    }
  }

  return (
    <ModalShell onClose={onClose} title="Import signups from CSV">
      {stage === 'pick' && (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-ink-600">
            Upload a CSV file (up to 2 MB, up to 5,000 rows). On the next screen, you&apos;ll pick which column has the email
            address and which magnet to attach the imports to. We dedupe by email.
          </p>
          <button
            className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-ink-300 bg-ink-50 text-sm font-medium text-ink-700 transition hover:bg-white"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Upload className="h-5 w-5" />
            Choose CSV file
          </button>
          <input
            accept=".csv,text/csv"
            className="hidden"
            onChange={onFile}
            ref={fileInputRef}
            type="file"
          />
          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
              {error}
            </p>
          )}
        </div>
      )}

      {stage === 'map' && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Attach signups to magnet">
              <MagnetSelect leadMagnets={leadMagnets} onChange={setLeadMagnetId} value={leadMagnetId} />
            </Field>
            <Field label="First row">
              <select
                className="h-10 w-full rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900 outline-none focus:border-ink-950 focus:ring-1 focus:ring-ink-950 sm:h-9"
                onChange={(event) => setHasHeader(event.target.value === 'header')}
                value={hasHeader ? 'header' : 'data'}
              >
                <option value="header">Is a header row</option>
                <option value="data">Contains data (no header)</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email column">
              <ColumnSelect
                columns={hasHeader ? headerRow : headerRow.map((_, i) => `Column ${i + 1}`)}
                emptyLabel="Pick a column"
                onChange={(value) => setEmailColumn(value)}
                value={emailColumn}
              />
            </Field>
            <Field label="Name column (optional)">
              <ColumnSelect
                columns={hasHeader ? headerRow : headerRow.map((_, i) => `Column ${i + 1}`)}
                emptyLabel="No name column"
                onChange={(value) => setNameColumn(value)}
                value={nameColumn}
              />
            </Field>
          </div>

          <div className="overflow-hidden rounded-md border border-ink-200">
            <p className="border-b border-ink-200 bg-ink-50 px-3 py-2 text-xs font-medium text-ink-500">
              Preview
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white text-ink-500">
                  <tr>
                    {(hasHeader ? headerRow : headerRow.map((_, i) => `Column ${i + 1}`)).map((cell, index) => (
                      <th
                        key={index}
                        className={`whitespace-nowrap border-b border-ink-200 px-3 py-2 font-medium ${
                          index === emailColumn ? 'bg-emerald-50 text-emerald-700' : ''
                        } ${index === nameColumn ? 'bg-blue-50 text-blue-700' : ''}`}
                      >
                        {cell || `Column ${index + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {(hasHeader ? previewRows.slice(1) : previewRows).slice(0, MAX_PREVIEW_ROWS).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {headerRow.map((_, colIndex) => (
                        <td
                          key={colIndex}
                          className={`whitespace-nowrap px-3 py-1.5 text-ink-700 ${
                            colIndex === emailColumn ? 'bg-emerald-50' : ''
                          } ${colIndex === nameColumn ? 'bg-blue-50' : ''}`}
                        >
                          {row[colIndex] || ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-ink-200 pt-4">
            <AceternityButton onClick={onClose} type="button" variant="secondary">
              Cancel
            </AceternityButton>
            <AceternityButton onClick={submit} type="button" disabled={emailColumn == null || !leadMagnetId}>
              <Upload className="h-4 w-4" />
              Import
            </AceternityButton>
          </div>
        </div>
      )}

      {stage === 'importing' && (
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-sm text-ink-600">
          <Loader2 className="h-6 w-6 animate-spin text-ink-700" />
          <p>Importing…</p>
        </div>
      )}

      {stage === 'done' && summary && (
        <div className="space-y-4">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-semibold">Import finished.</p>
            <p className="mt-1">
              Imported <strong>{summary.imported}</strong> of {summary.total} rows. Skipped{' '}
              <strong>{summary.skipped}</strong> duplicates and ignored <strong>{summary.invalid}</strong> rows with
              missing/invalid emails.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <AceternityButton onClick={onSuccess} type="button">
              Done
            </AceternityButton>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function ColumnSelect({
  columns,
  emptyLabel,
  onChange,
  value,
}: {
  columns: string[];
  emptyLabel: string;
  onChange: (value: number | null) => void;
  value: number | null;
}) {
  return (
    <select
      className="h-10 w-full rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900 outline-none focus:border-ink-950 focus:ring-1 focus:ring-ink-950 sm:h-9"
      onChange={(event) => {
        const raw = event.target.value;
        if (raw === '') onChange(null);
        else {
          const index = Number.parseInt(raw, 10);
          onChange(Number.isNaN(index) ? null : index);
        }
      }}
      value={value == null ? '' : String(value)}
    >
      <option value="">{emptyLabel}</option>
      {columns.map((label, index) => (
        <option key={index} value={index}>
          {label || `Column ${index + 1}`}
        </option>
      ))}
    </select>
  );
}
