"use client";

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, Link2, Loader2, RefreshCw } from 'lucide-react';
import styles from './assistant-setup.module.css';
import { AssistantSetupDemo } from './assistant-setup-demo';
import { assistantSetupUrl } from '@/lib/assistant-provider';

type Provider = 'ChatGPT' | 'Claude';
const labels = ['Open', 'Add Magnets', 'Approve', 'Ready'];

export function AssistantSetup({ provider, origin, connected, onCheckConnection, onReady }: {
  provider: Provider;
  origin: string;
  connected: boolean;
  onCheckConnection: () => Promise<boolean>;
  onReady: () => void;
}) {
  const [step, setStep] = useState(connected ? 3 : 0);
  const [copied, setCopied] = useState<'name' | 'link' | null>(null);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState('');
  const progressKey = `magnets:assistant-setup:v2:${origin}:${provider}`;
  const connectionLink = `${new URL(origin).origin}/mcp/workspace`;
  function goToStep(next: number) {
    setStep(next);
    setNotice('');
    try { sessionStorage.setItem(progressKey, JSON.stringify({ step: next, savedAt: Date.now() })); } catch { /* Setup still works when storage is unavailable. */ }
  }
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(progressKey) || 'null');
      if (!connected && saved && [1, 2].includes(saved.step) && Number.isFinite(saved.savedAt) && Date.now() - saved.savedAt >= 0 && Date.now() - saved.savedAt < 24 * 60 * 60 * 1000) setStep(saved.step);
    } catch { /* Ignore malformed or unavailable local progress. */ }
    // Saved progress only selects an instruction screen. Server checks alone confirm access.
  }, [progressKey, connected]);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const checkConnectionRef = useRef(onCheckConnection);
  checkConnectionRef.current = onCheckConnection;
  useEffect(() => {
    if (connected) return;
    let active = true;
    let inFlight = false;
    async function refreshConnection() {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const found = await checkConnectionRef.current();
        if (active && found) { setStep(3); setNotice(''); }
      } catch {
        // A background check must not interrupt setup. The manual check shows errors.
      } finally { inFlight = false; }
    }
    void refreshConnection();
    const timer = window.setInterval(refreshConnection, 5000);
    window.addEventListener('focus', refreshConnection);
    document.addEventListener('visibilitychange', refreshConnection);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshConnection);
      document.removeEventListener('visibilitychange', refreshConnection);
    };
  }, [provider, connected]);
  useEffect(() => {
    if (connected) {
      setStep(3);
      setNotice('');
      try { sessionStorage.removeItem(progressKey); } catch { /* Storage is optional. */ }
    }
  }, [connected, progressKey]);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    heading.current?.focus();
  }, [step]);
  const setupUrl = assistantSetupUrl(provider, origin);
  async function copyField(field: 'name' | 'link') {
    try { await navigator.clipboard.writeText(field === 'name' ? 'Magnets' : connectionLink); setCopied(field); setNotice(''); }
    catch { setCopied(null); setNotice('Your browser could not copy. Select the name or connection link shown here and copy it manually.'); }
  }
  function openSetup() {
    goToStep(1);
    if (provider === 'ChatGPT') void copyField('link');
  }
  function finishSetup() {
    try { sessionStorage.removeItem(progressKey); } catch { /* Storage is optional. */ }
    onReady();
  }
  async function checkConnection() {
    setChecking(true); setNotice('');
    try {
      if (await onCheckConnection()) setStep(3);
      else setNotice('Still waiting for account approval. Finish the steps in your assistant. We’ll check again automatically.');
    } catch { setNotice('Could not check the connection. Please try again.'); }
    finally { setChecking(false); }
  }
  const titles = [`Start in ${provider}.`, provider === 'Claude' ? 'Your details are filled in.' : 'Add Magnets.', 'Approve your connection.', 'Your account is connected.'];
  return <div className={styles.guide}>
    <div className={styles.eyebrow}>CONNECT ONCE. CREATE WHENEVER YOU WANT.</div>
    <nav className={styles.progress} aria-label="Connection setup steps">
      {labels.map((label, index) => <button key={label} type="button" aria-current={step === index ? 'step' : undefined}
        onClick={() => goToStep(index)} disabled={index > step}>
        <span>{index < step ? <Check size={12} /> : index + 1}</span><b>{label}</b>
      </button>)}
    </nav>
    <div className={styles.columns}>
      <AssistantSetupDemo key={`${provider}-${step}`} provider={provider} step={step} connectionLink={connectionLink} />
      <section className={styles.instructions}>
        <h2 ref={heading} tabIndex={-1}>{titles[step]}</h2>
        {step === 0 && <>
          <p>{provider === 'Claude' ? 'Open Claude with the Magnets name and connection link already filled in. Review them, then approve the connection.' : 'We’ll open ChatGPT and copy the link you need. Follow the highlighted steps once, then create from your chats.'}</p>
          <a className={styles.primary} href={setupUrl} target="_blank" rel="noopener noreferrer" onClick={openSetup}>{provider === 'Claude' ? 'Open Claude setup' : 'Copy link and open ChatGPT'} <ExternalLink size={16} /></a>
          <p className={styles.path}>{provider === 'Claude' ? 'Sign in to Claude if asked, then reopen this button if the form doesn’t appear.' : 'Plugins → + → Add custom MCP server'}</p>
          <details className={styles.help}><summary>Seeing a different screen?</summary><p>{provider === 'ChatGPT' ? 'Some accounts still use Settings → Apps → Create. If the option is missing, your plan or workspace admin may need to enable custom connections.' : 'Some screens use Add → Custom → Web. On Team or Enterprise, an owner must first add Magnets in Organization settings → Connectors. Members then find Magnets in their own connectors and click Connect.'}</p></details>
        </>}
        {step === 1 && <>
          <p>{provider === 'ChatGPT' ? <>In Plugins, click <strong>+</strong>, then <strong>Add custom MCP server</strong>.</> : <>Check the name is <strong>Magnets</strong> and the URL matches below. Claude asks you to verify links opened from another website.</>}</p>
          <details className={styles.help} open={provider === 'ChatGPT'}><summary>{provider === 'Claude' ? 'Form empty or missing? Copy the details' : 'Name and connection link'}</summary>
          {provider === 'Claude' && <p>Open <strong>Customize → Connectors → Add → Add custom connector</strong>. Paste these details. After signing in, you can also reopen the setup link.</p>}
          <div className={styles.copyFields}>
            {([{ id: 'name', label: 'Name', value: 'Magnets' }, { id: 'link', label: 'Server URL', value: connectionLink }] as const).map(field => <div key={field.id}>
              <span className={styles.fieldLabel}>{field.label}</span>
              <div className={styles.endpoint}><code>{field.value}</code><button type="button" onClick={() => { void copyField(field.id); }} aria-label={field.id === 'link' ? 'Copy connection link' : 'Copy name'}>{copied === field.id ? <Check size={17} /> : <Copy size={17} />}<span>{copied === field.id ? 'Copied' : 'Copy'}</span></button></div>
            </div>)}
          </div>
          </details>
          {copied && <p className={styles.tip} role="status">{copied === 'name' ? 'Name copied. Paste it into the Name field.' : 'Connection link copied. Paste it into the Server URL field.'}</p>}
          {provider === 'ChatGPT' && <p>Choose the public URL option. You can leave the description empty.</p>}
          <p>Click <strong>{provider === 'Claude' ? 'Continue' : 'OAuth'}</strong>. We’ll walk you through approval next.</p>
          <details className={styles.help}><summary>Replacing an older connection?</summary><p>Use this new link and approve workspace access. If your assistant cannot change its server URL, add Magnets again. Remove the old connection only after the new one works.</p></details>
          <a className={styles.textLink} href={setupUrl} target="_blank" rel="noopener noreferrer">Back to {provider} setup <ExternalLink size={13} /></a>
        </>}
        {step === 2 && <>
          {provider === 'ChatGPT' ? <p>Choose <strong>OAuth</strong>. Read the warning and, if you agree, select <strong>I understand and want to continue</strong>, then <strong>Create as a plugin</strong>.</p> : <p>Continue past the detected OAuth settings. Choose <strong>Sign in now</strong>, then <strong>Register automatically</strong> for the OAuth client. Leave custom credentials and headers empty. Click <strong>Add</strong>.</p>}
          <p>On the Magnets page that opens, sign in if asked and click <strong>Connect to my Magnets account</strong>.</p>
          <div className={styles.connectionState} role="status"><Link2 size={19} /> Waiting for your approval</div>
          <p className={styles.tip}>This screen updates automatically. Your saved idea and brand stay in Magnets.</p>
          <a className={styles.textLink} href={provider === 'Claude' ? 'https://claude.ai/customize/connectors' : setupUrl} target="_blank" rel="noopener noreferrer">Return to {provider} <ExternalLink size={13} /></a>
        </>}
        {step === 3 && <>
          <div className={`${styles.connectionState} ${styles.connected}`} role="status"><Check size={19} /> Account access authorised</div>
          <p>{provider === 'ChatGPT' ? <>If ChatGPT still shows the tool review, finish by clicking <strong>Install</strong>. In a new chat, type <strong>@</strong> and choose <strong>Magnets</strong>.</> : <>In a new Claude chat, open <strong>+ → Connectors</strong> and turn on <strong>Magnets</strong>.</>}</p>
          <p>Next, we’ll give you the message to create your saved idea. Your lead magnet will appear back here.</p>
          <details className={styles.help}><summary>Magnets isn’t showing in my assistant</summary><p>Account approval is confirmed, but Magnets cannot see whether you finished installing or enabled it in your chat. Return to your assistant’s connections and finish setup.</p><button type="button" className={styles.textLink} onClick={() => goToStep(0)}>Show the setup steps again</button></details>
        </>}
        {notice && <p className={styles.notice} role="status">{notice}</p>}
      </section>
    </div>
    <div className={styles.navigation}>
      <button type="button" onClick={() => goToStep(step - 1)} disabled={step === 0}><ArrowLeft size={15} /> Back</button>
      <span>{step + 1} of {labels.length}</span>
      <button className={styles.next} type="button" disabled={checking || (step === 3 && !connected)} onClick={() => step === 3 ? finishSetup() : step === 2 ? void checkConnection() : goToStep(step + 1)}>{checking ? <Loader2 className={styles.spin} size={15} /> : step === 2 ? <RefreshCw size={15} /> : null}{step === 0 ? 'Setup is already open' : step === 1 ? 'Next: approve' : step === 2 ? 'Check connection' : 'Start creating'} {step !== 2 && <ArrowRight size={15} />}</button>
    </div>
  </div>;
}
