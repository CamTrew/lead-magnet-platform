'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  FileCheck2,
  Gift,
  Globe2,
  LayoutTemplate,
  ListChecks,
  Loader2,
  Rocket,
  Sparkles,
} from 'lucide-react';
import {
  AceternityButton,
  AceternityInput,
  Field,
} from '@/components/ui/aceternity';
import { MagnetsLogoMark } from '@/components/magnets-logo-mark';
import { cn } from '@/lib/utils';

const BUSINESS_TYPES = [
  'Solo creator',
  'Newsletter',
  'Small business',
  'SaaS product',
  'Agency',
  'Consultancy',
  'Coach',
  'Other',
] as const;
const MAGNET_TYPES = [
  'Guide / ebook',
  'Checklist',
  'Template',
  'Webinar replay',
  'Course preview',
  'Discount code',
  'Audit / scorecard',
  'Other',
] as const;
const CADENCES = ['Weekly', 'Bi-weekly', 'Monthly', 'Quarterly', 'Ad-hoc'] as const;

type PublishingChoice = 'magnets' | 'custom';
type OnboardingResult = {
  account?: {
    username?: string;
  };
  error?: string;
};

const TOTAL_STEPS = 4;

function Progress({ step }: { step: number }) {
  return (
    <div aria-label={`Step ${step + 1} of ${TOTAL_STEPS}`} className="flex gap-1.5">
      {Array.from({ length: TOTAL_STEPS }, (_, index) => (
        <span
          className={cn(
            'h-1.5 flex-1 rounded-full transition',
            index <= step ? 'bg-brand-orange' : 'bg-ink-200'
          )}
          key={index}
        />
      ))}
    </div>
  );
}

function ChoiceCard({
  checked,
  description,
  icon: Icon,
  name,
  onChange,
  title,
  value,
}: {
  checked: boolean;
  description: string;
  icon: typeof Gift;
  name: string;
  onChange: () => void;
  title: string;
  value: string;
}) {
  return (
    <label
      className={cn(
        'relative flex cursor-pointer gap-3 rounded-xl border p-4 transition',
        checked
          ? 'border-brand-orange bg-brand-orange/5 ring-2 ring-brand-orange/10'
          : 'border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50'
      )}
    >
      <input
        checked={checked}
        className="sr-only"
        name={name}
        onChange={onChange}
        type="radio"
        value={value}
      />
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          checked ? 'bg-brand-orange text-ink-950' : 'bg-ink-100 text-ink-600'
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink-950">
          {title}
          {checked && <Check className="h-3.5 w-3.5 text-brand-orange" />}
        </span>
        <span className="mt-1 block text-xs leading-5 text-ink-600">{description}</span>
      </span>
    </label>
  );
}

export function OnboardingGate({ userName }: { userName: string }) {
  const [step, setStep] = useState(0);
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [magnetType, setMagnetType] = useState('');
  const [cadence, setCadence] = useState('');
  const [publishingChoice, setPublishingChoice] = useState<PublishingChoice>('magnets');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [completedUsername, setCompletedUsername] = useState('');

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const profileValid =
    Boolean(businessName.trim()) &&
    BUSINESS_TYPES.includes(businessType as (typeof BUSINESS_TYPES)[number]) &&
    CADENCES.includes(cadence as (typeof CADENCES)[number]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step !== TOTAL_STEPS - 1 || !profileValid || !magnetType || busy) return;
    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: businessName.trim(),
          businessType,
          magnetType,
          cadence,
        }),
      });
      const data = (await response.json().catch(() => null)) as OnboardingResult | null;
      if (!response.ok) {
        throw new Error(data?.error || 'Could not save your answers.');
      }
      setCompletedUsername(data?.account?.username || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  function continueToDestination() {
    if (publishingChoice === 'custom') {
      window.location.assign('/dashboard?setup=custom-domain');
      return;
    }
    window.location.assign('/dashboard/pages?new=1');
  }

  const firstName = userName.trim().split(/\s+/)[0];

  return (
    <div
      aria-labelledby="onboarding-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/55 p-3 backdrop-blur-md sm:p-6"
      role="dialog"
    >
      <div className="vercel-grid-bg pointer-events-none absolute inset-0 opacity-20 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
      <form
        className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[0_40px_120px_-40px_rgba(0,0,0,0.55)] sm:max-h-[calc(100dvh-3rem)]"
        onSubmit={submit}
      >
        <div className="border-b border-ink-200 bg-ink-50 px-5 py-4 sm:px-7 sm:py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <MagnetsLogoMark className="h-9 w-9" />
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-500">
                  Welcome to Magnets
                </p>
                <h2 id="onboarding-title" className="text-lg font-semibold text-ink-950">
                  {firstName ? `Let’s get you started, ${firstName}.` : 'Let’s get you started.'}
                </h2>
              </div>
            </div>
            {!completedUsername && (
              <span className="hidden text-xs font-medium text-ink-500 sm:block">
                {step + 1} of {TOTAL_STEPS}
              </span>
            )}
          </div>
          {!completedUsername && <div className="mt-4"><Progress step={step} /></div>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-7">
          {completedUsername ? (
            <div className="mx-auto max-w-xl py-3 text-center sm:py-6">
              <span className="onboarding-success-icon mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-7 w-7" />
              </span>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                Your workspace is ready
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-ink-950">
                {publishingChoice === 'custom' ? 'Let’s connect your domain' : 'Let’s make your first lead magnet'}
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-ink-600">
                {publishingChoice === 'custom'
                  ? 'We’ll show you the exact DNS records to add. You can keep using your Magnets URL while the custom domain connects.'
                  : 'Start with one useful outcome. Magnets will guide you through the page, resource email, follow-up, and publishing.'}
              </p>

              {publishingChoice === 'magnets' && completedUsername && (
                <div className="mx-auto mt-5 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-left">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                    Your free publishing address
                  </p>
                  <p className="mt-1 font-mono text-sm text-ink-900">magnets.so/{completedUsername}/...</p>
                </div>
              )}

              <div className="mx-auto mt-6 grid max-w-md gap-3 text-left">
                {(publishingChoice === 'custom'
                  ? [
                      'Enter your root domain and choose a subdomain',
                      'Add the ownership record shown by Magnets',
                      'Connect the subdomain and start publishing',
                    ]
                  : [
                      'Create a focused page with a clear promise',
                      'Add the resource and delivery email',
                      'Preview, publish, and share your link',
                    ]
                ).map((item, index) => (
                  <div className="flex items-center gap-3 text-sm text-ink-700" key={item}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-orange/10 text-xs font-semibold text-brand-orange">
                      {index + 1}
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ) : step === 0 ? (
            <div className="mx-auto max-w-2xl">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-orange/20 bg-brand-orange/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-700">
                <BookOpen className="h-3 w-3 text-brand-orange" />
                The two-minute version
              </span>
              <h3 className="mt-4 text-2xl font-semibold tracking-[-0.025em] text-ink-950">
                Turn useful knowledge into an audience you can reach
              </h3>
              <p className="mt-2 text-sm leading-6 text-ink-600 sm:text-base">
                A lead magnet is a useful free resource someone receives in exchange for their email.
                It gives them a quick win and gives you a relevant way to follow up, even if they are not
                ready to buy or book today.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  [Gift, 'Attract the right people', 'Focus on one problem your ideal customer already wants solved.'],
                  [LayoutTemplate, 'Capture real interest', 'Turn a passing visitor into someone you can reach again.'],
                  [Rocket, 'Build trust at scale', 'Deliver a useful result and follow up automatically.'],
                ].map(([Icon, title, detail]) => {
                  const CardIcon = Icon as typeof Gift;
                  return (
                    <div className="rounded-xl border border-ink-200 bg-ink-50 p-4" key={title as string}>
                      <CardIcon className="h-5 w-5 text-brand-orange" />
                      <p className="mt-3 text-sm font-semibold text-ink-950">{title as string}</p>
                      <p className="mt-1 text-xs leading-5 text-ink-600">{detail as string}</p>
                    </div>
                  );
                })}
              </div>

              <p className="onboarding-success-callout mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">
                <strong>You can launch without a custom domain.</strong> Magnets gives you a working link immediately,
                and you can connect your own domain later.
              </p>
            </div>
          ) : step === 1 ? (
            <div className="mx-auto max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-orange">Start small and specific</p>
              <h3 className="mt-2 text-xl font-semibold text-ink-950">What could you give away?</h3>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                The format matters less than the result. Choose one immediate problem, make the promise
                specific, and give people something they can use quickly.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {MAGNET_TYPES.map((type) => {
                  const icon = type === 'Checklist'
                    ? ListChecks
                    : type === 'Template'
                      ? FileCheck2
                      : type === 'Audit / scorecard'
                        ? Sparkles
                        : Gift;
                  return (
                    <ChoiceCard
                      checked={magnetType === type}
                      description={
                        type === 'Checklist'
                          ? 'Help someone complete a process without missing a step.'
                          : type === 'Template'
                            ? 'Give them a useful starting point and save them time.'
                            : type === 'Audit / scorecard'
                              ? 'Help them understand where they are and what to do next.'
                              : type === 'Guide / ebook'
                                ? 'Teach one narrow topic with a clear, practical outcome.'
                                : 'A useful format when it closely matches your audience’s next step.'
                      }
                      icon={icon}
                      key={type}
                      name="magnetType"
                      onChange={() => setMagnetType(type)}
                      title={type}
                      value={type}
                    />
                  );
                })}
              </div>
            </div>
          ) : step === 2 ? (
            <div className="mx-auto max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-orange">Make it yours</p>
              <h3 className="mt-2 text-xl font-semibold text-ink-950">Tell us what you’re building</h3>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                We use this context to give you a sensible publishing address and more relevant writing help.
              </p>
              <div className="mt-6 grid gap-4">
                <Field label="Business or creator name">
                  <AceternityInput
                    autoFocus
                    disabled={busy}
                    maxLength={80}
                    onChange={(event) => setBusinessName(event.target.value)}
                    placeholder="Your business or creator name"
                    value={businessName}
                  />
                </Field>
                <Field label="What kind of business is it?">
                  <OnboardingSelect
                    disabled={busy}
                    onChange={setBusinessType}
                    options={BUSINESS_TYPES}
                    placeholder="Pick a category"
                    value={businessType}
                  />
                </Field>
                <Field label="How often do you expect to publish?">
                  <OnboardingSelect
                    disabled={busy}
                    onChange={setCadence}
                    options={CADENCES}
                    placeholder="Pick a cadence"
                    value={cadence}
                  />
                </Field>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-orange">Choose your publishing address</p>
              <h3 className="mt-2 text-xl font-semibold text-ink-950">Where do you want to publish?</h3>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                Both options include the same pages, signup forms, delivery emails, and follow-up tools.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <ChoiceCard
                  checked={publishingChoice === 'magnets'}
                  description="Launch immediately on a free magnets.so address. You can connect a domain later."
                  icon={Rocket}
                  name="publishingChoice"
                  onChange={() => setPublishingChoice('magnets')}
                  title="Use my Magnets link"
                  value="magnets"
                />
                <ChoiceCard
                  checked={publishingChoice === 'custom'}
                  description="Use an address like get.yourdomain.com. You’ll need access to your DNS settings."
                  icon={Globe2}
                  name="publishingChoice"
                  onChange={() => setPublishingChoice('custom')}
                  title="Connect my own domain"
                  value="custom"
                />
              </div>

              <div className="mt-5 rounded-xl border border-ink-200 bg-ink-50 p-4">
                <p className="text-sm font-semibold text-ink-950">
                  {publishingChoice === 'custom' ? 'What happens next' : 'Recommended for your first launch'}
                </p>
                <p className="mt-1 text-sm leading-6 text-ink-600">
                  {publishingChoice === 'custom'
                    ? 'We’ll take you to a guided domain setup with the exact ownership and CNAME records to add.'
                    : 'Start creating now and remove DNS from your to-do list. Your Magnets link is fully shareable.'}
                </p>
              </div>

              {error && (
                <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-ink-200 bg-white px-5 py-4 sm:px-7">
          {completedUsername ? (
            <>
              <p className="hidden text-xs text-ink-500 sm:block">
                Help is always available from the sidebar.
              </p>
              <AceternityButton className="ml-auto" onClick={continueToDestination} type="button">
                {publishingChoice === 'custom' ? 'Set up my domain' : 'Create my first lead magnet'}
                <ArrowRight className="h-4 w-4" />
              </AceternityButton>
            </>
          ) : (
            <>
              <AceternityButton
                className={cn(step === 0 && 'invisible')}
                disabled={busy}
                onClick={() => {
                  setError('');
                  setStep((current) => Math.max(0, current - 1));
                }}
                type="button"
                variant="secondary"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </AceternityButton>
              {step < TOTAL_STEPS - 1 ? (
                <AceternityButton
                  disabled={
                    busy ||
                    (step === 1 && !magnetType) ||
                    (step === 2 && !profileValid)
                  }
                  onClick={() => setStep((current) => Math.min(TOTAL_STEPS - 1, current + 1))}
                  type="button"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </AceternityButton>
              ) : (
                <AceternityButton disabled={busy || !profileValid || !magnetType} type="submit">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {busy ? 'Preparing workspace' : 'Finish setup'}
                </AceternityButton>
              )}
            </>
          )}
        </div>
      </form>
    </div>
  );
}

function OnboardingSelect({
  disabled,
  onChange,
  options,
  placeholder,
  value,
}: {
  disabled?: boolean;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder: string;
  value: string;
}) {
  return (
    <select
      className="h-10 w-full rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900 outline-none focus:border-ink-950 focus:ring-1 focus:ring-ink-950 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9"
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      required
      value={value}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
