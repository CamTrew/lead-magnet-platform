'use client';

/* eslint-disable @next/next/no-img-element */

import type { ChangeEvent, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AccountSettings, DashboardPayload, LeadMagnet } from '@/lib/types';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const textareaClass =
  'min-h-28 w-full rounded-xl border-2 border-brand-teal-200 bg-white px-4 py-3 text-sm leading-6 text-gray-700 shadow-sm outline-none transition focus:border-brand-teal-500 focus:ring-1 focus:ring-brand-teal-500';
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

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-brand-teal-700">
        {label}
      </span>
      {children}
    </label>
  );
}

export function DashboardClient({ initialData }: { initialData: DashboardPayload }) {
  const router = useRouter();
  const [account, setAccount] = useState<AccountSettings>(initialData.account);
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnet[]>(initialData.leadMagnets);
  const [selectedId, setSelectedId] = useState(initialData.leadMagnets[0]?.id || '');
  const [accountState, setAccountState] = useState<SaveState>('idle');
  const [leadMagnetState, setLeadMagnetState] = useState<SaveState>('idle');
  const [error, setError] = useState('');

  const selectedLeadMagnet = useMemo(
    () => leadMagnets.find((leadMagnet) => leadMagnet.id === selectedId) || leadMagnets[0],
    [leadMagnets, selectedId]
  );

  const localPreviewUrl = selectedLeadMagnet ? `/${selectedLeadMagnet.slug}` : '/';
  const customPreviewUrl = selectedLeadMagnet
    ? `https://${account.subdomain}.${account.domain}/${selectedLeadMagnet.slug}`
    : `https://${account.subdomain}.${account.domain}/slug`;

  function patchAccount(updates: Partial<AccountSettings>) {
    setAccount((current) => ({ ...current, ...updates }));
  }

  function patchBrand(updates: Partial<AccountSettings['brand']>) {
    setAccount((current) => ({ ...current, brand: { ...current.brand, ...updates } }));
  }

  function patchSelectedLeadMagnet(updates: Partial<LeadMagnet>) {
    if (!selectedLeadMagnet) return;
    setLeadMagnets((current) =>
      current.map((leadMagnet) =>
        leadMagnet.id === selectedLeadMagnet.id ? { ...leadMagnet, ...updates } : leadMagnet
      )
    );
  }

  async function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    patchAccount({ logoUrl: await readFileAsDataUrl(file) });
  }

  async function handleLeadMagnetImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    patchSelectedLeadMagnet({ imageUrl: await readFileAsDataUrl(file) });
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
          domain: account.domain,
          logoUrl: account.logoUrl,
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

  async function createLeadMagnet() {
    setLeadMagnetState('saving');
    setError('');

    try {
      const response = await fetch('/api/lead-magnets', { method: 'POST' });
      if (!response.ok) throw new Error('Lead magnet could not be created');
      const data = (await response.json()) as { leadMagnet: LeadMagnet };
      setLeadMagnets((current) => [...current, data.leadMagnet]);
      setSelectedId(data.leadMagnet.id);
      setLeadMagnetState('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLeadMagnetState('error');
    }
  }

  async function saveLeadMagnet() {
    if (!selectedLeadMagnet) return;
    setLeadMagnetState('saving');
    setError('');

    try {
      const response = await fetch(`/api/lead-magnets/${selectedLeadMagnet.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: selectedLeadMagnet.slug,
          title: selectedLeadMagnet.title,
          subtitle: selectedLeadMagnet.subtitle,
          description: selectedLeadMagnet.description,
          bullets: selectedLeadMagnet.bullets,
          bulletsHeading: selectedLeadMagnet.bulletsHeading,
          ctaText: selectedLeadMagnet.ctaText,
          formHeading: selectedLeadMagnet.formHeading,
          formSubtext: selectedLeadMagnet.formSubtext,
          imageUrl: selectedLeadMagnet.imageUrl,
          downloadLink: selectedLeadMagnet.downloadLink,
          emailSubject: selectedLeadMagnet.emailSubject,
          emailBody: selectedLeadMagnet.emailBody,
          emailPreview: selectedLeadMagnet.emailPreview,
          published: selectedLeadMagnet.published,
        }),
      });

      if (!response.ok) throw new Error('Lead magnet could not be saved');
      const data = (await response.json()) as { leadMagnet: LeadMagnet };
      setLeadMagnets((current) =>
        current.map((leadMagnet) =>
          leadMagnet.id === data.leadMagnet.id ? data.leadMagnet : leadMagnet
        )
      );
      setLeadMagnetState('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLeadMagnetState('error');
    }
  }

  async function deleteSelectedLeadMagnet() {
    if (!selectedLeadMagnet) return;
    setLeadMagnetState('saving');
    setError('');

    try {
      const response = await fetch(`/api/lead-magnets/${selectedLeadMagnet.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Lead magnet could not be deleted');
      setLeadMagnets((current) => current.filter((leadMagnet) => leadMagnet.id !== selectedLeadMagnet.id));
      setSelectedId(leadMagnets.find((leadMagnet) => leadMagnet.id !== selectedLeadMagnet.id)?.id || '');
      setLeadMagnetState('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLeadMagnetState('error');
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-50 text-gray-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-teal-600">
              Lead Magnet Platform
            </p>
            <h1 className="text-xl font-bold text-brand-teal-900">{account.name}</h1>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={localPreviewUrl}
              target="_blank"
              className="rounded-lg border border-brand-teal-200 px-4 py-2 text-sm font-semibold text-brand-teal-700 transition hover:border-brand-teal-500 hover:bg-brand-teal-50"
            >
              Preview
            </a>
            <Button variant="outline" onClick={logout} className="rounded-lg">
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[320px_1fr] lg:px-8">
        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-gray-500">Pages</h2>
              <Button onClick={createLeadMagnet} size="sm" className="rounded-lg bg-brand-teal-700 text-white hover:bg-brand-teal-800">
                New
              </Button>
            </div>
            <div className="space-y-2">
              {leadMagnets.map((leadMagnet) => (
                <button
                  key={leadMagnet.id}
                  onClick={() => setSelectedId(leadMagnet.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    leadMagnet.id === selectedId
                      ? 'border-brand-teal-500 bg-brand-teal-50 text-brand-teal-900'
                      : 'border-slate-200 bg-white hover:border-brand-teal-200'
                  }`}
                >
                  <span className="block truncate text-sm font-bold">{leadMagnet.title}</span>
                  <span className="mt-1 block truncate text-xs text-gray-500">/{leadMagnet.slug}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-gray-500">DNS</h2>
            <div className="space-y-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="font-bold text-gray-700">CNAME</p>
                <p className="mt-1 font-mono text-xs text-gray-500">{account.subdomain}</p>
                <p className="font-mono text-xs text-gray-500">cname.vercel-dns.com</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="font-bold text-gray-700">TXT</p>
                <p className="mt-1 font-mono text-xs text-gray-500">_lead-magnet.{account.subdomain}</p>
                <p className="font-mono text-xs text-gray-500">lmp_verify_{account.id}</p>
              </div>
            </div>
          </section>
        </aside>

        <div className="space-y-6">
          {error && <p className="rounded-xl bg-red-50 p-4 text-sm font-medium text-red-600">{error}</p>}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-brand-teal-900">Workspace</h2>
                <p className="text-sm text-gray-500">{customPreviewUrl}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill state={accountState} />
                <Button onClick={saveAccount} className="rounded-xl bg-brand-teal-700 text-white hover:bg-brand-teal-800">
                  Save Workspace
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Workspace name">
                <Input value={account.name} onChange={(event) => patchAccount({ name: event.target.value })} className={inputClass} />
              </Field>
              <Field label="Domain">
                <Input value={account.domain} onChange={(event) => patchAccount({ domain: event.target.value })} className={inputClass} />
              </Field>
              <Field label="Subdomain">
                <Input value={account.subdomain} onChange={(event) => patchAccount({ subdomain: event.target.value.toLowerCase() })} className={inputClass} />
              </Field>
              <Field label="Logo upload">
                <Input type="file" accept="image/*" onChange={handleLogoUpload} className="h-11 rounded-xl border-2 border-brand-teal-200 bg-white text-sm" />
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
                  <p className="text-sm font-semibold text-brand-teal-700">{account.name}</p>
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

          {selectedLeadMagnet && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-brand-teal-900">Lead Magnet</h2>
                  <p className="text-sm text-gray-500">{localPreviewUrl}</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill state={leadMagnetState} />
                  <Button variant="outline" onClick={deleteSelectedLeadMagnet} className="rounded-xl border-red-200 text-red-600 hover:bg-red-50">
                    Delete
                  </Button>
                  <Button onClick={saveLeadMagnet} className="rounded-xl bg-brand-teal-700 text-white hover:bg-brand-teal-800">
                    Save Page
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="slug">
                  <Input value={selectedLeadMagnet.slug} onChange={(event) => patchSelectedLeadMagnet({ slug: event.target.value.toLowerCase() })} className={inputClass} />
                </Field>
                <Field label="published">
                  <button
                    type="button"
                    onClick={() => patchSelectedLeadMagnet({ published: !selectedLeadMagnet.published })}
                    className={`h-11 w-full rounded-xl border-2 px-4 text-left text-sm font-bold transition ${
                      selectedLeadMagnet.published
                        ? 'border-brand-lime-300 bg-brand-lime-50 text-brand-lime-700'
                        : 'border-slate-200 bg-slate-50 text-gray-500'
                    }`}
                  >
                    {selectedLeadMagnet.published ? 'Published' : 'Draft'}
                  </button>
                </Field>
                <Field label="title">
                  <Input value={selectedLeadMagnet.title} onChange={(event) => patchSelectedLeadMagnet({ title: event.target.value })} className={inputClass} />
                </Field>
                <Field label="subtitle">
                  <Input value={selectedLeadMagnet.subtitle} onChange={(event) => patchSelectedLeadMagnet({ subtitle: event.target.value })} className={inputClass} />
                </Field>
                <Field label="description">
                  <textarea value={selectedLeadMagnet.description} onChange={(event) => patchSelectedLeadMagnet({ description: event.target.value })} className={textareaClass} />
                </Field>
                <Field label="bullets">
                  <textarea value={selectedLeadMagnet.bullets.join('\n')} onChange={(event) => patchSelectedLeadMagnet({ bullets: event.target.value.split('\n').filter(Boolean) })} className={textareaClass} />
                </Field>
                <Field label="bullets_heading">
                  <Input value={selectedLeadMagnet.bulletsHeading} onChange={(event) => patchSelectedLeadMagnet({ bulletsHeading: event.target.value })} className={inputClass} />
                </Field>
                <Field label="cta_text">
                  <Input value={selectedLeadMagnet.ctaText} onChange={(event) => patchSelectedLeadMagnet({ ctaText: event.target.value })} className={inputClass} />
                </Field>
                <Field label="form_heading">
                  <Input value={selectedLeadMagnet.formHeading} onChange={(event) => patchSelectedLeadMagnet({ formHeading: event.target.value })} className={inputClass} />
                </Field>
                <Field label="form_subtext">
                  <Input value={selectedLeadMagnet.formSubtext} onChange={(event) => patchSelectedLeadMagnet({ formSubtext: event.target.value })} className={inputClass} />
                </Field>
                <Field label="image_url">
                  <Input type="file" accept="image/*" onChange={handleLeadMagnetImageUpload} className="h-11 rounded-xl border-2 border-brand-teal-200 bg-white text-sm" />
                </Field>
                <Field label="download_link">
                  <Input value={selectedLeadMagnet.downloadLink} onChange={(event) => patchSelectedLeadMagnet({ downloadLink: event.target.value })} className={inputClass} />
                </Field>
                <Field label="email_subject">
                  <Input value={selectedLeadMagnet.emailSubject} onChange={(event) => patchSelectedLeadMagnet({ emailSubject: event.target.value })} className={inputClass} />
                </Field>
                <Field label="email_preview">
                  <Input value={selectedLeadMagnet.emailPreview} onChange={(event) => patchSelectedLeadMagnet({ emailPreview: event.target.value })} className={inputClass} />
                </Field>
                <div className="md:col-span-2">
                  <Field label="email_body">
                    <textarea value={selectedLeadMagnet.emailBody} onChange={(event) => patchSelectedLeadMagnet({ emailBody: event.target.value })} className={textareaClass} />
                  </Field>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
