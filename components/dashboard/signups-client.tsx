'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Download,
  Loader2,
  Mail,
  Plus,
  Search,
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
  const [signups] = useState<AccountSignup[]>(initialSignups);
  const [search, setSearch] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return signups;
    return signups.filter(
      (signup) =>
        signup.email.toLowerCase().includes(query) ||
        signup.name.toLowerCase().includes(query) ||
        signup.firstLeadMagnetTitle.toLowerCase().includes(query)
    );
  }, [signups, search]);

  const totalCount = signups.length;
  const matchCount = filtered.length;
  const hasMagnets = leadMagnets.length > 0;

  function onAfterImport() {
    setManualOpen(false);
    setImportOpen(false);
    router.refresh();
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

      <div className="mx-auto max-w-6xl space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <AceternityCard className="flex items-center gap-3 p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-ink-200 bg-ink-50 text-ink-900">
              <Users className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Unique signups</p>
              <p className="mt-0.5 text-2xl font-semibold text-ink-950">{totalCount}</p>
            </div>
          </AceternityCard>
          <AceternityCard className="flex items-center gap-3 p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-ink-200 bg-ink-50 text-ink-900">
              <Mail className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Latest signup</p>
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
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Export</p>
              <p className="mt-0.5 text-sm font-medium text-ink-900">CSV ready to download</p>
            </div>
          </AceternityCard>
        </div>

        <AceternityCard className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-ink-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-ink-950">All signups</h2>
              <p className="mt-1 text-sm text-ink-500">
                One row per email, deduplicated across every magnet on this account.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <AceternityInput
                  className="pl-8"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search email, name, or magnet"
                  value={search}
                />
              </div>
              <AceternityButton
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
                aria-disabled={totalCount === 0}
                className={
                  totalCount === 0
                    ? 'pointer-events-none inline-flex h-9 items-center justify-center gap-2 rounded-md border border-ink-200 bg-white px-3.5 text-sm font-medium text-ink-400 opacity-60'
                    : 'inline-flex h-9 items-center justify-center gap-2 rounded-md border border-ink-950 bg-ink-950 px-3.5 text-sm font-medium text-white transition hover:bg-ink-800'
                }
                href="/api/signups/export"
                download
              >
                <Download className="h-4 w-4" />
                Export CSV
              </a>
            </div>
          </div>

          {search.trim() && (
            <p className="border-b border-ink-200 bg-ink-50 px-5 py-2 text-xs font-medium text-ink-500">
              {matchCount} of {totalCount} signups match
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-ink-200 bg-ink-50 text-xs font-medium uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">First magnet</th>
                  <th className="px-5 py-3">First signup</th>
                  <th className="px-5 py-3">Signups</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {filtered.length === 0 ? (
                  <tr className="bg-white">
                    <td colSpan={5} className="px-5 py-12 text-center">
                      <p className="font-semibold text-ink-950">
                        {totalCount === 0 ? 'No signups yet' : 'No matches'}
                      </p>
                      <p className="mt-1 text-sm text-ink-500">
                        {totalCount === 0
                          ? 'Signups appear here once someone enters their email on a published magnet. or use Import CSV / Add manually.'
                          : 'Try a different search term.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((signup) => (
                    <tr key={signup.email} className="bg-white transition hover:bg-ink-50">
                      <td className="px-5 py-3">
                        <p className="truncate font-medium text-ink-950">{signup.email}</p>
                      </td>
                      <td className="px-5 py-3 text-ink-700">{signup.name}</td>
                      <td className="px-5 py-3">
                        <p className="truncate text-ink-700">{signup.firstLeadMagnetTitle}</p>
                        <p className="truncate font-mono text-xs text-ink-500">/{signup.firstLeadMagnetSlug}</p>
                      </td>
                      <td className="px-5 py-3 text-ink-600">{formatDate(signup.firstSignupAt)}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex rounded-md border border-ink-200 bg-ink-50 px-2 py-0.5 text-xs font-medium text-ink-800">
                          {signup.signupCount}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </AceternityCard>
      </div>
    </>
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
      className="h-9 w-full rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900 outline-none focus:border-ink-950 focus:ring-1 focus:ring-ink-950"
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
                className="h-9 w-full rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900 outline-none focus:border-ink-950 focus:ring-1 focus:ring-ink-950"
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
      className="h-9 w-full rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900 outline-none focus:border-ink-950 focus:ring-1 focus:ring-ink-950"
      onChange={(event) => {
        const raw = event.target.value;
        if (raw === '') onChange(null);
        else onChange(Number(raw));
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

