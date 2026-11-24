'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { MagnetsLogo } from '@/components/magnets-logo-mark';
import { CaptureCardPreview } from '@/components/dashboard/page-editor-client';
import type { LeadMagnet } from '@/lib/types';
import styles from './signup-fields.module.css';

export function SignupFieldsPreview() {
  const [visitor, setVisitor] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [card, setCard] = useState<Pick<LeadMagnet, 'formHeading' | 'formSubtext' | 'ctaText' | 'signupFields'>>({
    formHeading:'Send me the checklist', formSubtext:'Enter your email to receive the download.', ctaText:'Get the checklist', signupFields:[]
  });
  const fields = card.signupFields || [];
  return <div className={styles.shell}>
    <header className={styles.nav}><MagnetsLogo className="h-7 w-28" variant="dark" /><nav><Link href="/">Landing page</Link><a href="https://magnets.so/login">Sign in on magnets.so <ArrowRight size={14} /></a></nav></header>
    <main className={styles.main}>
      <h1>Signup form</h1>
      <div className={styles.switcher}><button type="button" aria-pressed={!visitor} onClick={() => setVisitor(false)}>Edit form</button><button type="button" aria-pressed={visitor} onClick={() => { setVisitor(true); setSubmitted(false); }}>Visitor preview</button></div>
      {!visitor ? <CaptureCardPreview {...card} brandPrimary="#161616" brandIntensity={80} onPatch={changes => setCard(previous => ({...previous,...changes}))} /> :
        <section className={styles.stage} aria-label="Visitor preview">
          <div className={styles.card}>
            {submitted ? <><Check size={26} /><h2>Test signup complete</h2><p>This preview sends no email.</p><button className={styles.add} onClick={() => setSubmitted(false)}>Try again</button></> :
            <form onSubmit={e => { e.preventDefault(); setSubmitted(true); }}>
              <h2>{card.formHeading}</h2><p>{card.formSubtext}</p>
              <label>Name<input required autoComplete="name" name="name" /></label>
              <label>Email<input type="email" required autoComplete="email" name="email" /></label>
              {fields.map(field => <label key={field.id}><span>{field.label}{!field.required && <small> (optional)</small>}</span>
                {field.format === 'choice' ? <select key={field.choices.join('\n')} required={field.required} defaultValue=""><option value="">Choose an option</option>{field.choices.map(choice => <option key={choice}>{choice}</option>)}</select>
                : <input key={field.format} type={field.format} required={field.required} placeholder={field.format === 'url' ? 'https://example.com' : undefined} />}
              </label>)}
              <button className={styles.submit}>{card.ctaText} <ArrowRight size={17} /></button>
            </form>}
          </div>
        </section>}
    </main>
  </div>;
}
