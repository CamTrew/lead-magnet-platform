'use client';

import type { FormEvent, KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Bot, Check, Loader2, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type {
  LeadMagnetCopilotDraft,
  LeadMagnetCopilotFollowUpUpdate,
  LeadMagnetCopilotMessage,
  LeadMagnetCopilotPatch,
  LeadMagnetCopilotResponse,
  PersistedLeadMagnetCopilotMessage,
} from '@/lib/lead-magnet-copilot';
import { leadMagnetCopilotChangedFieldLabels } from '@/lib/lead-magnet-copilot';
import type { LeadMagnet } from '@/lib/types';
import { cn } from '@/lib/utils';

type DisplayMessage = LeadMagnetCopilotMessage & {
  id: string;
  updatedFields?: string[];
};

const welcomeMessage: DisplayMessage = {
  id: 'welcome',
  role: 'assistant',
  content: 'What are you making, who is it for, and what should it help them do? Paste rough notes. I can shape the page and emails without inventing claims.',
};

const quickPrompts = [
  'Help me draft it from scratch',
  'Sharpen the headline',
  'Improve the signup form',
  'Rewrite the delivery email',
];

function draftFrom(leadMagnet: LeadMagnet): LeadMagnetCopilotDraft {
  // Keep this an explicit allowlist. Passing the whole LeadMagnet would expose
  // URLs, publishing, integration, quiz, and timing controls to model updates.
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
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Chat history is magnet-scoped on the server. Reset local state on id
    // changes so a previous magnet's memory never flashes into the next one.
    const controller = new AbortController();
    setLoadingHistory(true);
    setMessages([welcomeMessage]);
    setError('');

    void fetch(`/api/lead-magnets/${leadMagnet.id}/copilot`, { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as {
          messages?: PersistedLeadMagnetCopilotMessage[];
          error?: string;
        } | null;
        if (!response.ok || !data) {
          throw new Error(data?.error || 'The previous chat could not be loaded.');
        }

        if (data.messages?.length) {
          setMessages(data.messages.map((message) => ({
            id: `saved-${message.id}`,
            role: message.role,
            content: message.content,
            updatedFields: message.updatedFields,
          })));
        }
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof Error ? caught.message : 'The previous chat could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingHistory(false);
      });

    return () => controller.abort();
  }, [leadMagnet.id]);

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
      if (event.key === 'Escape') closeCopilot();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  function closeCopilot() {
    setOpen(false);
    window.requestAnimationFrame(() => launcherRef.current?.focus());
  }

  async function sendMessage(messageText = input) {
    const content = messageText.trim();
    if (!content || busy || loadingHistory || resetting) return;

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
          message: content,
          draft: draftFrom(leadMagnet),
        }),
      });
      const data = (await response.json().catch(() => null)) as (LeadMagnetCopilotResponse & {
        error?: string;
      }) | null;

      if (!response.ok || !data) {
        throw new Error(data?.error || 'The copilot could not respond. Please try again.');
      }

      const updatedFields = leadMagnetCopilotChangedFieldLabels(data.updates, data.followUpEmailUpdates);
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
      setMessages((current) => current.filter((message) => message.id !== userMessage.id));
      setInput(content);
      setError(caught instanceof Error ? caught.message : 'The copilot could not respond. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function startNewChat() {
    if (busy || loadingHistory || resetting) return;
    if (!window.confirm('Start a new chat? This clears the saved conversation for this magnet.')) return;

    setResetting(true);
    setError('');
    try {
      const response = await fetch(`/api/lead-magnets/${leadMagnet.id}/copilot`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || 'The chat could not be cleared.');
      }
      setMessages([welcomeMessage]);
      setInput('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The chat could not be cleared.');
    } finally {
      setResetting(false);
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
      <AnimatePresence initial={false}>
        {open && (
          <motion.section
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-label="Writing copilot"
            className="fixed inset-x-3 bottom-20 z-50 flex max-h-[min(620px,calc(100dvh-6rem))] origin-bottom-right flex-col overflow-hidden rounded-lg border border-ink-300 bg-white shadow-2xl sm:inset-x-auto sm:bottom-20 sm:right-5 sm:h-[600px] sm:w-[390px]"
            exit={
              reduceMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    scale: 0.965,
                    y: 16,
                    transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
                  }
            }
            id="lead-magnet-copilot"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 24 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.36, ease: [0.16, 1, 0.3, 1] }
            }
          >
          <header className="flex items-center justify-between border-b border-ink-200 bg-ink-50 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#ff6f34] text-[#111111]">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-ink-950">Writing copilot</h2>
                <p className="truncate text-xs text-ink-500">Remembers this magnet&apos;s chat</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                aria-label="Start a new chat"
                className="flex h-9 w-9 items-center justify-center rounded-md text-ink-500 transition hover:bg-ink-100 hover:text-ink-950 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={busy || loadingHistory || resetting}
                onClick={() => void startNewChat()}
                title="Start a new chat"
                type="button"
              >
                {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              </button>
              <button
                aria-label="Close writing copilot"
                className="flex h-9 w-9 items-center justify-center rounded-md text-ink-500 transition hover:bg-ink-100 hover:text-ink-950"
                onClick={closeCopilot}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
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

              {!loadingHistory && messages.length === 1 && (
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

              {loadingHistory && (
                <div className="flex justify-start" aria-live="polite">
                  <div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading this magnet&apos;s chat
                  </div>
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
                disabled={busy || loadingHistory || resetting}
                maxLength={4000}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Describe the topic, audience, and result..."
                ref={inputRef}
                rows={1}
                value={input}
              />
              <button
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ink-950 text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={busy || loadingHistory || resetting || !input.trim()}
                type="submit"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-2 px-1 text-[11px] leading-4 text-ink-500">
              This chat is saved to this magnet. Changes update the draft until you save.
            </p>
          </form>
          </motion.section>
        )}
      </AnimatePresence>

      <button
        aria-controls="lead-magnet-copilot"
        aria-expanded={open}
        aria-label={open ? 'Close writing copilot' : 'Open writing copilot'}
        className={cn(
          'lead-magnet-copilot-launcher fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-[#111111] bg-[#ff6f34] text-[#111111] shadow-lg transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[#ff6f34] focus:ring-offset-2 sm:bottom-5 sm:right-5',
          open && 'shadow-xl'
        )}
        onClick={() => (open ? closeCopilot() : setOpen(true))}
        ref={launcherRef}
        title="Writing copilot"
        type="button"
      >
        <Bot
          className={cn(
            'lead-magnet-copilot-launcher-icon absolute h-6 w-6 transition-[opacity,transform] duration-300',
            open ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'
          )}
        />
        <X
          className={cn(
            'lead-magnet-copilot-launcher-icon absolute h-5 w-5 transition-[opacity,transform] duration-300',
            open ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0'
          )}
        />
      </button>
    </>
  );
}
