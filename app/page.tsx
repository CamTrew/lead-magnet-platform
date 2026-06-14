import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  FileText,
  Globe2,
  Mail,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { MagnetsLogoMark } from '@/components/magnets-logo-mark';
import { findAccountByAttachedHost } from '@/lib/platform-store';

export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so';

export const metadata: Metadata = {
  title: 'Free lead-magnet pages on your own domain',
  description:
    'Build branded lead-magnet landing pages, deliver the resource by email, collect signups. Free forever. Bring your own Resend, Beehiiv, or Substack keys.',
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: 'Magnets. free lead-magnet pages on your own domain',
    description:
      'Build branded lead-magnet landing pages, deliver the resource by email, and collect signups. Free forever. Bring your own keys.',
    url: SITE_URL,
    type: 'website',
  },
};

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Magnets',
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
  sameAs: [] as string[],
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Magnets',
  url: SITE_URL,
  description:
    'Free, forever lead-magnet platform. Build branded capture pages on your own domain with your own keys.',
};

const softwareJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Magnets',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  description:
    'Build branded lead-magnet landing pages, deliver the resource by email, and collect signups. Free forever.',
};

const features = [
  {
    icon: FileText,
    title: 'A page for every resource',
    copy: 'Branded capture pages for a guide, checklist, report, webinar, or private download. No code.',
  },
  {
    icon: Globe2,
    title: 'Your domain, your brand',
    copy: 'Publish at get.yourdomain.com. We hand you the DNS records and verify them for you.',
  },
  {
    icon: Mail,
    title: 'Your sender, your list',
    copy: 'Send through your own Resend key. Forward signups to Beehiiv or Substack. your call.',
  },
];

const checklist = [
  'Free forever. no card, no clock',
  'Bring your own keys, keep your data',
  'Custom domains and DKIM out of the box',
  'Leave any time you want, take everything with you',
];

const steps = [
  { title: 'Sign up', copy: 'Email, name, password. Thirty seconds, no card.' },
  { title: 'Bring your keys', copy: 'Paste a Resend key. Add Beehiiv or Substack if you want.' },
  { title: 'Point a subdomain', copy: 'Copy the CNAME, paste into DNS. We verify it for you.' },
  { title: 'Ship the magnet', copy: 'Write the page, preview the email, hit publish.' },
];

export default async function HomePage() {
  // When a visitor hits / on a customer's attached host (e.g. get.headcount.so)
  // we don't want to serve the Magnets marketing page — that's confusing.
  // Bounce them to the customer's apex.
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') || '';
  const cleanHost = host.split(':')[0].toLowerCase();
  // Only do the lookup if the host isn't our own platform domain or a local dev host.
  const isPlatformHost =
    cleanHost === 'magnets.so' ||
    cleanHost === 'www.magnets.so' ||
    cleanHost === 'localhost' ||
    cleanHost.startsWith('127.') ||
    cleanHost.endsWith('.vercel.app');
  if (cleanHost && !isPlatformHost) {
    const owner = await findAccountByAttachedHost(cleanHost);
    if (owner?.domain) {
      const protocol = cleanHost.startsWith('localhost') ? 'http' : 'https';
      redirect(`${protocol}://${owner.domain}`);
    }
  }

  return (
    <main className="min-h-screen bg-white text-ink-900">
      <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2" aria-label="Magnets home">
            <MagnetsLogoMark className="h-7 w-7" iconClassName="h-4 w-4" />
            <span className="text-sm font-semibold tracking-tight">Magnets</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-ink-600 sm:flex">
            <Link href="#features" className="hover:text-ink-900">Features</Link>
            <Link href="#integrations" className="hover:text-ink-900">Integrations</Link>
            <Link href="#setup" className="hover:text-ink-900">Setup</Link>
            <a href="/privacy" className="hover:text-ink-900" target="_blank" rel="noreferrer">Privacy</a>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden h-8 items-center rounded-md px-3 text-sm font-medium text-ink-600 transition hover:bg-ink-100 hover:text-ink-900 sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex h-8 items-center rounded-md bg-ink-950 px-3 text-sm font-medium text-white transition hover:bg-ink-800"
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-ink-200 bg-white">
        <div className="vercel-grid-bg absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-medium text-ink-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Free forever, no catch
            </div>
            <h1 className="text-balance text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl lg:text-6xl">
              Lead magnets, given away for free.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-balance text-base leading-7 text-ink-600 sm:text-lg">
              Lead-magnet software has been gatekept behind $99 plans for too long. Build the page, deliver the resource, collect the email. on your own domain, with your own keys. We don&apos;t charge you. We don&apos;t hold your list.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-2">
              <Link
                href="/register"
                className="inline-flex h-10 items-center gap-2 rounded-md bg-ink-950 px-4 text-sm font-medium text-white transition hover:bg-ink-800"
              >
                Get it free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#features"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-ink-200 bg-white px-4 text-sm font-medium text-ink-900 transition hover:bg-ink-50"
              >
                See how it works
              </Link>
            </div>

            <ul className="mx-auto mt-10 grid max-w-2xl gap-2 text-sm text-ink-600 sm:grid-cols-2">
              {checklist.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200 bg-white px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div className="max-w-3xl">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Why it is free</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink-950 sm:text-3xl">
                Power to the people, not to the SaaS bill.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-600">
                Magnets is the Robin Hood of lead-magnet tools. The expensive bits. the email send, the newsletter integration, the domain. are services you can already use cheaply or for free elsewhere. So we let you bring those yourself and we charge nothing on top.
              </p>
            </div>
            <Link
              href="/register"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-ink-200 bg-white px-4 text-sm font-medium text-ink-900 transition hover:bg-ink-50"
            >
              Take it for free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section id="features" className="border-b border-ink-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">What you get</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl">
              The essentials, without the markup.
            </h2>
            <p className="mt-3 text-sm leading-6 text-ink-600">
              Setup lives in your workspace once, not in every page. Configure brand and delivery, then ship.
            </p>
          </div>

          <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-ink-200 bg-ink-200 md:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="bg-white p-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-ink-200 bg-ink-50 text-ink-900">
                  <feature.icon className="h-4 w-4" />
                </div>
                <h3 className="mt-5 text-base font-semibold text-ink-950">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-600">{feature.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="integrations" className="border-b border-ink-200 bg-ink-50 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Integrations</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl">
              Bring your own tools.
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-ink-600">
              Magnets doesn&apos;t resell your sender or your newsletter. You sign up for the ones you want (most have generous free tiers) and paste the key into the dashboard. We just pass the signup through.
            </p>
          </div>

          <div className="grid gap-px overflow-hidden rounded-lg border border-ink-200 bg-ink-200 sm:grid-cols-2">
            <div className="bg-white p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Sending</p>
              <h3 className="mt-1 text-base font-semibold text-ink-950">Resend</h3>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                Free up to a few thousand emails a month. Verified on your own sending domain so it lands in the inbox.
              </p>
            </div>
            <div className="bg-white p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Newsletter (optional)</p>
              <h3 className="mt-1 text-base font-semibold text-ink-950">Beehiiv</h3>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                Forward signups into your Beehiiv publication with your own API key. We never see your subscriber list.
              </p>
            </div>
            <div className="bg-white p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Newsletter (optional)</p>
              <h3 className="mt-1 text-base font-semibold text-ink-950">Substack</h3>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                Drop in your Substack subdomain and we add every signup as a free subscriber.
              </p>
            </div>
            <div className="bg-white p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Always included</p>
              <h3 className="mt-1 text-base font-semibold text-ink-950">Your own signup list</h3>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                Every signup is saved here too, deduplicated, exportable to CSV. Use it however you like.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="setup" className="border-b border-ink-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Setup</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl">
              Five minutes, then you keep shipping.
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-ink-600">
              Brand, delivery, and DNS are configured once per account. After that every new magnet is just copy and a download link.
            </p>
          </div>

          <ol className="grid gap-px overflow-hidden rounded-lg border border-ink-200 bg-ink-200 sm:grid-cols-2">
            {steps.map((step, index) => (
              <li key={step.title} className="bg-white p-5">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-ink-950 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <p className="mt-4 text-base font-semibold text-ink-950">{step.title}</p>
                <p className="mt-1.5 text-sm leading-6 text-ink-600">{step.copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 rounded-lg border border-ink-200 bg-ink-50 p-8 lg:flex-row lg:items-center lg:justify-between lg:p-10">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-900">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-ink-950 sm:text-3xl">
              No card. No clock. No catch.
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              The whole product is free. Pages, signup list, CSV export, custom domains. If we ever charge for anything, it will be obvious and optional. and the free tier will keep doing what it does today.
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs text-ink-500">
              <Users className="h-4 w-4" />
              For indie creators, solo founders, and anyone tired of paying $99/month for a download button.
            </div>
          </div>
          <Link
            href="/register"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-ink-950 px-4 text-sm font-medium text-white transition hover:bg-ink-800 lg:shrink-0"
          >
            Get yours free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-ink-200 bg-white px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="flex items-center gap-2" aria-label="Magnets home">
            <MagnetsLogoMark className="h-7 w-7" iconClassName="h-4 w-4" />
            <div>
              <p className="text-sm font-semibold text-ink-900">Magnets</p>
              <p className="text-xs text-ink-500">Free, forever.</p>
            </div>
          </Link>
          <div className="flex flex-wrap gap-4 text-sm text-ink-600">
            <Link href="#features" className="hover:text-ink-900">Features</Link>
            <Link href="#integrations" className="hover:text-ink-900">Integrations</Link>
            <Link href="#setup" className="hover:text-ink-900">Setup</Link>
            <a href="/privacy" className="hover:text-ink-900" target="_blank" rel="noreferrer">Privacy</a>
            <a href="/terms" className="hover:text-ink-900" target="_blank" rel="noreferrer">Terms</a>
            <Link href="/login" className="hover:text-ink-900">Sign in</Link>
          </div>
          <p className="text-sm text-ink-500">© {new Date().getFullYear()} Magnets</p>
        </div>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
    </main>
  );
}
