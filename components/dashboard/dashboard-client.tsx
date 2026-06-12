'use client';

/* eslint-disable @next/next/no-img-element */

import type { ChangeEvent, ReactNode } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AccountSettings, DashboardPayload } from '@/lib/types';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const inputClass =
  'h-11 rounded-xl border-2 border-brand-teal-200 bg-white px-4 text-sm shadow-sm transition focus:border-brand-teal-500 focus:ring-1 focus:ring-brand-teal-500';

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function StatusPill({ state }: { state: SaveState }) {
  if (state === 'idle') return null;

  const label = state === 'saving' ? 'Saving' : state === 'saved' ? 'Saved' : 'Error';
  const className =
    state === 'error'
      ? 'bg-red-50 text-red-600'
      : state === 'saved'
        ? 'bg-brand-lime-100 text-brand-lime-700'
        : 'bg-brand-teal-50 text-brand-teal-700';

  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${className}`}>{label}</span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-brand-teal-700">
        {label}
      </span>
      {children}
    </label>
  );
}

function Header({ account, onLogout }: { account: AccountSettings; onLogout: () => void }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-teal-600">
            Lead Magnet Platform
          </p>
          <h1 className="text-xl font-bold text-brand-teal-900">{account.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-brand-teal-50 px-4 py-2 text-sm font-semibold text-brand-teal-700"
          >
            Settings
          </Link>
          <Link
            href="/dashboard/pages"
            className="rounded-lg border border-brand-teal-200 px-4 py-2 text-sm font-semibold text-brand-teal-700 transition hover:border-brand-teal-500 hover:bg-brand-teal-50"
          >
            Pages
          </Link>
          <Button variant="outline" onClick={onLogout} className="rounded-lg">
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}

export function DashboardClient({ initialData }: { initialData: DashboardPayload }) {
  const router = useRouter();
  const [account, setAccount] = useState<AccountSettings>(initialData.account);
  const [accountState, setAccountState] = useState<SaveState>('idle');
  const [error, setError] = useState('');

  function patchAccount(updates: Partial<AccountSettings>) {
    setAccount((current) => ({ ...current, ...updates }));
  }

  function patchBrand(updates: Partial<AccountSettings['brand']>) {
    setAccount((current) => ({ ...current, brand: { ...current.brand, ...updates } }));
  }

  async function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    patchAccount({ logoUrl: await readFileAsDataUrl(file) });
  }

  async function saveAccount() {
    setAccountState('saving');
    setError('');

    try {
      const response = await fetch('/api/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: account.name,
          subdomain: account.subdomain,
          logoUrl: account.logoUrl,
          logoText: account.logoText,
          brand: account.brand,
          resendApiKey: account.resendApiKey,
          resendFromEmail: account.resendFromEmail,
          beehiivApiKey: account.beehiivApiKey,
          beehiivPublicationId: account.beehiivPublicationId,
        }),
      });

      if (!response.ok) throw new Error('Account settings could not be saved');
      const data = (await response.json()) as { account: AccountSettings };
      setAccount(data.account);
      setAccountState('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setAccountState('error');
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-50 text-gray-900">
      <Header account={account} onLogout={logout} />

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {error && <p className="rounded-xl bg-red-50 p-4 text-sm font-medium text-red-600">{error}</p>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-brand-teal-900">Workspace</h2>
              <p className="text-sm text-gray-500">
                Choose the brand shown on your lead magnet pages.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusPill state={accountState} />
              <Button onClick={saveAccount} className="rounded-xl bg-brand-teal-700 text-white hover:bg-brand-teal-800">
                Save Settings
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Workspace name">
              <Input value={account.name} onChange={(event) => patchAccount({ name: event.target.value })} className={inputClass} />
            </Field>
            <Field label="Subdomain">
              <Input value={account.subdomain} onChange={(event) => patchAccount({ subdomain: event.target.value.toLowerCase() })} className={inputClass} />
            </Field>
            <Field label="Logo upload">
              <Input type="file" accept="image/*" onChange={handleLogoUpload} className="h-11 rounded-xl border-2 border-brand-teal-200 bg-white text-sm" />
            </Field>
            <Field label="Logo text">
              <Input value={account.logoText} onChange={(event) => patchAccount({ logoText: event.target.value })} className={inputClass} />
            </Field>
            <Field label="Primary color">
              <Input type="color" value={account.brand.primary} onChange={(event) => patchBrand({ primary: event.target.value })} className="h-11 rounded-xl border-2 border-brand-teal-200 bg-white p-1" />
            </Field>
            <Field label="Accent color">
              <Input type="color" value={account.brand.accent} onChange={(event) => patchBrand({ accent: event.target.value })} className="h-11 rounded-xl border-2 border-brand-teal-200 bg-white p-1" />
            </Field>
            <Field label="Success color">
              <Input type="color" value={account.brand.success} onChange={(event) => patchBrand({ success: event.target.value })} className="h-11 rounded-xl border-2 border-brand-teal-200 bg-white p-1" />
            </Field>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              {account.logoUrl ? (
                <img src={account.logoUrl} alt={account.name} className="max-h-16 max-w-full object-contain" />
              ) : (
                <p className="text-sm font-semibold text-brand-teal-700">{account.logoText}</p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-5 text-lg font-bold text-brand-teal-900">Integrations</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Resend API key">
              <Input value={account.resendApiKey} onChange={(event) => patchAccount({ resendApiKey: event.target.value })} className={inputClass} placeholder="re_..." />
            </Field>
            <Field label="Verified sender">
              <Input value={account.resendFromEmail} onChange={(event) => patchAccount({ resendFromEmail: event.target.value })} className={inputClass} placeholder="Brand <hello@example.com>" />
            </Field>
            <Field label="Beehiiv API key">
              <Input value={account.beehiivApiKey} onChange={(event) => patchAccount({ beehiivApiKey: event.target.value })} className={inputClass} />
            </Field>
            <Field label="Beehiiv publication ID">
              <Input value={account.beehiivPublicationId} onChange={(event) => patchAccount({ beehiivPublicationId: event.target.value })} className={inputClass} />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-brand-teal-900">Lead Magnet Pages</h2>
              <p className="text-sm text-gray-500">
                {initialData.leadMagnets.length} page{initialData.leadMagnets.length === 1 ? '' : 's'} created.
              </p>
            </div>
            <Link
              href="/dashboard/pages"
              className="rounded-xl bg-brand-teal-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-teal-800"
            >
              Manage Pages
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
