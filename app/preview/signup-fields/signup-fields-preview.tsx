'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { MagnetsLogo } from '@/components/magnets-logo-mark';
import { PageCanvas, type CanvasMagnet } from '@/components/dashboard/page-editor-client';
import { exampleCampaign } from '@/lib/campaign-example';
import type { BrandSettings } from '@/lib/types';
import styles from './signup-fields.module.css';

const brand: BrandSettings = {
  primary: '#161616', accent: '#FE6F34', success: '#168057', highlightIntensity: 80,
  pageTheme: 'light', logoSize: 'small', privacyPolicyUrl: '', termsUrl: '',
};

export function SignupFieldsPreview() {
  const [visitor, setVisitor] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState('');
  const [card, setCard] = useState<CanvasMagnet>({
    ...exampleCampaign.page, title: exampleCampaign.title, imageUrl: '', signupFields: [],
  });
  useEffect(() => () => {
    if (card.imageUrl) URL.revokeObjectURL(card.imageUrl);
  }, [card.imageUrl]);
  const fields = card.signupFields || [];
  return <div className={styles.shell}>
    <header className={styles.nav}><MagnetsLogo className="h-7 w-28" variant="dark" /><nav><Link href="/">Landing page</Link><a href="https://magnets.so/login">Sign in on magnets.so <ArrowRight size={14} /></a></nav></header>
    <div className={styles.main}>
      <h1>Landing page builder</h1>
      <div className={styles.switcher}><button type="button" aria-pressed={!visitor} onClick={() => setVisitor(false)}>Edit landing page</button><button type="button" aria-pressed={visitor} onClick={() => { setVisitor(true); setSubmitted(false); }}>Try signup form</button></div>
      <input hidden type="file" ref={input} accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type) || file.size > 10 * 1024 * 1024) {
          setImageError('Choose a PNG, JPG, WebP or GIF up to 10 MB.');
          return;
        }
        setImageError('');
        const imageUrl = URL.createObjectURL(file);
        setCard(previous => ({ ...previous, imageUrl }));
      }} />
      {imageError && <p role="alert">{imageError}</p>}
      {!visitor ? <PageCanvas
        account={{ brand, logoText: 'Studio North', logoUrl: '' }} accountLogoFallback="Studio North" accountHasLogo={false}
        brandPrimary={brand.primary} brandIntensity={brand.highlightIntensity} leadMagnet={card}
        onPatch={changes => setCard(previous => ({ ...previous, ...changes }))}
        onPickImage={() => input.current?.click()}
      /> :
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
    </div>
  </div>;
}
