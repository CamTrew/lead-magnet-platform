'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Link2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { hasWorkspaceAssistantConnection } from '@/lib/assistant-provider';
import { AssistantSetup } from '@/components/creation/assistant-setup';
import styles from './dashboard-guide.module.css';

type Provider = 'ChatGPT' | 'Claude';
export function DashboardConnection({ origin, onConnected }: { origin: string; onConnected: (provider: Provider) => void }) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [connected, setConnected] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const checks = useRef({ id: 0 }).current;
  async function checkConnection() {
    const id = ++checks.id;
    const response = await fetch('/api/assistant-connections', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Could not check connection');
    const data = await response.json();
    const found = hasWorkspaceAssistantConnection(data.connections, provider);
    if (id === checks.id) setConnected(found);
    return found;
  }
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const opener = trigger.current;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { checks.id++; document.body.style.overflow = previous; if (opener?.isConnected) opener.focus(); };
  }, [open, checks]);
  return <>
    <button ref={trigger} type="button" data-dashboard-tour="connection" className={styles.helpLink} onClick={() => { checks.id++; setProvider(null); setConnected(false); setOpen(true); }}><Link2 size={16} /> Connect ChatGPT or Claude</button>
    {open && createPortal(<dialog ref={dialog} className={styles.connectionDialog} aria-label="Connect your assistant" onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <button className={styles.close} aria-label="Close assistant setup" onClick={() => setOpen(false)}><X size={21}/></button>
      {provider ? <AssistantSetup key={provider} provider={provider} origin={origin} connected={connected} onCheckConnection={checkConnection} onReady={() => { onConnected(provider); setOpen(false); }} /> : <section className={styles.choose}>
        <span>ONE-TIME SETUP</span><h2>Which assistant do you use?</h2><p>We’ll show you where to click, one step at a time. You can always come back here.</p>
        <button onClick={() => setProvider('ChatGPT')}>Connect ChatGPT <ArrowRight size={18}/></button>
        <button onClick={() => setProvider('Claude')}>Connect Claude <ArrowRight size={18}/></button>
        <small>Availability depends on your assistant’s plan. You can also create manually in Magnets.</small>
      </section>}
    </dialog>, document.body)}
  </>;
}
