'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Link2 } from 'lucide-react';
import { isValidNewPlatformUsername, normalisePlatformUsername, suggestedPlatformUsername } from '@/lib/platform-username';
import styles from './creation-workspace.module.css';

export function UsernameStep({ suggestedName, onComplete }: { suggestedName: string; onComplete: (username: string) => void }) {
  const [username, setUsername] = useState(() => suggestedPlatformUsername(suggestedName));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const normalised = normalisePlatformUsername(username);

  async function save() {
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/campaigns/username', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: normalised }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not save your URL. Please try again.');
      onComplete(body.username);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your URL. Please try again.');
    } finally { setBusy(false); }
  }

  return <section className={styles.ideaStart}>
    <h1 ref={heading} tabIndex={-1}>Your name.<br/>Your link.</h1>
    <p>Choose the name people will see in every lead magnet you share.</p>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label className={styles.usernameLabel} htmlFor="creator-username">Your Magnets URL</label>
      <div className={styles.usernameInput}>
        <span>magnets.so/</span>
        <input id="creator-username" aria-describedby="username-hint" aria-invalid={!isValidNewPlatformUsername(normalised)} autoComplete="off" autoCapitalize="none" spellCheck={false}
          value={username} onChange={(event) => { setUsername(event.target.value.toLowerCase()); setError(''); }}
          minLength={3} maxLength={40} required disabled={busy} />
      </div>
      <p id="username-hint" className={styles.usernameHint}>{isValidNewPlatformUsername(normalised) ? '3–40 letters, numbers or hyphens.' : 'Choose 3–40 letters, numbers or hyphens. Some names are reserved.'}</p>
      <div className={styles.usernamePreview} aria-label="Example lead magnet URL"><Link2 size={17}/><span>magnets.so/<strong>{normalised || 'your-name'}</strong>/your-lead-magnet</span></div>
      {error && <p className={styles.usernameError} role="alert">{error}</p>}
      <button type="submit" disabled={busy || !isValidNewPlatformUsername(normalised)}>{busy ? 'Saving your URL…' : 'Save my URL and continue'} <ArrowRight size={17}/></button>
    </form>
    <small>You can choose the final part of each link in its lead magnet editor.</small>
  </section>;
}
