'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react';
import styles from './dashboard-guide.module.css';

import { usePathname } from 'next/navigation';
import { HelpCenterModal, OPEN_HELP_TOPIC_EVENT } from './help-center';
import { explanationForPath, type PageExplanation } from './page-explanations';

export function DashboardPageExplain() {
  const pathname = usePathname();
  if (pathname !== '/dashboard/home') return null;
  return <DashboardTour key={pathname} explanation={explanationForPath(pathname)} />;
}

type Box = { top: number; left: number; width: number; height: number };
export function DashboardTour({ explanation, standalone = false }: { explanation: PageExplanation; standalone?: boolean }) {
  const [guideOpen, setGuideOpen] = useState(false);
  const { steps } = explanation;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cardPosition, setCardPosition] = useState<{ top: number; left: number }>();
  const card = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const opener = trigger.current;
    return () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const selector = steps[step].selector || (steps[step].target ? `[data-dashboard-tour="${steps[step].target}"]` : null);
    const candidate = selector ? document.querySelector<HTMLElement>(selector) : null;
    // Reveal only UI disclosures. Never click setup, verification or save controls.
    // Restore the user's disclosure state on Next, Back, close and route changes.
    const openedSections: HTMLDetailsElement[] = [];
    if (steps[step].reveal && candidate) {
      const sections: HTMLDetailsElement[] = [];
      for (let node: HTMLElement | null = candidate; node; node = node.parentElement) {
        if (node instanceof HTMLDetailsElement && !node.open) sections.unshift(node);
      }
      for (const section of sections) {
        section.open = true;
        openedSections.push(section);
      }
    }
    const collapsedSection = candidate?.closest('details:not([open])')?.querySelector<HTMLElement>(':scope > summary');
    const visibleCandidate = collapsedSection?.querySelector<HTMLElement>('p') || collapsedSection || candidate;
    const anchor = visibleCandidate?.getClientRects().length ? visibleCandidate : null;
    // Home shortcuts are whole cards. Spotlight their action so the explanation
    // and the thing to click can both fit on a small phone.
    const target = anchor?.matches('a') ? anchor.querySelector<HTMLElement>(':scope > span:last-child') || anchor : anchor;
    const update = () => {
      const panel = card.current?.getBoundingClientRect();
      if (!panel) return;
      const viewport = dialog.current?.getBoundingClientRect();
      if (!viewport) return;
      const margin = 14;
      const gap = 44;
      const clampX = (value: number) => Math.max(margin, Math.min(value, viewport.width - panel.width - margin));
      const clampY = (value: number) => Math.max(margin, Math.min(value, viewport.height - panel.height - margin));
      if (!target) {
        setBox(null);
        setCardPosition({ top: clampY((viewport.height - panel.height) / 2), left: clampX((viewport.width - panel.width) / 2) });
        return;
      }
      const rect = target.getBoundingClientRect();
      setBox({ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 });
      // Anchor the tour to its target without extending the document to make room.
      let left = clampX(rect.left + (rect.width - panel.width) / 2);
      let top = rect.bottom + gap;
      if (rect.right + gap + panel.width <= viewport.width - margin) {
        left = rect.right + gap;
        top = rect.top + (rect.height - panel.height) / 2;
      } else if (rect.left - gap - panel.width >= margin) {
        left = rect.left - gap - panel.width;
        top = rect.top + (rect.height - panel.height) / 2;
      } else if (top + panel.height > viewport.height - margin && rect.top > viewport.height - rect.bottom) {
        top = rect.top - gap - panel.height;
      }
      setCardPosition({ top: clampY(top), left: clampX(left) });
    };
    heading.current?.focus({ preventScroll: true });
    if (target) {
      const topInset = (document.querySelector('[data-explain-header]')?.getBoundingClientRect().bottom || 0) + 22;
      const rect = target.getBoundingClientRect();
      const panelHeight = card.current?.getBoundingClientRect().height || 0;
      const needsRoom = window.innerWidth < 600 && rect.bottom + panelHeight + 58 > window.innerHeight && rect.top < panelHeight + 58;
      if (rect.top < topInset || rect.bottom > window.innerHeight - 14 || needsRoom) {
        let scrollTop = window.scrollY + rect.top - topInset;
        const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        // Near the page footer there may be no space to scroll farther down.
        // Put the target below the card instead of manufacturing page padding.
        if (window.innerWidth < 600 && rect.bottom + window.scrollY - Math.min(maxScroll, Math.max(0, scrollTop)) + panelHeight + 58 > window.innerHeight) {
          scrollTop = window.scrollY + rect.bottom - window.innerHeight + 22;
        }
        window.scrollTo({ top: scrollTop, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      }
    }
    update();
    const observer = new ResizeObserver(update);
    if (target) observer.observe(target);
    if (card.current) observer.observe(card.current);
    if (dialog.current) observer.observe(dialog.current);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      for (const section of openedSections.reverse()) section.open = false;
    };
  }, [open, step, steps]);
  return <>
    <button ref={trigger} type="button" className={styles.explainButton} onClick={() => { setStep(0); setOpen(true); }}><Compass size={18}/> Explain this page</button>
    {open && createPortal(<dialog ref={dialog} className={styles.tour} data-overview={!box || undefined} aria-labelledby="dashboard-tour-title" onCancel={close} onClose={close}>
      {box && <div aria-hidden="true" className={styles.spotlight} data-pointer={cardPosition && cardPosition.top < box.top ? 'above' : 'below'} style={{ top: box.top, left: box.left, width: box.width, height: box.height }}><span className={styles.pointer}><ArrowRight size={28}/></span></div>}
      <section ref={card} className={styles.tourCard} style={cardPosition} key={step}>
        <button className={styles.close} aria-label="Close dashboard tour" onClick={close}><X size={20}/></button>
        <span className={styles.stepCount}>{explanation.name.toUpperCase()} · {step + 1} OF {steps.length}</span>
        <h2 ref={heading} tabIndex={-1} id="dashboard-tour-title">{steps[step].title}</h2>
        <p>{steps[step].text}</p>
        <button type="button" className={styles.fullGuide} onClick={() => {
          close();
          if (standalone) setGuideOpen(true);
          else window.dispatchEvent(new CustomEvent(OPEN_HELP_TOPIC_EVENT, { detail: { topic: steps[step].helpTopic || explanation.helpTopic } }));
        }}>Read the full guide <ArrowRight size={14}/></button>
        <footer><button disabled={step === 0} onClick={() => setStep(value => value - 1)}><ArrowLeft size={16}/> Back</button><button className={styles.next} onClick={() => step === steps.length - 1 ? close() : setStep(value => value + 1)}>{step === steps.length - 1 ? 'Got it' : 'Next'} <ArrowRight size={17}/></button></footer>
      </section>
    </dialog>, document.body)}
    {standalone && guideOpen && <HelpCenterModal open initialTopic={steps[step].helpTopic || explanation.helpTopic} onClose={() => setGuideOpen(false)} />}
  </>;
}
