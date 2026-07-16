'use client';

import { useState } from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import type { LeadMagnet, PostSignupQuizOption, PostSignupQuizQuestion } from '@/lib/types';

function videoEmbedUrl(value: string) {
  if (!value) return '';

  try {
    const url = new URL(value);
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }
    if (url.hostname.endsWith('youtube.com')) {
      const id = url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).at(-1);
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }
    if (url.hostname.endsWith('loom.com')) {
      const id = url.pathname.split('/').filter(Boolean).at(-1);
      return id ? `https://www.loom.com/embed/${id}` : '';
    }
  } catch {
    return '';
  }

  return '';
}

function isSafeDestination(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function DefaultSuccess() {
  return (
    <div className="magnet-form flex flex-col items-center gap-4 text-center">
      <div
        className="inline-flex h-14 w-14 items-center justify-center rounded-2xl text-white"
        style={{
          background: 'var(--brand-primary)',
          boxShadow: '0 18px 42px rgb(var(--brand-primary-rgb) / 0.28)',
        }}
      >
        <Check className="h-7 w-7" strokeWidth={3} />
      </div>
      <h3 className="magnet-page-heading text-2xl font-semibold text-gray-900">Check your email</h3>
      <p className="magnet-page-muted text-base leading-7 text-gray-600">
        We just sent the download link to your inbox. Check your spam folder if it&apos;s not there.
      </p>
    </div>
  );
}

function CustomSuccess({ magnet }: { magnet: LeadMagnet }) {
  const heading = magnet.postSignupHeading.trim() || 'You are in.';
  const body = magnet.postSignupBody.trim() || 'Check your inbox for the resource.';
  const embedUrl = videoEmbedUrl(magnet.postSignupVideoUrl);
  const ctaUrl = isSafeDestination(magnet.postSignupCtaUrl) ? magnet.postSignupCtaUrl : '';

  return (
    <div className="magnet-form space-y-5 text-center">
      <div
        className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl text-white"
        style={{
          background: 'var(--brand-primary)',
          boxShadow: '0 18px 42px rgb(var(--brand-primary-rgb) / 0.28)',
        }}
      >
        <Check className="h-7 w-7" strokeWidth={3} />
      </div>
      <div className="space-y-2">
        <h3 className="magnet-page-heading text-2xl font-semibold text-gray-900">{heading}</h3>
        <p className="magnet-page-muted whitespace-pre-line text-base leading-7 text-gray-600">{body}</p>
      </div>
      {embedUrl && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-100 shadow-sm">
          <div className="aspect-video">
            <iframe
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full"
              src={embedUrl}
              title="Next step video"
            />
          </div>
        </div>
      )}
      {ctaUrl && magnet.postSignupCtaLabel.trim() && (
        <a
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
          href={ctaUrl}
        >
          {magnet.postSignupCtaLabel.trim()}
          <ArrowRight className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

function QuizExperience({
  leadMagnetId,
  magnet,
  submissionId,
}: {
  leadMagnetId: string;
  magnet: LeadMagnet;
  submissionId: string;
}) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const questions = magnet.postSignupQuizQuestions;
  const question = questions[questionIndex];

  async function chooseAnswer(currentQuestion: PostSignupQuizQuestion, option: PostSignupQuizOption) {
    if (isSaving) return;
    setError('');
    setIsSaving(true);

    try {
      const response = await fetch('/api/quiz-responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId,
          leadMagnetId,
          questionId: currentQuestion.id,
          optionId: option.id,
        }),
      });
      const data = await response.json().catch(() => null) as { error?: string; destinationUrl?: string } | null;
      if (!response.ok) throw new Error(data?.error || 'Could not save that answer.');

      if (questionIndex < questions.length - 1) {
        setQuestionIndex((index) => index + 1);
      } else if (isSafeDestination(data?.destinationUrl || '')) {
        window.location.assign(data?.destinationUrl || '');
      } else if (magnet.postSignupMode === 'redirect' && isSafeDestination(magnet.postSignupRedirectUrl)) {
        window.location.assign(magnet.postSignupRedirectUrl);
      } else {
        setQuestionIndex(questions.length);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that answer.');
    } finally {
      setIsSaving(false);
    }
  }

  if (!question) {
    return <CustomSuccess magnet={magnet} />;
  }

  return (
    <div className="magnet-form space-y-5 text-center">
      <div className="space-y-2">
        <p className="text-xs font-medium text-[var(--brand-primary)]">
          {magnet.postSignupQuizTitle.trim() || 'One quick question'}
        </p>
        <h3 className="magnet-page-heading text-2xl font-semibold text-gray-900">{question.prompt}</h3>
        {magnet.postSignupQuizDescription.trim() && (
          <p className="magnet-page-muted text-sm leading-6 text-gray-600">{magnet.postSignupQuizDescription}</p>
        )}
      </div>
      <div className="space-y-2.5 text-left">
        {question.options.map((option) => (
          <button
            className="group flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-left text-sm font-medium text-gray-900 shadow-sm transition hover:border-[var(--brand-primary)] hover:bg-[var(--brand-primary-soft)] disabled:cursor-wait disabled:opacity-70"
            disabled={isSaving}
            key={option.id}
            onClick={() => chooseAnswer(question, option)}
            type="button"
          >
            <span>{option.label}</span>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-[var(--brand-primary)]" />}
          </button>
        ))}
      </div>
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
      {questions.length > 1 && (
        <p className="magnet-page-muted text-xs text-gray-500">Question {Math.min(questionIndex + 1, questions.length)} of {questions.length}</p>
      )}
    </div>
  );
}

/** Inputs + submission state, including optional post-signup experience. */
export function LeadMagnetForm({
  accountId,
  magnet,
}: {
  accountId: string;
  magnet: LeadMagnet;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionId, setSubmissionId] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, leadMagnetId: magnet.id, slug: magnet.slug, name, email }),
      });
      const data = await response.json().catch(() => null) as { error?: string; submissionId?: string } | null;
      if (!response.ok) throw new Error(data?.error || 'Failed to submit');

      const hasQuiz = magnet.postSignupMode === 'page'
        && magnet.postSignupQuizEnabled
        && magnet.postSignupQuizQuestions.length > 0;
      if (!hasQuiz && magnet.postSignupMode === 'redirect' && isSafeDestination(magnet.postSignupRedirectUrl)) {
        window.location.assign(magnet.postSignupRedirectUrl);
        return;
      }

      setSubmissionId(data?.submissionId || '');
      setIsSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSuccess) {
    if (
      magnet.postSignupMode === 'page'
      && magnet.postSignupQuizEnabled
      && magnet.postSignupQuizQuestions.length > 0
      && submissionId
    ) {
      return <QuizExperience leadMagnetId={magnet.id} magnet={magnet} submissionId={submissionId} />;
    }
    if (magnet.postSignupMode === 'page') return <CustomSuccess magnet={magnet} />;
    return <DefaultSuccess />;
  }

  return (
    <form onSubmit={handleSubmit} className="magnet-form space-y-4">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="magnet-form-input h-14 w-full rounded-xl border-2 border-gray-200 bg-white/80 px-5 text-[15px] text-gray-900 shadow-sm outline-none transition-all placeholder:text-gray-500 focus:border-[var(--brand-primary)] focus:bg-white focus:ring-2 focus:ring-[var(--brand-primary-soft)]"
        placeholder="Name"
        required
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="magnet-form-input h-14 w-full rounded-xl border-2 border-gray-200 bg-white/80 px-5 text-[15px] text-gray-900 shadow-sm outline-none transition-all placeholder:text-gray-500 focus:border-[var(--brand-primary)] focus:bg-white focus:ring-2 focus:ring-[var(--brand-primary-soft)]"
        placeholder="Email"
        required
      />

      {error && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-gray-900 to-gray-800 px-4 py-3 text-center text-sm font-semibold leading-tight text-white shadow-xl shadow-gray-900/30 transition-all duration-200 hover:scale-[1.01] hover:shadow-2xl hover:shadow-gray-900/40 disabled:opacity-50 disabled:hover:scale-100"
      >
        {isSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}
        {isSubmitting ? 'Sending' : magnet.ctaText}
      </button>
    </form>
  );
}
