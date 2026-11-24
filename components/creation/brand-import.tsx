'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, Globe, Loader2, X } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import type { CreationBrand } from '@/lib/types';
import type { WebsiteBrandSuggestion } from '@/lib/website-brand';
import styles from './brand-import.module.css';

type Changes = {name?:string;logo?:string;primary?:string;accent?:string};
export function BrandImport({currentBrand,onApplied,inline=false}:{currentBrand:CreationBrand|null;onApplied:(brand:CreationBrand,changes:Changes)=>void;inline?:boolean}) {
  const [open,setOpen]=useState(false);
  const [website,setWebsite]=useState('');
  const [suggestion,setSuggestion]=useState<WebsiteBrandSuggestion|null>(null);
  const [version,setVersion]=useState('');
  const [name,setName]=useState('');
  const [primary,setPrimary]=useState('#FE6F34');
  const [accent,setAccent]=useState('#FDC957');
  const [selected,setSelected]=useState({name:false,logo:false,primary:false,accent:false});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [saved,setSaved]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const controller=useRef<AbortController|null>(null);
  const uid=useId();
  useEffect(()=>()=>controller.current?.abort(),[]);
  useEffect(()=>{
    if(!open){dialog.current?.close();return;}
    dialog.current?.showModal();
    if(inline)heading.current?.focus();else dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
    const opener=trigger.current;
    const previous=document.body.style.overflow;document.body.style.overflow='hidden';
    return()=>{document.body.style.overflow=previous;controller.current?.abort();if(opener?.isConnected)opener.focus();};
  },[open,inline]);
  useEffect(()=>{if(suggestion)heading.current?.focus();},[suggestion]);
  async function findBrand(event:React.FormEvent) {
    event.preventDefault();setBusy(true);setError('');
    controller.current?.abort();const request=new AbortController();controller.current=request;
    try{
      const response=await fetch('/api/account/brand/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({website}),signal:request.signal});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not import that website.');
      const found=data.suggestion as WebsiteBrandSuggestion;
      setSuggestion(found);setVersion(data.version);setName(found.name||currentBrand?.logoText||'');
      setPrimary(found.primary||currentBrand?.primary||'#FE6F34');setAccent(found.accent||currentBrand?.accent||'#FDC957');
      setSelected({name:Boolean(found.name),logo:Boolean(found.logo),primary:Boolean(found.primary),accent:Boolean(found.accent)});
      if(inline)setOpen(true);
    }catch(err){if(!request.signal.aborted)setError(err instanceof Error?err.message:'Could not import the website.');}
    finally{if(!request.signal.aborted)setBusy(false);}
  }
  async function apply() {
    if(!suggestion)return;setBusy(true);setError('');
    const changes:Changes={...(selected.name?{name:name.trim()}:{}),...(selected.primary?{primary}:{}),...(selected.accent?{accent}:{}),...(selected.logo&&suggestion.logo?{logo:suggestion.logo}:{})};
    try{
      const response=await fetch('/api/account/brand/import',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({version,changes})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not apply your brand.');
      onApplied(data.brand,changes);setOpen(false);setSaved(true);
    }catch(err){setError(err instanceof Error?err.message:'Could not save the selected details.');}finally{setBusy(false);}
  }
  const previewName=selected.name?name:currentBrand?.logoText||'Your brand';
  const previewLogo=selected.logo?suggestion?.logo:currentBrand?.logoUrl;
  const websiteForm=<form className={inline?styles.inlineForm:undefined} onSubmit={findBrand}>
        {!inline&&<p>We’ll look for your name, logo and colours. You review everything before it changes.</p>}
        <label htmlFor={`${uid}-website`}>Website address</label>
        <div className={styles.website}><Globe size={18}/><input id={`${uid}-website`} value={website} onChange={event=>setWebsite(event.target.value)} placeholder="yourwebsite.com" autoComplete="url" inputMode="url" required maxLength={2048} disabled={busy}/></div>
        <button className={styles.primary} disabled={busy||!website.trim()}>{busy?<><Loader2 className={styles.spin} size={17}/> Finding your brand…</>:<>Find my brand <ArrowRight size={17}/></>}</button>
        {!inline&&<small>No website? You can keep your current brand or add your details in Brand settings.</small>}
      </form>;
  return <div className={styles.entry}>
    {inline?websiteForm:<button ref={trigger} className={styles.trigger} type="button" onClick={()=>{setSuggestion(null);setError('');setBusy(false);setOpen(true);}}><Globe size={16}/> Import brand from my website <ArrowRight size={15}/></button>}
    {inline&&!open&&error&&<p className={styles.error} role="alert">{error}</p>}
    {saved&&<span className={styles.saved} role="status"><Check size={13}/> Brand updated</span>}
    {open && createPortal(<dialog ref={dialog} className={styles.dialog} aria-labelledby={`${uid}-title`} onCancel={event=>{if(busy&&suggestion){event.preventDefault();return;}setOpen(false);}} onClose={()=>setOpen(false)}>
      <button type="button" disabled={busy&&Boolean(suggestion)} onClick={()=>setOpen(false)} className={styles.close} aria-label="Close brand import"><X size={21}/></button>
      <span className={styles.kicker}>YOUR BRAND, ALREADY FAMILIAR</span>
      <h2 ref={heading} tabIndex={-1} id={`${uid}-title`}>{suggestion?'Make sure it feels like you.':'Start with your website.'}</h2>
      {!suggestion?websiteForm:<> 
        <div className={styles.reviewBody}>
        <p>Suggestions from <strong>{new URL(suggestion.website).hostname}</strong>. Select the details you want to use. Unchecked details stay as they are.</p>
        <div className={styles.review}>
          <div className={styles.fields}>
            <label className={styles.select}><input type="checkbox" disabled={busy} checked={selected.name} onChange={e=>setSelected(s=>({...s,name:e.target.checked}))}/> Use this name</label>
            <input aria-label="Suggested brand name" value={name} maxLength={80} onChange={e=>setName(e.target.value)} disabled={!selected.name||busy}/>
            <label className={styles.select}><input type="checkbox" disabled={busy} checked={selected.primary} onChange={e=>setSelected(s=>({...s,primary:e.target.checked}))}/> Use this main colour</label>
            <div className={styles.colour}><input type="color" aria-label="Main colour" value={primary} onChange={e=>setPrimary(e.target.value)} disabled={!selected.primary||busy}/><span>{primary.toUpperCase()}</span></div>
            {!suggestion.primary&&<small>No main colour detected. Choose one manually, or leave this unchecked to keep your current colour.</small>}
            <label className={styles.select}><input type="checkbox" disabled={busy} checked={selected.accent} onChange={e=>setSelected(s=>({...s,accent:e.target.checked}))}/> Use this accent colour</label>
            <div className={styles.colour}><input type="color" aria-label="Accent colour" value={accent} onChange={e=>setAccent(e.target.value)} disabled={!selected.accent||busy}/><span>{accent.toUpperCase()}</span></div>
            {!suggestion.accent&&<small>No accent colour detected. Choose one manually, or leave this unchecked to keep your current colour.</small>}
            {suggestion.logo&&<label className={styles.select}><input type="checkbox" disabled={busy} checked={selected.logo} onChange={e=>setSelected(s=>({...s,logo:e.target.checked}))}/> Use this {suggestion.logoLabel==='Website logo'?'logo':'suggested image'}</label>}
          </div>
          <div className={styles.preview}>
            <span>BRAND PREVIEW</span>
            <div className={styles.logo}>{previewLogo?<BrandLogo src={previewLogo} alt="Suggested brand logo" size="medium"/>:<strong>{previewName.slice(0,1)||'M'}</strong>}</div>
            <h3>{previewName}</h3><p>Your next lead magnet.</p>
            <div className={styles.swatches}><i style={{background:selected.primary?primary:currentBrand?.primary||'#FE6F34'}}/><i style={{background:selected.accent?accent:currentBrand?.accent||'#FDC957'}}/></div>
          </div>
        </div>
        {suggestion.notes.map(note=><p className={styles.note} key={note}>{note}</p>)}
        </div>
        <p className={styles.scope}>Applying these details updates the brand on all your Magnets pages, including live pages.</p>
        <div className={styles.actions}><button type="button" disabled={busy} onClick={()=>{setSuggestion(null);setError('');if(inline)setOpen(false);}} className={styles.back}><ArrowLeft size={15}/> Try another site</button><button type="button" className={styles.primary} disabled={busy||!Object.values(selected).some(Boolean)||(selected.name&&!name.trim())} onClick={apply}>{busy?<Loader2 size={16} className={styles.spin}/>:<Check size={16}/>} {busy?'Applying…':'Apply selected brand'}</button></div>
      </>}
      {error&&<p className={styles.error} role="alert">{error}</p>}
    </dialog>, document.body)}
  </div>;
}
