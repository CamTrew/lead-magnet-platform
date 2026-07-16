'use client';

import type { FormEvent, KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Bot, Check, Loader2, Send, Sparkles, X } from 'lucide-react';
import type {
  LeadMagnetCopilotDraft,
  LeadMagnetCopilotFollowUpUpdate,
  LeadMagnetCopilotMessage,
  LeadMagnetCopilotPatch,
  LeadMagnetCopilotResponse,
} from '@/lib/lead-magnet-copilot';
import type { LeadMagnet } from '@/lib/types';
import { cn } from '@/lib/utils';

type DisplayMessage = LeadMagnetCopilotMessage & {
  id: string;
  updatedFields?: string[];
};

const welcomeMessage: DisplayMessage = {
  id: 'welcome',
  role: 'assistant',
  content: 'Tell me what this magnet is, who it is for, or what feels weak. I can improve the page and emails while you watch the draft update.',
};

const quickPrompts = [
  'Sharpen the headline',
  'Improve the signup form',
  'Rewrite the delivery email',
];

const fieldLabels: Record<keyof LeadMagnetCopilotPatch, string> = {
  title: 'headline',
  subtitle: 'subheading',
  description: 'page copy',
  bullets: 'benefits',
  bulletsHeading: 'benefits heading',
  ctaText: 'button',
  formHeading: 'form heading',
  formSubtext: 'form copy',
  emailSubject: 'email subject',
  emailPreview: 'email preview',
  emailBody: 'delivery email',
  postSignupHeading: 'confirmation heading',
  postSignupBody: 'confirmation copy',
  postSignupCtaLabel: 'confirmation button',
};

function draftFrom(leadMagnet: LeadMagnet): LeadMagnetCopilotDraft {
  return {
    title: leadMagnet.title,
    subtitle: leadMagnet.subtitle,
    description: leadMagnet.description,
    bullets: leadMagnet.bullets,
    bulletsHeading: leadMagnet.bulletsHeading,
    ctaText: leadMagnet.ctaText,
    formHeading: leadMagnet.formHeading,
    formSubtext: leadMagnet.formSubtext,
    emailSubject: leadMagnet.emailSubject,
    emailPreview: leadMagnet.emailPreview,
    emailBody: leadMagnet.emailBody,
    postSignupHeading: leadMagnet.postSignupHeading,
    postSignupBody: leadMagnet.postSignupBody,
    postSignupCtaLabel: leadMagnet.postSignupCtaLabel,
    followUpEmails: leadMagnet.followUpEmails.map((email) => ({
      id: email.id,
      subject: email.subject,
      preview: email.preview,
      body: email.body,
    })),
  };
}

function changedFieldLabels(
  updates: LeadMagnetCopilotPatch,
  followUpUpdates: LeadMagnetCopilotFollowUpUpdate[]
) {
  const labels = (Object.keys(updates) as Array<keyof LeadMagnetCopilotPatch>)
    .map((field) => fieldLabels[field]);

  if (followUpUpdates.length > 0) labels.push('follow-up emails');
  return Array.from(new Set(labels));
}

export function LeadMagnetCopilot({
  leadMagnet,
  onApply,
}: {
  leadMagnet: LeadMagnet;
  onApply: (
    updates: LeadMagnetCopilotPatch,
    followUpUpdates: LeadMagnetCopilotFollowUpUpdate[]
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<DisplayMessage[]>([welcomeMessage]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [busy, messages, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  async function sendMessage(messageText = input) {
    const content = messageText.trim();
    if (!content || busy) return;

    const userMessage: DisplayMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
    };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput('');
    setError('');
    setBusy(true);

    try {
      const response = await fetch(`/api/lead-magnets/${leadMagnet.id}/copilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content: text }) => ({ role, content: text })),
          draft: draftFrom(leadMagnet),
        }),
      });
      const data = (await response.json().catch(() => null)) as (LeadMagnetCopilotResponse & {
        error?: string;
      }) | null;

      if (!response.ok || !data) {
        throw new Error(data?.error || 'The copilot could not respond. Please try again.');
      }

      const updatedFields = changedFieldLabels(data.updates, data.followUpEmailUpdates);
      if (updatedFields.length > 0) {
        onApply(data.updates, data.followUpEmailUpdates);
      }

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.reply,
          updatedFields,
        },
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The copilot could not respond. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void sendMessage();
  }

  return (
    <>
      {open && (
        <section
          aria-label="Writing copilot"
          className="fixed inset-x-3 bottom-20 z-50 flex max-h-[min(620px,calc(100dvh-6rem))] flex-col overflow-hidden rounded-lg border border-ink-300 bg-white shadow-2xl sm:inset-x-auto sm:bottom-20 sm:right-5 sm:h-[600px] sm:w-[390px]"
          id="lead-magnet-copilot"
        >
          <header className="flex items-center justify-between border-b border-ink-200 bg-ink-50 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#ff6f34] text-[#111111]">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-ink-950">Writing copilot</h2>
                <p className="truncate text-xs text-ink-500">Working on {leadMagnet.title}</p>
              </div>
            </div>
            <button
              aria-label="Close writing copilot"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-500 transition hover:bg-ink-100 hover:text-ink-950"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" ref={scrollRef}>
            <div className="space-y-3">
              {messages.map((message) => (
                <div
                  className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
                  key={message.id}
                >
                  <div
                    className={cn(
                      'max-w-[88%] rounded-lg px-3 py-2 text-sm leading-6',
                      message.role === 'user'
                        ? 'bg-ink-950 text-white'
                        : 'border border-ink-200 bg-ink-50 text-ink-800'
                    )}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.updatedFields && message.updatedFields.length > 0 && (
                      <p className="mt-2 flex items-start gap-1.5 border-t border-ink-200 pt-2 text-xs font-medium text-emerald-700">
                        <Check className="completion-tick mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Updated {message.updatedFields.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {messages.length === 1 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {quickPrompts.map((prompt) => (
                    <button
                      className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 transition hover:border-ink-400 hover:text-ink-950"
                      key={prompt}
                      onClick={() => void sendMessage(prompt)}
                      type="button"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              {busy && (
                <div className="flex justify-start" aria-live="polite">
                  <div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Improving the draft
                  </div>
                </div>
              )}
            </div>
          </div>

          <form className="border-t border-ink-200 bg-white p-3" onSubmit={submit}>
            {error && (
              <p className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700" role="alert">
                {error}
              </p>
            )}
            <div className="flex items-end gap-2 rounded-lg border border-ink-300 bg-white p-2 focus-within:border-ink-950 focus-within:ring-1 focus-within:ring-ink-950">
              <textarea
                aria-label="Message the writing copilot"
                className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-5 text-ink-950 outline-none placeholder:text-ink-400"
                disabled={busy}
                maxLength={4000}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Ask for a rewrite or improvement..."
                ref={inputRef}
                rows={1}
                value={input}
              />
              <button
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ink-950 text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={busy || !input.trim()}
                type="submit"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-2 px-1 text-[11px] leading-4 text-ink-500">
              Changes update this draft. Click Save when you are ready.
            </p>
          </form>
        </section>
      )}

      <button
        aria-controls="lead-magnet-copilot"
        aria-expanded={open}
        aria-label={open ? 'Close writing copilot' : 'Open writing copilot'}
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-[#111111] bg-[#ff6f34] text-[#111111] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[#ff6f34] focus:ring-offset-2 sm:bottom-5 sm:right-5"
        onClick={() => setOpen((current) => !current)}
        title="Writing copilot"
        type="button"
      >
        {open ? <X className="h-5 w-5" /> : <Bot className="h-6 w-6" />}
      </button>
    </>
  );
}
