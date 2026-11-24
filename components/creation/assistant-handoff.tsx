'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { ArrowRight, Check, ExternalLink, FileText, LayoutDashboard, Mail, MessageSquare, Pencil, Users } from 'lucide-react';
import styles from './assistant-handoff.module.css';
import { CHATGPT_CREATE_URL, claudeCreateUrl, SAVED_LEAD_MAGNET_PROMPT as CREATION_MESSAGE } from '@/lib/assistant-provider';

export function AssistantHandoff({ provider }: { provider: 'ChatGPT' | 'Claude' }) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const dashboardUrl = `/dashboard/home?assistant=${provider}`;
  useEffect(() => {
    heading.current?.focus();
    router.prefetch(dashboardUrl);
  }, [router, dashboardUrl]);
  function openAssistant() {
    // Let the link open its new tab before navigating the original Magnets tab.
    window.setTimeout(() => router.replace(dashboardUrl), 0);
  }
  return <section className={styles.handoff} aria-labelledby="handoff-title">
    <span className={styles.eyebrow}><Check size={15} /> SETUP COMPLETE. TIME TO CREATE.</span>
    <h1 ref={heading} tabIndex={-1} id="handoff-title">Create in {provider}.<br /><span>Manage in Magnets.</span></h1>
    <p className={styles.intro}>Your idea and brand are saved.</p>
    <div className={styles.journey}>
      <div className={styles.chatStage}>
        <div className={styles.stageLabel}><span>01</span><MessageSquare size={18} /> IN {provider.toUpperCase()}</div>
        <h2>Create your first lead magnet.</h2>
        <p>{provider === 'ChatGPT' ? <>The button opens ChatGPT with your starter message. Open the <strong>+</strong> menu and select <strong>Magnets</strong> before sending.</> : <>The button opens a new Claude chat with this message filled in. Open <strong>+ → Connectors</strong> and turn on <strong>Magnets</strong>.</>}</p>
        <blockquote>{CREATION_MESSAGE}</blockquote>
        <p className={styles.detail}><>Review the message and <strong>press Enter</strong>.</> Approve the request to create and publish your page.</p>
        <a className={styles.primary} href={provider === 'Claude' ? claudeCreateUrl() : CHATGPT_CREATE_URL} target="_blank" rel="noopener noreferrer" onClick={openAssistant}>Open {provider} to create <ExternalLink size={17} /></a>
        <p className={styles.detail}>Opens a new tab. Your Magnets dashboard will be ready here when you return.</p>
      </div>
      <div className={styles.transfer} aria-hidden="true"><i /><i /><i /><ArrowRight size={23} /></div>
      <div className={styles.magnetsStage}>
        <div className={styles.stageLabel}><span>02</span><LayoutDashboard size={18} /> BACK IN MAGNETS</div>
        <h2>Review it in Magnets.</h2>
        <div className={styles.package} aria-hidden="true">
          <div><FileText size={22} /><span>Resource</span></div><div><LayoutDashboard size={22} /><span>Page</span></div><div><Mail size={22} /><span>Email</span></div>
        </div>
        <p>Your live page appears in <strong>Lead magnets</strong>. Come back to edit it and see signups.</p>
        <div className={styles.outcomes}><span><Pencil size={15} /> View & edit</span><span><Users size={15} /> See signups</span></div>
        <p className={styles.detail}>Need a hand? Choose <strong>Explain this page</strong> in the dashboard.</p>
      </div>
    </div>
  </section>;
}
