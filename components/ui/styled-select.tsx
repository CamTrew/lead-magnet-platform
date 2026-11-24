'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StyledSelect({ ariaLabel, value, onChange, options, className }: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.findIndex(option => option.value === value);

  useLayoutEffect(() => {
    const panel = menu.current;
    if (!open || !panel) return;
    // The top layer escapes cards and modal scroll containers without losing theme inheritance.
    panel.showPopover();
    function position() {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect || !panel) return;
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const width = viewport?.width ?? window.innerWidth;
      const offsetTop = viewport?.offsetTop ?? 0;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const below = height + offsetTop - rect.bottom - 12;
      const above = rect.top - offsetTop - 12;
      const up = below < 180 && above > below;
      const maxHeight = Math.max(44, Math.min(288, up ? above : below));
      panel.style.width = `${Math.min(rect.width, width - 24)}px`;
      panel.style.maxHeight = `${maxHeight}px`;
      panel.style.left = `${Math.max(offsetLeft + 12, Math.min(rect.left, width + offsetLeft - panel.offsetWidth - 12))}px`;
      panel.style.top = `${up ? rect.top - panel.offsetHeight - 6 : rect.bottom + 6}px`;
    }
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    return () => {
      panel.hidePopover();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, id, open]);

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    trigger.current?.focus();
  }

  return <>
    <button
      ref={trigger}
      type="button"
      role="combobox"
      aria-label={ariaLabel}
      aria-expanded={open}
      aria-controls={`${id}-options`}
      aria-haspopup="listbox"
      aria-activedescendant={open ? `${id}-${active}` : undefined}
      className={cn('flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-ink-200 bg-white px-3 text-left text-base text-ink-900 outline-none transition hover:border-ink-400 focus-visible:border-brand-orange focus-visible:ring-1 focus-visible:ring-brand-orange sm:min-h-9 sm:h-9 sm:text-sm', className)}
      onClick={() => { setActive(Math.max(0, selected)); setOpen(!open); }}
      onBlur={event => { if (!menu.current?.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={event => {
        if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
        if (event.key === 'Tab') { setOpen(false); return; }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          if (!open) { setActive(event.key === 'End' ? options.length - 1 : Math.max(0, selected)); setOpen(true); }
          else setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (open) choose(active);
          else { setActive(Math.max(0, selected)); setOpen(true); }
          return;
        }
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const now = Date.now();
          const text = (now - search.current.at < 700 ? search.current.text : '') + event.key.toLowerCase();
          search.current = { text, at: now };
          const index = options.findIndex(option => option.label.toLowerCase().startsWith(text));
          if (index >= 0) { event.preventDefault(); setActive(index); setOpen(true); }
        }
      }}
    >
      <span className="min-w-0 truncate">{options[selected]?.label || 'Choose an option'}</span>
      <ChevronDown aria-hidden className={cn('h-4 w-4 shrink-0 text-ink-500 transition-transform', open && 'rotate-180')} />
    </button>
    <div ref={menu} id={`${id}-options`} role="listbox" aria-label={ariaLabel} popover="manual"
      className="fixed inset-auto m-0 overflow-y-auto overscroll-contain rounded-lg border border-ink-200 bg-white p-1.5 text-sm text-ink-900 shadow-xl shadow-black/10 outline-none">
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option" aria-selected={option.value === value}
        className={cn('flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left leading-5 transition', index === active ? 'bg-ink-100 text-ink-950' : 'hover:bg-ink-50')}
        onMouseDown={event => event.preventDefault()}
        onPointerMove={() => setActive(index)}
        onClick={event => { event.preventDefault(); choose(index); }}>
        <span className="min-w-0 flex-1 break-words">{option.label}</span>
        {option.value === value && <Check aria-hidden className="h-4 w-4 shrink-0 text-brand-orange" />}
      </div>)}
    </div>
  </>;
}
