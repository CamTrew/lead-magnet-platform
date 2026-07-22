'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToolbarDropdownOption<T extends string> = {
  label: string;
  previewClassName?: string;
  value: T;
};

export function ToolbarDropdown<T extends string>({
  ariaLabel,
  compact = false,
  label,
  menuAlign = 'left',
  onDismiss,
  onOpen,
  onSelect,
  options,
}: {
  ariaLabel: string;
  compact?: boolean;
  label: string;
  menuAlign?: 'left' | 'right';
  onDismiss?: () => void;
  onOpen?: () => void;
  onSelect: (value: T) => void;
  options: Array<ToolbarDropdownOption<T>>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        onDismiss?.();
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      onDismiss?.();
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onDismiss, open]);

  function showMenu(focusIndex?: number) {
    onOpen?.();
    setOpen(true);
    if (focusIndex === undefined) return;
    requestAnimationFrame(() => itemRefs.current[focusIndex]?.focus());
  }

  function moveFocus(index: number, direction: -1 | 1) {
    const nextIndex = (index + direction + options.length) % options.length;
    itemRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        className={cn(
          'inline-flex items-center rounded-md text-xs font-medium text-ink-700 outline-none transition',
          compact
            ? 'h-8 w-7 justify-center sm:w-8'
            : 'h-8 min-w-[8.5rem] justify-between gap-3 px-2.5',
          open ? 'bg-ink-100 text-ink-950' : 'hover:bg-ink-100 hover:text-ink-950',
          'focus-visible:ring-2 focus-visible:ring-ink-400 focus-visible:ring-offset-1'
        )}
        onClick={() => {
          if (open) {
            setOpen(false);
            onDismiss?.();
          }
          else showMenu();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            showMenu(0);
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            showMenu(options.length - 1);
          }
        }}
        onMouseDown={(event) => {
          onOpen?.();
          event.preventDefault();
        }}
        ref={triggerRef}
        type="button"
      >
        <span>{compact ? 'Aa' : label}</span>
        {!compact && <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />}
      </button>

      {open && (
        <div
          aria-label={ariaLabel}
          className={cn(
            'absolute top-full z-40 mt-1 w-48 overflow-hidden rounded-lg border border-ink-200 bg-white p-1.5 shadow-xl shadow-black/10',
            menuAlign === 'right' ? 'right-0' : 'left-0'
          )}
          id={menuId}
          role="menu"
        >
          {options.map((option, index) => (
            <button
              className="flex min-h-10 w-full items-center rounded-md px-3 text-left text-ink-700 outline-none transition hover:bg-ink-100 hover:text-ink-950 focus-visible:bg-ink-100 focus-visible:text-ink-950"
              key={option.value}
              onClick={() => {
                setOpen(false);
                onSelect(option.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  moveFocus(index, 1);
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  moveFocus(index, -1);
                }
                if (event.key === 'Home') {
                  event.preventDefault();
                  itemRefs.current[0]?.focus();
                }
                if (event.key === 'End') {
                  event.preventDefault();
                  itemRefs.current[options.length - 1]?.focus();
                }
              }}
              onMouseDown={(event) => event.preventDefault()}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              role="menuitem"
              type="button"
            >
              <span className={option.previewClassName}>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
