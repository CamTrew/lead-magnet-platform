import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  CircleCheck,
  FileText,
  Globe2,
  Mail,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import { HeroDashboard } from '@/components/landing/hero-dashboard';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { safeJsonLd } from '@/lib/lead-magnet-metadata';
import { MagnetsLogo, MagnetsLogoMark } from '@/components/magnets-logo-mark';
import { ThemeToggle } from '@/components/theme-toggle';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so').replace(/\/$/, '');

export const metadata: Metadata = {
  title: 'Lead Magnet Builder for Landing Pages and Email Capture',
  description:
    'Create lead magnet landing pages, capture emails, deliver resources instantly, and follow up automatically. Publish on Magnets or your own domain.',
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: 'Magnets | Lead Magnet Builder',
    description:
      'Create a lead magnet page, capture emails, deliver the resource, and follow up from one place.',
    url: SITE_URL,
    images: [
      {
        url: '/landing-dashboard.png',
        width: 1280,
        height: 720,
        alt: 'Magnets lead magnet builder dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Magnets | Lead Magnet Builder',
    description:
      'Create a lead magnet page, capture emails, deliver the resource, and follow up from one place.',
    images: ['/landing-dashboard.png'],
  },
};

const outcomes = [
  'Publish on a Magnets URL before you buy, connect, or configure anything else.',
  'Send the resource immediately from Magnets, then switch to your own verified sender when you want to.',
  'Keep each lead connected to the right follow-up and integrations.',
];

const features = [
  {
    icon: FileText,
    title: 'Make the offer clear',
    description: 'Put the problem, the promise, and the resource on one focused page people understand in seconds.',
  },
  {
    icon: Mail,
    title: 'Deliver it immediately',
    description: 'The resource email goes out as soon as someone signs up, so there is no manual sending or chasing.',
  },
  {
    icon: Send,
    title: 'Follow up while it matters',
    description: 'Add a sequence, control the delays, and stop it when someone books a call.',
  },
  {
    icon: Users,
    title: 'Send leads where work happens',
    description: 'Keep signups in Magnets or send them to Beehiiv, Kit, Slack, Pipedrive, Zapier, and your existing workflow.',
  },
];

const steps = [
  ['01', 'Make the offer', 'Show the problem, the promise, and exactly what people get.'],
  ['02', 'Share one link', 'Publish on Magnets now. Connect your own domain when it is worth doing.'],
  ['03', 'Turn interest into action', 'Deliver the resource, follow up, and route each lead into your stack.'],
];

const faqs = [
  {
    question: 'Can I publish before I have a domain?',
    answer: 'Yes. Choose a Magnets username and publish on your Magnets URL. A custom domain is optional.',
  },
  {
    question: 'Will Magnets send the resource email for me?',
    answer: 'Yes. Magnets can send the resource email from its verified sender address. You can add your own sender domain later.',
  },
  {
    question: 'Can I follow up with new signups?',
    answer: 'Yes. Add a sequence, choose the timing for each email, and stop it automatically when someone books a call.',
  },
];

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Magnets',
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/brand/magnets-mark-dark.png`,
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'Magnets',
      url: SITE_URL,
      publisher: { '@id': `${SITE_URL}/#organization` },
      inLanguage: 'en',
    },
    {
      '@type': 'WebPage',
      '@id': `${SITE_URL}/#webpage`,
      name: 'Lead Magnet Builder for Landing Pages and Email Capture',
      description:
        'Create lead magnet landing pages, capture emails, deliver resources instantly, and follow up automatically.',
      url: SITE_URL,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      about: { '@id': `${SITE_URL}/#software` },
      inLanguage: 'en',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#software`,
      name: 'Magnets',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: SITE_URL,
      description:
        'A lead magnet builder for landing pages, email capture, resource delivery, and follow-up email sequences.',
      provider: { '@id': `${SITE_URL}/#organization` },
      featureList: [
        'Lead magnet landing pages',
        'Email capture forms',
        'Instant resource delivery',
        'Follow-up email sequences',
        'Custom domains',
        'Beehiiv, Kit, Slack, Pipedrive, and Zapier integrations',
      ],
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    },
  ],
};

export default function HomePage() {
  return (
    <main className="overflow-hidden bg-brand-soft text-ink-950">
      <script
        dangerouslySetInnerHTML={{ __html: safeJsonLd(structuredData) }}
        type="application/ld+json"
      />
      <header className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
        <Link aria-label="Magnets home" href="/">
          <MagnetsLogo markClassName="h-9" />
        </Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-7 text-sm text-ink-600 md:flex">
          <a className="transition hover:text-ink-950" href="#how-it-works">How it works</a>
          <a className="transition hover:text-ink-950" href="#features">Features</a>
          <a className="transition hover:text-ink-950" href="#integrations">Integrations</a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle className="shrink-0" />
          <Link className="hidden h-10 items-center px-3 text-sm font-medium text-ink-700 transition hover:text-ink-950 sm:inline-flex" href="/login">
            Sign in
          </Link>
          <Link className="inline-flex h-10 items-center gap-2 rounded-md bg-ink-950 px-4 text-sm font-semibold text-white transition hover:bg-brand-orange hover:text-ink-950" href="/register">
            Start free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <section className="relative mx-auto max-w-7xl px-5 pb-20 pt-12 sm:px-8 sm:pt-20 lg:px-10 lg:pb-28">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-0 h-[29rem] vercel-dot-bg opacity-25" />
        <ScrollReveal className="relative z-10 mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-brand-orange" />
            Lead capture without the setup tax
          </div>
          <h1 className="mx-auto mt-7 max-w-4xl text-5xl font-semibold leading-[1.02] text-ink-950 sm:text-6xl lg:text-7xl">
            Build lead magnets that turn attention into conversations
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-ink-600 sm:text-xl">
            Create the page. Capture the email. Deliver the resource. Follow up while the problem is still top of mind.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-ink-950 px-5 text-base font-semibold text-white transition hover:bg-brand-orange hover:text-ink-950" href="/register">
              Build your first page <ArrowRight className="h-4 w-4" />
            </Link>
            <a className="inline-flex h-12 items-center justify-center rounded-md border border-ink-200 bg-white px-5 text-base font-semibold text-ink-800 transition hover:border-ink-300 hover:bg-ink-50" href="#how-it-works">
              See how it works
            </a>
          </div>
          <p className="mt-4 text-sm text-ink-500">No domain or sender setup required to start.</p>
        </ScrollReveal>

        <HeroDashboard />
      </section>

      <section className="border-y border-ink-200 bg-white" id="features">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <ScrollReveal>
              <p className="text-sm font-medium text-brand-coral">Built for what happens next</p>
              <h2 className="mt-4 text-4xl font-semibold leading-[1.08] sm:text-5xl">A lead magnet is only useful if it creates the next conversation.</h2>
              <p className="mt-5 max-w-md text-lg leading-8 text-ink-600">Magnets handles the boring handoff between interest and action, so you can focus on making an offer worth taking.</p>
            </ScrollReveal>
            <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
              {features.map(({ icon: Icon, title, description }, index) => (
                <ScrollReveal delay={index * 0.08} key={title}>
                  <div className="border-t border-ink-200 pt-5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-soft text-brand-coral">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-5 text-lg font-semibold text-ink-950">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-ink-600">{description}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-ink-950 py-20 text-white sm:py-28" id="how-it-works">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <ScrollReveal className="max-w-2xl">
            <p className="text-sm font-medium text-brand-orange">Simple by default</p>
            <h2 className="mt-4 text-4xl font-semibold leading-[1.08] sm:text-5xl">Three steps between your idea and a new lead.</h2>
          </ScrollReveal>
          <div className="mt-12 grid divide-y divide-white/15 border-y border-white/15 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {steps.map(([number, title, description], index) => (
              <ScrollReveal
                className={`min-w-0 py-8 sm:py-10 ${
                  index === 0
                    ? 'lg:pl-0 lg:pr-12'
                    : index === steps.length - 1
                      ? 'lg:pl-12 lg:pr-0'
                      : 'lg:px-12'
                }`}
                delay={index * 0.1}
                key={number}
              >
                <span className="font-mono text-sm text-brand-orange">{number}</span>
                <h3 className="mt-6 text-2xl font-semibold">{title}</h3>
                <p className="mt-3 max-w-xs text-sm leading-6 text-white/65">{description}</p>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-brand-soft py-20 sm:py-28" id="integrations">
        <div className="mx-auto grid max-w-7xl items-start gap-12 px-5 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 lg:px-10">
          <ScrollReveal>
            <p className="text-sm font-medium text-brand-coral">Use your stack when you need it</p>
            <h2 className="mt-4 max-w-xl text-4xl font-semibold leading-[1.08] sm:text-5xl">Start with a page. Add complexity only when it earns its place.</h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-ink-600">Get live on Magnets first. Add your domain, calendar, newsletter, Slack, or CRM only when it helps you close the loop.</p>
            <div className="mt-8 grid gap-3">
              {outcomes.map((outcome) => (
                <div key={outcome} className="flex gap-3 text-sm leading-6 text-ink-700">
                  <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange" />
                  <span>{outcome}</span>
                </div>
              ))}
            </div>
          </ScrollReveal>
          <ScrollReveal delay={0.12}>
            <div className="border border-ink-200 bg-white p-6 shadow-[0_24px_50px_-40px_rgba(17,17,17,0.35)] sm:p-8">
            <div className="flex items-center justify-between border-b border-ink-100 pb-5">
              <div>
                <p className="text-xs font-medium text-ink-500">One signup</p>
                <p className="mt-1 text-lg font-semibold">From page to pipeline</p>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-soft text-brand-coral"><Globe2 className="h-5 w-5" /></span>
            </div>
            <div className="mt-6 space-y-3">
              {['Magnets page', 'Instant delivery', 'Follow-up sequence', 'Beehiiv, Kit, Slack, Pipedrive, or Zapier'].map((item, index) => (
                <div key={item} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-950 text-xs font-bold text-white">{index + 1}</span>
                  <span className="text-sm font-medium text-ink-800">{item}</span>
                  {index < 3 && <span className="h-px flex-1 bg-ink-200" />}
                  {index === 3 && <Check className="ml-auto h-4 w-4 text-brand-orange" />}
                </div>
              ))}
            </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <section className="border-t border-ink-200 bg-white px-5 py-20 sm:px-8 sm:py-24 lg:px-10">
        <ScrollReveal className="mx-auto max-w-4xl">
          <p className="text-sm font-medium text-brand-coral">Before you start</p>
          <h2 className="mt-4 text-4xl font-semibold leading-[1.08] sm:text-5xl">The useful answers.</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {faqs.map((faq) => (
              <article className="border border-ink-200 bg-brand-soft p-5" key={faq.question}>
                <h3 className="text-base font-semibold text-ink-950">{faq.question}</h3>
                <p className="mt-3 text-sm leading-6 text-ink-600">{faq.answer}</p>
              </article>
            ))}
          </div>
        </ScrollReveal>
      </section>

      <section className="border-t border-ink-200 bg-white px-5 py-20 sm:px-8 sm:py-28 lg:px-10">
        <ScrollReveal className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <MagnetsLogoMark className="h-14 w-14" />
          <h2 className="mt-6 text-4xl font-semibold leading-[1.08] sm:text-5xl">Make the thing people are happy to give their email for</h2>
          <p className="mt-4 max-w-xl text-lg leading-8 text-ink-600">Build the page, share the link, and let Magnets handle the first response every time someone opts in.</p>
          <Link className="mt-8 inline-flex h-12 items-center gap-2 rounded-md bg-ink-950 px-5 text-base font-semibold text-white transition hover:bg-brand-orange hover:text-ink-950" href="/register">
            Start free <ArrowRight className="h-4 w-4" />
          </Link>
        </ScrollReveal>
      </section>

      <footer className="border-t border-ink-950 bg-ink-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <MagnetsLogo markClassName="h-7" variant="light" />
          <div className="flex flex-wrap items-center gap-5">
            <Link className="transition hover:text-white" href="/privacy">Privacy</Link>
            <Link className="transition hover:text-white" href="/terms">Terms</Link>
            <Link className="transition hover:text-white" href="/login">Sign in</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
