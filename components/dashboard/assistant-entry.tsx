'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, FileText, Mail, MessageSquare, Pencil, Play, Sparkles, Users, X } from 'lucide-react';
import styles from './assistant-entry.module.css';
import { DashboardConnection } from './dashboard-connection';
import { chatgptCreateUrl, claudeCreateUrl, SAVED_LEAD_MAGNET_PROMPT } from '@/lib/assistant-provider';

const steps = [
  { label: 'Your idea', title: 'Start with what you know.', text: 'Describe who your lead magnet is for and what it will help them do. A rough idea is enough. We save it in Magnets so your assistant can pick it up.', detail: 'Before you open your assistant, add your website and review the name, logo and colours we find. Or skip and use your current brand. Your assistant picks up the saved details.' },
  { label: 'Your assistant', title: 'Create it in a conversation.', text: 'Connect ChatGPT or Claude to Magnets once. We’ll walk you through the connection, screen by screen. Then ask your assistant to create your saved idea.', detail: 'It saves your resource, landing page, delivery email in Magnets. Follow-up emails are optional. Connection availability depends on your assistant’s plan.' },
  { label: 'Back to Magnets', title: 'This is where it comes together.', text: 'Your completed page publishes automatically and appears in Lead magnets. Use “Edit” to change the page and emails. Find your download in Hosted resources.', detail: 'Copy your live page link and share it with your post. You can keep editing here or ask your connected assistant to update your page, emails or resource.' },
  { label: 'Your audience', title: 'See who signs up.', text: 'When someone requests your resource, Magnets sends the delivery email and saves their details in Signups. That’s your audience, all in one place.', detail: 'Open a magnet’s Analytics button to see visits and conversions. You can also ask your connected assistant to show signups, explain the results or update your pages. Older connections need the new workspace connection first.' },
];

function WorkflowVisual({ step = 1, compact = false }: { step?: number; compact?: boolean }) {
  return <div className={`${styles.scene} ${compact ? styles.compact : ''}`} aria-hidden="true">
    <div className={styles.orbit} /><div className={styles.halo} />
    {step === 0 ? <div className={styles.ideaCard}><MessageSquare size={25} /><span>YOUR NEXT IDEA</span><strong>A checklist for<br />my next client.</strong><i className={styles.cursor} /></div> : step === 1 ? <>
      <div className={styles.chatCard}><Sparkles size={22} /><span>Your assistant</span><div>Create my lead magnet<span className={styles.cursor} /></div><small>Creating your lead magnet<span className={styles.dots}>…</span></small></div>
      <div className={styles.connector}><i /><i /><i /></div>
      <div className={styles.savedCard}><FileText size={28} /><strong>magnets</strong><span><Check size={12} /> Page published</span></div>
    </> : step === 2 ? <div className={styles.libraryCard}><span>YOUR MAGNET</span><strong>Your page is live</strong><div><FileText /><Mail /><Pencil /></div><b>View → Edit → Share</b></div> : <div className={styles.audienceCard}><Users size={25} /><strong>Your audience</strong><div><i /> New signup <Check size={14} /></div><div><i /> Resource delivered <Check size={14} /></div><small>Ready for your next idea.</small></div>}
  </div>;
}

export function AssistantEntry({ connectionOrigin, provider, resumeSavedIdea = false }: { connectionOrigin: string; provider?: 'ChatGPT' | 'Claude'; resumeSavedIdea?: boolean }) {
  const [connectedProvider, setConnectedProvider] = useState<'ChatGPT' | 'Claude' | null>(null);
  const activeProvider = connectedProvider || provider;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!open) { dialog.current?.close(); return; }
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  useEffect(() => { if (open) heading.current?.focus(); }, [step, open]);
  const current = steps[step];
  return <>
    <section className={styles.banner} aria-label="Create with your assistant">
      <div className={styles.bannerCopy}>
        <span className={styles.eyebrow}><Sparkles size={14} /> CREATE WITH {activeProvider || 'CHATGPT OR CLAUDE'}</span>
        {activeProvider ? <p>{activeProvider === 'ChatGPT' ? <>Open ChatGPT with your starter message, then select <strong>Magnets</strong> from the <strong>+</strong> menu.</> : 'Open Claude with your starter message filled in, then enable Magnets.'} {resumeSavedIdea ? <>{activeProvider === 'Claude' ? 'Review' : 'Send'} <strong>“{SAVED_LEAD_MAGNET_PROMPT}”</strong> and <strong>press Enter</strong>.</> : activeProvider === 'Claude' ? <>Add your idea and <strong>press Enter</strong>.</> : 'Tell your assistant what you want to create.'} Your completed page goes live automatically and appears in Lead magnets.</p> : <p>Describe your idea in ChatGPT or Claude. It creates your resource, page and email, then publishes your page. Review and edit everything here.</p>}

        <div className={styles.actions}>
          {activeProvider ? <a data-dashboard-tour="assistant" className={styles.primary} href={activeProvider === 'Claude' ? claudeCreateUrl(resumeSavedIdea) : chatgptCreateUrl(resumeSavedIdea)} target="_blank" rel="noopener noreferrer">Open {activeProvider} to create <ArrowRight size={17} /></a> : <Link data-dashboard-tour="assistant" className={styles.primary} href="/create?new=1">Create with ChatGPT or Claude <ArrowRight size={17} /></Link>}
          <button className={styles.secondary} onClick={() => { setStep(0); setOpen(true); }}><Play size={15} /> Show me how</button>
        </div>
        <div className={styles.workflow}><span><MessageSquare size={14} /> Create in chat</span><ArrowRight size={14} /><span><Pencil size={14} /> Edit in Magnets</span><ArrowRight size={14} /><span><Users size={14} /> Share & see signups</span></div>
      </div>
      <WorkflowVisual compact />
    </section>
    <div className={styles.guideBar}>
      <span>Want a quick look around? Choose “Explain this page” at the top.</span>
      <DashboardConnection origin={connectionOrigin} onConnected={setConnectedProvider} />
      <Link href="/dashboard/signups"><Users size={16} /> See my signups</Link>
    </div>
    {connectedProvider && <p className={styles.connectionNotice} role="status">Your assistant is connected. Use “Open {connectedProvider} to create” above, then come back here to view your lead magnet.</p>}
    {open && createPortal(<dialog ref={dialog} className={styles.dialog} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} aria-labelledby="assistant-walkthrough-title">
      <button className={styles.close} onClick={() => setOpen(false)} aria-label="Close walkthrough"><X size={21} /></button>
      <span className={styles.eyebrow}>FROM AN IDEA TO YOUR AUDIENCE</span>
      <nav className={styles.steps} aria-label="How Magnets works">
        {steps.map((item, index) => <button key={item.label} aria-current={index === step ? 'step' : undefined} onClick={() => setStep(index)}><span>{index + 1}</span>{item.label}</button>)}
      </nav>
      <div className={styles.stepContent} key={step}>
        <WorkflowVisual step={step} />
        <section className={styles.explanation}>
          <h2 id="assistant-walkthrough-title" tabIndex={-1} ref={heading}>{current.title}</h2>
          <p>{current.text}</p><p className={styles.detail}>{current.detail}</p>
          {step === 2 && <Link className={styles.textLink} href="/dashboard/pages" onClick={() => setOpen(false)}>See my lead magnets <ArrowRight size={15} /></Link>}
          {step === 3 && <Link className={styles.textLink} href="/dashboard/signups">Open Signups <ArrowRight size={15} /></Link>}
        </section>
      </div>
      <footer className={styles.navigation}>
        <button className={styles.back} onClick={() => setStep(s => s - 1)} disabled={step === 0}><ArrowLeft size={16} /> Back</button>
        <span>{step + 1} of {steps.length}</span>
        {step < steps.length - 1 ? <button className={styles.primary} onClick={() => setStep(s => s + 1)}>Next <ArrowRight size={16} /></button> : <button type="button" className={styles.primary} onClick={() => setOpen(false)}>Close</button>}
      </footer>
    </dialog>, document.body)}
  </>;
}
