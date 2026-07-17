'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import {
  isSafePostSignupDestination,
  postSignupVideoEmbedUrl,
  resolvePostSignupExperience,
} from '@/lib/post-signup';
import type { LeadMagnet, PostSignupQuizOption, PostSignupQuizQuestion } from '@/lib/types';

interface PostSignupBrand {
  displayName: string;
  homeHref: string;
  logoText: string;
  logoUrl: string;
  privacyPolicyUrl: string;
  termsUrl: string;
}

interface LeadMagnetExperienceContextValue {
  showPostSignup: (submissionId: string) => void;
}

const LeadMagnetExperienceContext = createContext<LeadMagnetExperienceContextValue | null>(null);

export function useLeadMagnetExperience() {
  return useContext(LeadMagnetExperienceContext);
}

export function LeadMagnetExperience({
  brand,
  children,
  magnet,
}: {
  brand: PostSignupBrand;
  children: ReactNode;
  magnet: LeadMagnet;
}) {
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const experience = resolvePostSignupExperience(magnet);
  const showPostSignup = useCallback((nextSubmissionId: string) => {
    setSubmissionId(nextSubmissionId);
  }, []);
  const contextValue = useMemo(() => ({ showPostSignup }), [showPostSignup]);

  useEffect(() => {
    if (submissionId === null) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [submissionId]);

  return (
    <LeadMagnetExperienceContext.Provider value={contextValue}>
      {submissionId === null ? children : (
        <PostSignupLandingPage
          brand={brand}
          leadMagnetId={magnet.id}
          magnet={magnet}
          showQuiz={experience.kind === 'quiz' && Boolean(submissionId)}
          submissionId={submissionId}
        />
      )}
    </LeadMagnetExperienceContext.Provider>
  );
}

function PostSignupLandingPage({
  brand,
  leadMagnetId,
  magnet,
  showQuiz,
  submissionId,
}: {
  brand: PostSignupBrand;
  leadMagnetId: string;
  magnet: LeadMagnet;
  showQuiz: boolean;
  submissionId: string;
}) {
  return (
    <>
      <header className="relative z-10">
        <div className="mx-auto flex max-w-[1280px] items-center justify-center px-4 pb-7 pt-6 sm:px-6 sm:pb-8 sm:pt-7 lg:px-8">
          <a
            className="inline-flex min-h-10 max-w-full items-center justify-center gap-2 transition-transform hover:scale-[1.01]"
            href={brand.homeHref}
          >
            <PostSignupBrandLockup brand={brand} />
          </a>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center">
        <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-4 sm:px-6 sm:pb-20 sm:pt-8 lg:px-8 lg:pb-24">
          {showQuiz ? (
            <QuizExperience
              leadMagnetId={leadMagnetId}
              magnet={magnet}
              submissionId={submissionId}
            />
          ) : (
            <CustomSuccess magnet={magnet} />
          )}
        </div>
      </main>

      <PostSignupFooter brand={brand} />
    </>
  );
}

function PostSignupBrandLockup({ brand }: { brand: PostSignupBrand }) {
  const logoText = brand.logoText.trim();

  if (brand.logoUrl) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          className="h-8 w-auto max-w-[52px] object-contain sm:h-10"
          src={brand.logoUrl}
        />
        {logoText && (
          <span className="magnet-page-heading min-w-0 max-w-[72vw] truncate text-[32px] font-semibold leading-none text-gray-950 sm:text-[44px] lg:text-[48px]">
            {logoText}
          </span>
        )}
      </>
    );
  }

  return (
    <span className="magnet-page-heading max-w-[82vw] truncate text-[32px] font-semibold leading-none text-gray-950 sm:text-[44px] lg:text-[48px]">
      {brand.displayName}
    </span>
  );
}

function CustomSuccess({ magnet }: { magnet: LeadMagnet }) {
  const heading = magnet.postSignupHeading.trim() || 'You are in.';
  const body = magnet.postSignupBody.trim() || 'Check your inbox for the resource.';
  const embedUrl = postSignupVideoEmbedUrl(magnet.postSignupVideoUrl);
  const ctaUrl = isSafePostSignupDestination(magnet.postSignupCtaUrl) ? magnet.postSignupCtaUrl : '';
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="mx-auto flex w-full max-w-[1040px] flex-col items-center text-center">
      <div
        className="mb-7 inline-flex h-14 w-14 items-center justify-center rounded-2xl text-white sm:mb-8"
        style={{
          background: 'var(--brand-primary)',
          boxShadow: '0 18px 42px rgb(var(--brand-primary-rgb) / 0.28)',
        }}
      >
        <Check className="h-7 w-7" strokeWidth={3} />
      </div>

      <h1
        className="magnet-page-heading max-w-4xl text-4xl font-semibold leading-[1.08] text-gray-950 outline-none sm:text-5xl lg:text-[64px] lg:leading-[1.02]"
        ref={headingRef}
        tabIndex={-1}
      >
        {heading}
      </h1>
      <p className="magnet-page-muted mt-5 max-w-3xl whitespace-pre-line text-lg leading-8 text-gray-600 sm:mt-6 sm:text-xl">
        {body}
      </p>

      {embedUrl && (
        <div
          className="magnet-post-signup-media mt-10 w-full overflow-hidden rounded-[20px] border border-gray-200/70 bg-gray-950 shadow-2xl sm:mt-12 sm:rounded-[24px]"
          style={{ boxShadow: '0 36px 100px -48px rgb(15 23 42 / 0.7)' }}
        >
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
          className="mt-8 inline-flex min-h-14 min-w-56 items-center justify-center gap-2 rounded-xl bg-gray-950 px-7 py-3.5 text-base font-semibold text-white shadow-xl shadow-gray-950/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-800 hover:shadow-2xl sm:mt-10"
          href={ctaUrl}
        >
          {magnet.postSignupCtaLabel.trim()}
          <ArrowRight className="h-5 w-5" />
        </a>
      )}
    </section>
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
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const savingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const questions = magnet.postSignupQuizQuestions;
  const question = questions[questionIndex];

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [questionIndex]);

  async function chooseAnswer(currentQuestion: PostSignupQuizQuestion, option: PostSignupQuizOption) {
    if (savingRef.current) return;
    savingRef.current = true;
    setError('');
    setNeedsRefresh(false);
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
      const data = await response.json().catch(() => null) as {
        completed?: boolean;
        error?: string;
        destinationUrl?: string;
      } | null;
      if (!response.ok) {
        if (response.status === 404) setNeedsRefresh(true);
        throw new Error(data?.error || 'Could not save that answer.');
      }

      const completed = data?.completed === true
        || (data?.completed === undefined && questionIndex >= questions.length - 1);
      if (completed && isSafePostSignupDestination(data?.destinationUrl || '')) {
        window.location.assign(data?.destinationUrl || '');
      } else if (completed) {
        setQuestionIndex(questions.length);
      } else if (questionIndex < questions.length - 1) {
        setQuestionIndex((index) => index + 1);
      } else {
        setNeedsRefresh(true);
        setError('This quiz changed while you were answering it. Restart to load the latest questions.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that answer.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  if (!question) {
    return <CustomSuccess magnet={magnet} />;
  }

  return (
    <section className="mx-auto flex w-full max-w-[760px] flex-col items-center text-center">
      <p className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--brand-primary)]">
        {magnet.postSignupQuizTitle.trim() || 'One quick question'}
      </p>
      <h1
        className="magnet-page-heading max-w-3xl text-4xl font-semibold leading-[1.08] text-gray-950 outline-none sm:text-5xl"
        ref={headingRef}
        tabIndex={-1}
      >
        {question.prompt}
      </h1>
      {magnet.postSignupQuizDescription.trim() && (
        <p className="magnet-page-muted mt-5 max-w-2xl text-base leading-7 text-gray-600 sm:text-lg">
          {magnet.postSignupQuizDescription}
        </p>
      )}

      <div className="mt-9 w-full space-y-3 text-left sm:mt-10">
        {question.options.map((option) => (
          <button
            className="magnet-quiz-option group flex min-h-16 w-full items-center justify-between rounded-2xl border border-gray-200 bg-white/90 px-5 py-4 text-left text-base font-medium text-gray-900 shadow-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-[var(--brand-primary)] hover:bg-[var(--brand-primary-soft)] hover:shadow-lg disabled:cursor-wait disabled:opacity-70 sm:px-6"
            disabled={isSaving}
            key={option.id}
            onClick={() => chooseAnswer(question, option)}
            type="button"
          >
            <span>{option.label}</span>
            {isSaving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ArrowRight className="h-5 w-5 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-[var(--brand-primary)]" />
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-5 w-full space-y-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <p>{error}</p>
          {needsRefresh && (
            <button
              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
              onClick={() => window.location.reload()}
              type="button"
            >
              Restart with latest quiz
            </button>
          )}
        </div>
      )}
      {questions.length > 1 && (
        <p className="magnet-page-muted mt-5 text-sm text-gray-500">
          Question {Math.min(questionIndex + 1, questions.length)} of {questions.length}
        </p>
      )}
    </section>
  );
}

function PostSignupFooter({ brand }: { brand: PostSignupBrand }) {
  return (
    <footer className="magnet-page-footer relative z-10 border-t border-gray-200/60 bg-white/55 py-11">
      <div className="magnet-page-muted mx-auto flex max-w-[1280px] flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 text-center text-sm text-gray-500 sm:px-6 lg:px-8">
        <span>All rights reserved {new Date().getFullYear()}</span>
        {brand.privacyPolicyUrl && (
          <a className="transition hover:text-gray-900" href={brand.privacyPolicyUrl} rel="noreferrer" target="_blank">
            Privacy policy
          </a>
        )}
        {brand.termsUrl && (
          <a className="transition hover:text-gray-900" href={brand.termsUrl} rel="noreferrer" target="_blank">
            Terms
          </a>
        )}
      </div>
    </footer>
  );
}
