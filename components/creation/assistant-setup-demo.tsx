'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Check, Copy, Link2, MousePointer2, Pause, Play, Plus, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';
import styles from './assistant-setup.module.css';
import { SAVED_LEAD_MAGNET_PROMPT } from '@/lib/assistant-provider';

type Provider = 'ChatGPT' | 'Claude';

export function AssistantSetupDemo({ provider, step, connectionLink }: { provider: Provider; step: number; connectionLink: string }) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPlaying(!preference.matches);
    const update = () => setPlaying(!preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setFrame(value => (value + 1) % 3), 3800);
    return () => window.clearInterval(timer);
  }, [playing]);
  const prefilled = provider === 'Claude' && step === 0;
  const captions = step === 3
    ? [provider === 'Claude' ? 'Open a new chat in Claude.' : 'Finish installing Magnets if ChatGPT asks.', provider === 'Claude' ? 'Open + → Connectors and turn on Magnets.' : 'In a new chat, type @ and select Magnets.', 'Paste your message, then press Enter.']
    : prefilled
      ? ['The shortcut opens the connection form.', 'Magnets and its server URL are already filled in.', 'Check the URL notice, then click Continue.']
      : step === 0
    ? provider === 'ChatGPT'
      ? ['Open Plugins in ChatGPT.', 'Click the + button.', 'Choose Add custom MCP server.']
      : ['Open Customize, then Connectors.', 'Click Add.', 'Choose Add custom connector. Some screens use Custom → Web.']
    : step === 1
      ? provider === 'Claude' ? ['Check the prefilled name: Magnets.', 'Verify the server URL matches Magnets.', 'Click Continue to review authentication.'] : ['Give the connection a name: Magnets.', 'Paste the copied link into Server URL.', 'Choose OAuth. Continue to the approval steps.']
      : [provider === 'Claude' ? 'Choose Sign in now and Register automatically, then Add.' : 'Review the warning, then Create as a plugin.', 'On Magnets, sign in if asked and approve the connection.', 'Magnets detects account approval automatically.'];
  return <div className={styles.demo}>
    <div className={styles.demoTop}><span><span className={styles.demoDot} /> WATCH THE STEPS</span><span>{provider}</span></div>
    <div className={styles.demoStage} aria-hidden="true">
      <div className={styles.demoWindow}>
        <div className={styles.demoWindowBar}><i /><i /><i /><span>{step === 2 && frame > 0 ? 'Magnets' : provider}</span></div>
        {step === 3 ? <div className={styles.demoConsent}><div className={styles.demoConnection}><span><Check size={24} /></span></div><strong>Create in {provider}</strong><p>{provider === 'Claude' ? '+ → Connectors → Magnets' : '@ → Magnets'}</p><div className={styles.demoAction}>{SAVED_LEAD_MAGNET_PROMPT}</div><p>Press Enter ↵</p></div> : step === 0 && !prefilled ? <div className={`${styles.demoMenu} ${provider === 'Claude' ? styles.demoClaude : ''}`}>
          <div className={styles.demoMuted}><Sparkles size={17} /> New chat</div>
          {provider === 'Claude' && <div className={styles.demoMuted}>Customize</div>}
          <div className={frame === 0 ? styles.demoSelected : ''}><Link2 size={18} /> {provider === 'Claude' ? 'Connectors' : 'Plugins'}<span className={frame === 1 ? styles.demoAddActive : styles.demoAdd}><Plus size={19} />{provider === 'Claude' ? 'Add' : ''}</span></div>
          <div className={`${styles.demoDropdown} ${frame === 2 ? styles.demoSelected : ''}`}><Plus size={16} />{provider === 'Claude' ? 'Add custom connector' : 'Add custom MCP server'}</div>
          <MousePointer2 key={frame} className={`${styles.demoCursor} ${styles[`cursorMenu${frame}`]}`} size={28} />
        </div> : step === 1 || prefilled ? <div className={styles.demoForm}>
          <span>Name</span><div className={frame === 0 ? styles.demoSelected : ''}><span key={frame === 0 ? 'name' : 'done'} className={frame === 0 && playing ? styles.demoTyping : ''}>Magnets</span></div>
          <span>Server URL</span><div className={frame === 1 ? styles.demoSelected : ''}><span key={frame === 1 ? 'url' : 'done'} className={frame === 1 && playing ? styles.demoTyping : ''}>{connectionLink}</span>{frame === 1 && <Copy size={14} />}</div>
          {provider === 'ChatGPT' && <><span>Authentication</span><div className={frame === 2 ? styles.demoSelected : ''}><ShieldCheck size={16} /> OAuth <Check size={15} /></div></>}
          {provider === 'Claude' && <small>Verify the prefilled URL before continuing.</small>}
          {provider === 'ChatGPT' && <small>Read the warning before choosing to continue.</small>}
          {provider === 'Claude' && <div className={styles.demoAction}>Continue <ArrowRight size={15} /></div>}
        </div> : frame === 0 ? <div className={styles.demoForm}>
          <span>Authentication</span><div className={styles.demoSelected}><ShieldCheck size={16} /> {provider === 'Claude' ? 'Sign in now' : 'OAuth'}</div>
          {provider === 'Claude' ? <><span>OAuth client</span><div className={styles.demoSelected}>Register automatically</div><small>Leave custom credentials and headers empty.</small></> : <><small>Review the connection warning.</small><div><Check size={15} /> I understand and want to continue</div></>}
          <div className={styles.demoAction}>{provider === 'Claude' ? 'Add' : 'Create as a plugin'} <ArrowRight size={15} /></div>
        </div> : <div className={styles.demoConsent}>
          <div className={styles.demoConnection}><span><Sparkles size={23} /></span><i /><Link2 size={19} /><i /><span><ShieldCheck size={24} /></span></div>
          <strong>{frame === 2 ? 'Back to Magnets' : `Connect ${provider}`}</strong>
          <p>{frame === 2 ? 'Your account approval is detected automatically.' : 'Let your assistant create and edit your Magnets campaigns.'}</p>
          <div className={styles.demoAction}>{frame === 2 ? 'Account access authorised' : 'Connect to my Magnets account'}<ArrowRight size={15} /></div>
          {frame === 1 && <MousePointer2 className={styles.consentCursor} size={28} />}
        </div>}
      </div>
    </div>
    <div className={styles.demoCaption}><span>{frame + 1}</span><p>{captions[frame]}</p></div>
    <div className={styles.demoControls}>
      <div className={styles.demoFrames}>{captions.map((caption, index) => <button key={caption} type="button" aria-label={`Show demonstration step ${index + 1}: ${caption}`} aria-pressed={frame === index} onClick={() => { setFrame(index); setPlaying(false); }}><i /></button>)}</div>
      <button type="button" aria-label={playing ? 'Pause demonstration' : 'Play demonstration'} onClick={() => setPlaying(value => !value)}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
      <button type="button" aria-label="Replay demonstration" onClick={() => { setFrame(0); setPlaying(true); }}><RotateCcw size={15} /></button>
    </div>
    <p className={styles.demoDisclaimer}>Simplified demonstration. Screens may vary by account. Follow these steps in your own {provider} tab.</p>
  </div>;
}
