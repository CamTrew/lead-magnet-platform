'use client';

import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

type InlineTextProps = {
  ariaLabel?: string;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div';
  className?: string;
  emptyPlaceholder?: string;
  maxLength?: number;
  multiline?: boolean;
  onChange: (value: string) => void;
  onCommit?: (value: string) => void;
  style?: CSSProperties;
  value: string;
};

function focusEnd(element: HTMLElement) {
  element.focus();
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function InlineText({
  ariaLabel,
  as = 'span',
  className,
  emptyPlaceholder,
  maxLength,
  multiline,
  onChange,
  onCommit,
  style,
  value,
}: InlineTextProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const committedRef = useRef(value);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (isFocused) return;
    if (element.textContent !== value) {
      element.textContent = value;
    }
    committedRef.current = value;
  }, [value, isFocused]);

  const handleInput = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    let text = element.textContent || '';
    if (maxLength != null && text.length > maxLength) {
      text = text.slice(0, maxLength);
      element.textContent = text;
      focusEnd(element);
    }
    onChange(text);
  }, [onChange, maxLength]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    const element = ref.current;
    if (!element) return;
    const text = (element.textContent || '').replace(/ /g, ' ');
    if (text !== committedRef.current) {
      committedRef.current = text;
      onCommit?.(text);
    }
  }, [onCommit]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!multiline && event.key === 'Enter') {
        event.preventDefault();
        (ref.current as HTMLElement | null)?.blur();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        const element = ref.current;
        if (element) element.textContent = committedRef.current;
        (ref.current as HTMLElement | null)?.blur();
      }
    },
    [multiline]
  );

  const Tag = as;
  const isEmpty = !value;

  return (
    <Tag
      ref={ref as never}
      aria-label={ariaLabel}
      className={cn(
        'inline-edit relative -mx-1 -my-0.5 rounded-md px-1 py-0.5 outline-none transition',
        'hover:bg-[#f7f5f1]/70 focus:bg-white focus:ring-2 focus:ring-[#111111]/35',
        isEmpty && 'min-w-[3ch] text-[#9d9488]',
        className
      )}
      contentEditable
      data-empty={isEmpty || undefined}
      data-form-type="other"
      data-placeholder={emptyPlaceholder}
      onBlur={handleBlur}
      onFocus={() => setIsFocused(true)}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      style={style}
      suppressContentEditableWarning
    />
  );
}

type InlineParagraphsProps = {
  ariaLabel?: string;
  className?: string;
  emptyPlaceholder?: string;
  onChange: (value: string) => void;
  paragraphClassName?: string;
  value: string;
};

export function InlineParagraphs({
  ariaLabel,
  className,
  emptyPlaceholder,
  onChange,
  paragraphClassName,
  value,
}: InlineParagraphsProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  // Track the last text we sent up so the post-blur resync doesn't overwrite
  // the user's edit with a stale `value` prop coming from React before the
  // parent has had a chance to commit our onChange.
  const lastEmittedRef = useRef<string>('');

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (isFocused) return;
    // If the prop matches what we just sent up, do nothing. This is the
    // common case after blur: parent's onChange has already been called, the
    // DOM is correct, and forcing innerHTML again would just reset the
    // cursor and possibly clobber an in-flight value.
    if (value === lastEmittedRef.current) return;
    const rendered = renderParagraphsHtml(value);
    if (element.innerHTML !== rendered) {
      element.innerHTML = rendered;
    }
  }, [value, isFocused]);

  const handleInput = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const text = extractParagraphsText(element);
    lastEmittedRef.current = text;
    onChange(text);
  }, [onChange]);

  const handleBlur = useCallback(() => {
    // Force one final emit on blur so the parent definitely has the latest
    // text before any auto-save runs. Without this, a fast user can type
    // then immediately click Save and lose the last typed paragraph if the
    // input event hasn't fired yet.
    const element = ref.current;
    if (element) {
      const text = extractParagraphsText(element);
      if (text !== lastEmittedRef.current) {
        lastEmittedRef.current = text;
        onChange(text);
      }
    }
    setIsFocused(false);
  }, [onChange]);

  return (
    <div
      ref={ref}
      aria-label={ariaLabel}
      className={cn(
        'inline-edit relative -mx-1 -my-0.5 space-y-3 rounded-md px-2 py-1 outline-none transition',
        'hover:bg-[#f7f5f1]/70 focus:bg-white focus:ring-2 focus:ring-[#111111]/35',
        paragraphClassName,
        className
      )}
      contentEditable
      data-empty={!value || undefined}
      data-form-type="other"
      data-placeholder={emptyPlaceholder}
      onBlur={handleBlur}
      onFocus={() => setIsFocused(true)}
      onInput={handleInput}
      suppressContentEditableWarning
    />
  );
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderParagraphsHtml(value: string) {
  if (!value) return '<p></p>';
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />') || '<br />'}</p>`)
    .join('');
}

function extractParagraphsText(element: HTMLElement) {
  const paragraphs: string[] = [];
  element.querySelectorAll('p, div').forEach((node) => {
    const text = (node as HTMLElement).innerText.replace(/ /g, ' ');
    paragraphs.push(text);
  });
  if (paragraphs.length === 0) {
    paragraphs.push(element.innerText.replace(/ /g, ' '));
  }
  return paragraphs
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

type EditableHotspotProps = {
  children: ReactNode;
  className?: string;
  label: string;
  onActivate?: () => void;
};

export function EditableHotspot({ children, className, label, onActivate }: EditableHotspotProps) {
  return (
    <div
      aria-label={label}
      className={cn(
        'group/edit relative cursor-text rounded-lg transition hover:ring-2 hover:ring-[#111111]/30 focus-within:ring-2 focus-within:ring-[#111111]/50',
        className
      )}
      onClick={onActivate}
      role={onActivate ? 'button' : undefined}
      tabIndex={onActivate ? 0 : undefined}
    >
      <span className="pointer-events-none absolute -right-2 -top-2 z-10 hidden h-7 w-7 items-center justify-center rounded-full bg-[#111111] text-white shadow-sm group-hover/edit:flex group-focus-within/edit:flex">
        <Pencil className="h-3.5 w-3.5" />
      </span>
      {children}
    </div>
  );
}
