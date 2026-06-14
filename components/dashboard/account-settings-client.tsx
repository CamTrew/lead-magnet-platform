'use client';

import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, KeyRound, Loader2, Trash2, UserRound } from 'lucide-react';
import {
  AceternityButton,
  AceternityCard,
  AceternityInput,
  Field,
} from '@/components/ui/aceternity';
import { PageHeader } from '@/components/dashboard/app-shell';

export function AccountSettingsClient({
  userEmail,
  userName,
}: {
  userEmail: string;
  userName: string;
}) {
  return (
    <>
      <PageHeader title="Account" subtitle="Password, identity, and danger zone." />
      <div className="mx-auto max-w-6xl space-y-4">
        <ProfileCard userEmail={userEmail} userName={userName} />

        <PasswordCard />

        <DangerZoneCard />
      </div>
    </>
  );
}

function ProfileCard({
  userEmail,
  userName,
}: {
  userEmail: string;
  userName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(userName);
  const [savedName, setSavedName] = useState(userName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const cleanName = name.trim();
  const unchanged = cleanName === savedName.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!cleanName) {
      setError('Enter your name.');
      return;
    }
    if (unchanged) return;

    setBusy(true);
    try {
      const response = await fetch('/api/account/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || 'Could not update your name.');
      }
      const data = (await response.json()) as { user: { name: string } };
      setName(data.user.name);
      setSavedName(data.user.name);
      setSuccess('Name updated.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AceternityCard className="p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-ink-50 text-ink-700">
          <UserRound className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-ink-950">Who you are</h2>
          <p className="mt-1 text-sm text-ink-600">{userEmail}</p>

          <form className="mt-5 grid gap-4 sm:max-w-md" onSubmit={submit}>
            <Field label="Name">
              <AceternityInput
                autoComplete="name"
                disabled={busy}
                maxLength={120}
                onChange={(event) => {
                  setName(event.target.value);
                  setError('');
                  setSuccess('');
                }}
                placeholder="Your name"
                required
                value={name}
              />
            </Field>
            <Field label="Email">
              <AceternityInput disabled readOnly value={userEmail} />
            </Field>
            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                {error}
              </p>
            )}
            {success && (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700">
                {success}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <AceternityButton disabled={busy || !cleanName || unchanged} type="submit">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Update name
              </AceternityButton>
            </div>
          </form>
        </div>
      </div>
    </AceternityCard>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmNewPassword) {
      setError('The new passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from the current one.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || 'Could not change password.');
      }
      setSuccess('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AceternityCard className="p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-ink-50 text-ink-700">
          <KeyRound className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-ink-950">Change password</h2>
          <p className="mt-1 text-sm text-ink-600">
            Use at least 8 characters. Pick something you don&apos;t reuse elsewhere.
          </p>
          <form className="mt-5 grid gap-4 sm:max-w-md" onSubmit={submit}>
            <Field label="Current password">
              <AceternityInput
                autoComplete="current-password"
                disabled={busy}
                onChange={(event) => setCurrentPassword(event.target.value)}
                type="password"
                value={currentPassword}
                required
              />
            </Field>
            <Field label="New password">
              <AceternityInput
                autoComplete="new-password"
                disabled={busy}
                minLength={8}
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                value={newPassword}
                required
              />
            </Field>
            <Field label="Confirm new password">
              <AceternityInput
                autoComplete="new-password"
                disabled={busy}
                minLength={8}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                type="password"
                value={confirmNewPassword}
                required
              />
            </Field>
            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                {error}
              </p>
            )}
            {success && (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700">
                {success}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <AceternityButton disabled={busy} type="submit">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Update password
              </AceternityButton>
            </div>
          </form>
        </div>
      </div>
    </AceternityCard>
  );
}

function DangerZoneCard() {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (confirmText !== 'DELETE') {
      setError('Type DELETE to confirm.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, confirm: 'DELETE' }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || 'Could not delete the account.');
      }
      window.dispatchEvent(new Event('magnets:navigation-start'));
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <AceternityCard className="border-red-200 p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-red-700">Danger zone</h2>
          <p className="mt-1 text-sm text-ink-600">
            Deleting your account removes your magnets, signups, integrations, and any custom domains attached to
            your account. This is permanent. There is no recovery.
          </p>

          {!confirmOpen ? (
            <div className="mt-5">
              <AceternityButton onClick={() => setConfirmOpen(true)} variant="danger">
                <Trash2 className="h-4 w-4" />
                Delete account
              </AceternityButton>
            </div>
          ) : (
            <form className="mt-5 grid gap-4 sm:max-w-md" onSubmit={submit}>
              <Field label="Confirm with your password">
                <AceternityInput
                  autoComplete="current-password"
                  disabled={busy}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  value={password}
                  required
                />
              </Field>
              <Field label="Type DELETE to confirm" hint="Case-sensitive.">
                <AceternityInput
                  disabled={busy}
                  onChange={(event) => setConfirmText(event.target.value)}
                  placeholder="DELETE"
                  type="text"
                  value={confirmText}
                  required
                />
              </Field>
              {error && (
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <AceternityButton
                  disabled={busy}
                  onClick={() => {
                    setConfirmOpen(false);
                    setPassword('');
                    setConfirmText('');
                    setError('');
                  }}
                  type="button"
                  variant="secondary"
                >
                  Cancel
                </AceternityButton>
                <AceternityButton disabled={busy || confirmText !== 'DELETE'} type="submit" variant="danger">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete permanently
                </AceternityButton>
              </div>
            </form>
          )}
        </div>
      </div>
    </AceternityCard>
  );
}
