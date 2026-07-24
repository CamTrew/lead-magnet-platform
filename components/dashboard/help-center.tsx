'use client';

import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Compass,
  ExternalLink,
  FileCheck2,
  FolderOpen,
  Gift,
  Globe2,
  Lightbulb,
  ListChecks,
  Mail,
  MessageSquare,
  Newspaper,
  Palette,
  PanelTop,
  PlayCircle,
  Rocket,
  Search,
  Send,
  Settings,
  Sparkles,
  Users,
  Webhook,
  Workflow,
  X,
} from 'lucide-react';
import { WalkthroughVideo } from '@/components/walkthrough-video';
import {
  AB_TEST_MINIMUM_DAYS,
  AB_TEST_MINIMUM_VISITS_PER_VERSION,
} from '@/lib/limits';
import { PLATFORM_WALKTHROUGH_URL } from '@/lib/walkthrough';
import { cn } from '@/lib/utils';

export type HelpTopic =
  | 'what'
  | 'why'
  | 'how'
  | 'ideas'
  | 'start'
  | 'editor'
  | 'resources'
  | 'brand'
  | 'workspace'
  | 'domain'
  | 'email'
  | 'delivery'
  | 'sequence'
  | 'after'
  | 'legal'
  | 'newsletter'
  | 'kit'
  | 'slack'
  | 'zapier'
  | 'pipedrive'
  | 'calendar'
  | 'signups'
  | 'analytics'
  | 'account'
  | 'video';

export const OPEN_HELP_TOPIC_EVENT = 'magnets:open-help-topic';

const topicGroups: Array<{
  label: string;
  topics: Array<{
    id: HelpTopic;
    label: string;
    icon: typeof Compass;
    keywords: string;
  }>;
}> = [
  {
    label: 'Learn',
    topics: [
      { id: 'what', label: 'What is a lead magnet?', icon: BookOpen, keywords: 'definition basics' },
      { id: 'why', label: 'Why use a lead magnet?', icon: Gift, keywords: 'benefits leads subscribers' },
      { id: 'how', label: 'How do they work?', icon: ListChecks, keywords: 'signup delivery follow up' },
      { id: 'ideas', label: 'What works best', icon: Lightbulb, keywords: 'ideas checklist template guide quiz calculator' },
    ],
  },
  {
    label: 'Build',
    topics: [
      { id: 'start', label: 'Create your first lead magnet', icon: Compass, keywords: 'build publish page' },
      { id: 'editor', label: 'Edit and publish a magnet', icon: PanelTop, keywords: 'editor autosave preview publish qr copilot delete' },
      { id: 'resources', label: 'Hosted resources', icon: FolderOpen, keywords: 'upload file pdf download link private' },
      { id: 'brand', label: 'Brand colours and logo', icon: Palette, keywords: 'color colour theme appearance business name' },
      { id: 'delivery', label: 'Delivery emails', icon: Send, keywords: 'resource email subject body preview immediate link' },
      { id: 'sequence', label: 'Follow-up sequences', icon: Workflow, keywords: 'nurture delay emails automation stop booking' },
      { id: 'after', label: 'After-signup experience', icon: CalendarCheck, keywords: 'confirmation redirect page video quiz call to action' },
    ],
  },
  {
    label: 'Set up',
    topics: [
      { id: 'workspace', label: 'Workspace setup', icon: Settings, keywords: 'url setup address connections account' },
      { id: 'domain', label: 'Custom domains', icon: Globe2, keywords: 'dns cname txt url subdomain' },
      { id: 'email', label: 'Send from my email', icon: Mail, keywords: 'sender resend domain dkim spf dns from address' },
      { id: 'legal', label: 'Legal links', icon: BookOpen, keywords: 'privacy policy terms footer compliance url' },
    ],
  },
  {
    label: 'Connections',
    topics: [
      { id: 'newsletter', label: 'Beehiiv and Substack', icon: Newspaper, keywords: 'newsletter audience sync publication' },
      { id: 'kit', label: 'Connect Kit', icon: Mail, keywords: 'convertkit newsletter subscribers oauth tag' },
      { id: 'slack', label: 'Connect Slack', icon: MessageSquare, keywords: 'notification webhook channel' },
      { id: 'zapier', label: 'Connect Zapier', icon: Webhook, keywords: 'automation catch hook webhook' },
      { id: 'pipedrive', label: 'Connect Pipedrive', icon: BriefcaseBusiness, keywords: 'crm person contact api token' },
      { id: 'calendar', label: 'Connect a calendar', icon: CalendarCheck, keywords: 'calendly cal.com booking stop sequence' },
    ],
  },
  {
    label: 'Manage',
    topics: [
      { id: 'signups', label: 'Manage signups', icon: Users, keywords: 'leads csv import export sequence' },
      { id: 'analytics', label: 'Analytics and A/B tests', icon: BarChart3, keywords: 'visits conversion engagement results variants winner' },
      { id: 'account', label: 'Account settings', icon: Settings, keywords: 'name email password delete account security' },
      { id: 'video', label: 'Video walkthrough', icon: PlayCircle, keywords: 'watch tutorial demo' },
    ],
  },
];

function HomeTopicButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Compass;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="group flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white px-3.5 py-3 text-left text-sm font-medium leading-5 text-ink-700 transition hover:border-ink-300 hover:bg-ink-50 hover:text-ink-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
      onClick={onClick}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-600 transition group-hover:bg-brand-orange/10 group-hover:text-brand-orange">
          <Icon className="h-4 w-4" />
        </span>
        <span>{label}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-ink-700" />
    </button>
  );
}

function TopicGroupSection({
  className,
  group,
  onTopicClick,
  twoColumns = false,
}: {
  className?: string;
  group: (typeof topicGroups)[number];
  onTopicClick: (topic: HelpTopic) => void;
  twoColumns?: boolean;
}) {
  return (
    <section className={cn('rounded-2xl border border-ink-200 bg-ink-50 p-3.5 sm:p-4', className)}>
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
          {group.label}
        </h4>
        <span className="text-xs text-ink-400">
          {group.topics.length} {group.topics.length === 1 ? 'topic' : 'topics'}
        </span>
      </div>
      <div className={cn('grid gap-2', twoColumns && 'sm:grid-cols-2')}>
        {group.topics.map((topic) => (
          <HomeTopicButton
            icon={topic.icon}
            key={topic.id}
            label={topic.label}
            onClick={() => onTopicClick(topic.id)}
          />
        ))}
      </div>
    </section>
  );
}

function ArticleHeading({
  eyebrow,
  icon: Icon,
  title,
}: {
  eyebrow: string;
  icon: typeof Compass;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="help-topic-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-orange/10 text-brand-orange">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">{eyebrow}</p>
        <h3 className="text-lg font-semibold text-ink-950">{title}</h3>
      </div>
    </div>
  );
}

function ArticleLink({
  children,
  href,
  onClose,
}: {
  children: ReactNode;
  href: string;
  onClose: () => void;
}) {
  return (
    <Link
      className="mt-7 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-ink-950 px-4 text-sm font-semibold text-white transition hover:bg-ink-800"
      href={href}
      onClick={onClose}
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function Step({
  detail,
  number,
  title,
}: {
  detail: string;
  number: number;
  title: string;
}) {
  return (
    <li className="flex gap-4">
      <span className="help-step-number flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-950 text-xs font-semibold text-white">
        {number}
      </span>
      <div>
        <p className="text-sm font-semibold text-ink-950">{title}</p>
        <p className="mt-0.5 text-sm leading-6 text-ink-600">{detail}</p>
      </div>
    </li>
  );
}

function StartHere({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <div className="help-launch-card rounded-2xl border border-brand-orange/20 bg-[radial-gradient(circle_at_0%_0%,rgba(254,111,52,0.16),transparent_38%),linear-gradient(135deg,#fff,#faf9f7)] p-5 sm:p-6">
        <span className="help-launch-pill inline-flex items-center gap-1.5 rounded-full border border-brand-orange/20 bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-700">
          <Rocket className="h-3 w-3 text-brand-orange" />
          Your first launch
        </span>
        <h3 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-ink-950">
          Build a direct path from interest to your email list
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-600">
          Magnets builds the signup, delivery, and follow-up journey. You create the actual resource
          people receive, then add its download or access link to the Delivery email.
        </p>
      </div>

      <div className="mt-5 rounded-xl border border-brand-orange/20 bg-brand-orange/5 p-4">
        <p className="text-sm font-semibold text-ink-950">Create the resource before you publish</p>
        <p className="mt-1 text-sm leading-6 text-ink-600">
          Make the PDF, template, video, email course, AI tool, or other useful resource yourself.
          Magnets does not generate the finished resource for you. It gives that resource a page,
          captures the signup, emails the link, and manages what happens next.
        </p>
      </div>

      <ol className="mt-6 grid gap-5">
        <Step
          detail="Pick one small problem and make the PDF, template, video, course, tool, or other resource that solves it."
          number={1}
          title="Create the actual resource"
        />
        <Step
          detail="Upload a file under Hosted resources and copy its unique link, or use a public share link from wherever the resource is hosted."
          number={2}
          title="Get an accessible link"
        />
        <Step
          detail="Open the Delivery email tab and add a prominent linked button or line of text so subscribers can open or download the resource."
          number={3}
          title="Paste the link into the Delivery email"
        />
        <Step
          detail="Finish the Landing page, optional Sequence, and After signup tabs. Preview everything, publish the page, and share its public link."
          number={4}
          title="Complete and publish the journey"
        />
      </ol>

      <div className="mt-7 flex flex-col gap-2 border-t border-ink-200 pt-5 sm:flex-row">
        <Link
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-ink-950 px-4 text-sm font-semibold text-white transition hover:bg-ink-800"
          href="/dashboard/pages?new=1"
          onClick={onClose}
        >
          Create a lead magnet
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
          href="/dashboard?setup=custom-domain"
          onClick={onClose}
        >
          Set up a custom domain
        </Link>
      </div>
    </div>
  );
}

function EditorGuide({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <ArticleHeading eyebrow="Build the full journey" icon={PanelTop} title="How do I edit and publish a lead magnet?" />
      <p className="mt-5 text-sm leading-6 text-ink-600">
        Each lead magnet has one editor for the page people visit, the email that delivers the resource,
        any follow-up emails, and what happens after signup. Changes save automatically while you work.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {[
          ['Landing page', 'Write the promise, explain the value, add an image, and choose the details the form should collect.'],
          ['Delivery email', 'Set the subject, preview text, and message that sends the promised resource.'],
          ['Sequence', 'Add optional follow-up emails and choose the delay before each one.'],
          ['After signup', 'Show a confirmation, redirect to another URL, or create a custom next-step page.'],
        ].map(([title, detail]) => (
          <div className="rounded-xl border border-ink-200 bg-ink-50 p-4" key={title}>
            <p className="text-sm font-semibold text-ink-950">{title}</p>
            <p className="mt-1 text-sm leading-6 text-ink-600">{detail}</p>
          </div>
        ))}
      </div>
      <ol className="mt-8 grid gap-6">
        <Step detail="Use Preview to check the real page or email before sharing it." number={1} title="Preview the experience" />
        <Step detail="Use the writing copilot for copy ideas or revisions, then review the changes before applying them." number={2} title="Get help with the copy" />
        <Step detail="Change the status to Published when the page is ready. Draft pages are not available to visitors." number={3} title="Publish when ready" />
        <Step detail="Copy the public link or download its QR code from the page actions, then share it with your audience." number={4} title="Share the page" />
      </ol>
      <p className="mt-7 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
        Deleting a lead magnet removes its public page and cannot be undone. Signups already collected
        remain in your Signups area.
      </p>
      <ArticleLink href="/dashboard/pages" onClose={onClose}>Open Lead magnets</ArticleLink>
    </div>
  );
}

function WorkspaceSetupGuide({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <ArticleHeading eyebrow="Your account foundations" icon={Settings} title="What belongs in Workspace setup?" />
      <p className="mt-5 text-sm leading-6 text-ink-600">
        Workspace setup controls where your pages live, where emails come from, and which other tools
        receive new signups. You do not need to connect every option before creating a lead magnet.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {[
          ['Magnets URL', 'Choose the included magnets.so address used by your published pages.'],
          ['Custom domain', 'Optionally use a branded page address on a domain you own.'],
          ['Email and scheduling', 'Optionally use your own sender domain or stop a sequence when someone books.'],
          ['Connections', 'Optionally send signups to a newsletter, Slack, Zapier, Kit, or Pipedrive.'],
          ['Legal links', 'Add your privacy policy and terms to the footer of every public lead magnet page.'],
        ].map(([title, detail]) => (
          <div className="rounded-xl border border-ink-200 bg-ink-50 p-4" key={title}>
            <p className="text-sm font-semibold text-ink-950">{title}</p>
            <p className="mt-1 text-sm leading-6 text-ink-600">{detail}</p>
          </div>
        ))}
      </div>
      <p className="mt-7 rounded-xl border border-brand-orange/20 bg-brand-orange/5 p-4 text-sm leading-6 text-ink-600">
        Start with your Magnets URL. Add a custom domain and integrations only when they support the way
        you want to publish, deliver, or follow up.
      </p>
      <ArticleLink href="/dashboard" onClose={onClose}>Open Workspace setup</ArticleLink>
    </div>
  );
}

function WhatIsALeadMagnet() {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="help-topic-icon flex h-10 w-10 items-center justify-center rounded-xl bg-brand-orange/10 text-brand-orange">
          <Gift className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">The simple definition</p>
          <h3 className="text-lg font-semibold text-ink-950">What is a lead magnet?</h3>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-ink-600">
        A lead magnet is a useful resource or experience offered in exchange for contact information,
        usually an email address. It gives a potential customer a quick win around a problem you solve,
        and gives you a relevant reason to follow up with them.
      </p>
      <div className="mt-5 rounded-xl border border-ink-200 bg-ink-50 p-4">
        <p className="text-sm font-semibold text-ink-950">Think of it as a useful preview</p>
        <p className="mt-1 text-sm leading-6 text-ink-600">
          A bookkeeper might offer a month-end checklist. The checklist solves a real problem now,
          demonstrates how the bookkeeper can help, and creates a natural path to a future conversation
          about managing the reader&apos;s finances.
        </p>
      </div>
    </div>
  );
}

function WhyUseALeadMagnet() {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="help-topic-icon flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">Give value first</p>
          <h3 className="text-lg font-semibold text-ink-950">Why use a lead magnet?</h3>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-ink-600">
        Most people will not buy or book the first time they find you. A lead magnet asks for a much
        smaller commitment, so useful attention does not have to disappear when they leave the page.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {[
          ['Capture interest', 'Give someone a reason to join your audience before they are ready to buy.'],
          ['Attract better-fit leads', 'A focused resource appeals to people who already care about the problem you solve.'],
          ['Prove your expertise', 'A genuinely useful result lets people experience the quality of your thinking.'],
          ['Create an automatic next step', 'Deliver the resource immediately, then send relevant follow-up without doing it by hand.'],
        ].map(([title, detail]) => (
          <div className="rounded-lg border border-ink-200 bg-ink-50 p-3" key={title}>
            <CheckCircle2 className="help-check-icon h-4 w-4 text-emerald-600" />
            <p className="mt-2 text-sm font-semibold text-ink-950">{title}</p>
            <p className="mt-1 text-xs leading-5 text-ink-600">{detail}</p>
          </div>
        ))}
      </div>
      <p className="mt-5 text-sm leading-6 text-ink-600">
        The subject of the resource also tells you something useful about intent. Someone who requests a
        pricing template, for example, has shown you the problem they are trying to solve.
      </p>
    </div>
  );
}

function HowLeadMagnetsWork() {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="help-topic-icon flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
          <ListChecks className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">From visitor to subscriber</p>
          <h3 className="text-lg font-semibold text-ink-950">How do lead magnets work?</h3>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-ink-600">
        The resource, page, delivery, and follow-up work together as one simple flow.
      </p>
      <ol className="mt-8 grid gap-6">
        <Step detail="Create the actual PDF, template, video, course, tool, or other resource people will receive." number={1} title="Make the resource" />
        <Step detail="Give the resource an accessible link and paste that link into the Delivery email in Magnets." number={2} title="Add it to the journey" />
        <Step detail="Publish the page and share its link in the places your audience already pays attention." number={3} title="Promote the page" />
        <Step detail="A visitor sees the promise and enters their details to request the resource." number={4} title="They sign up" />
        <Step detail="Magnets emails the resource link immediately and records the signup for you." number={5} title="They get the promised value" />
        <Step detail="Relevant follow-up can help them use the resource, answer the next question, or introduce your offer." number={6} title="Continue the conversation" />
      </ol>
      <p className="mt-7 rounded-xl border border-ink-200 bg-ink-50 p-4 text-sm leading-6 text-ink-600">
        Publishing is only the start. Put the link in your website, social profiles, posts, newsletter,
        podcast notes, or anywhere else the right people already find you.
      </p>
    </div>
  );
}

function BestIdeas() {
  const ideas = [
    {
      title: 'Checklist',
      bestFor: 'A repeatable process with clear steps',
      example: 'The 12-point landing-page launch checklist',
    },
    {
      title: 'Template',
      bestFor: 'Saving someone time on a task they already do',
      example: 'A client onboarding email template pack',
    },
    {
      title: 'Short guide',
      bestFor: 'Explaining a narrow problem or decision',
      example: 'A practical guide to pricing your first workshop',
    },
    {
      title: 'Scorecard or quiz',
      bestFor: 'Helping someone understand their current position',
      example: 'How ready is your business to hire?',
    },
    {
      title: 'Swipe file',
      bestFor: 'Giving proven examples people can adapt',
      example: '25 welcome-email subject lines',
    },
    {
      title: 'Calculator',
      bestFor: 'Turning complicated inputs into a useful answer',
      example: 'Your freelance day-rate calculator',
    },
    {
      title: 'Interactive AI artefact',
      bestFor: 'Creating a useful personalised result from someone’s answers',
      example: 'A positioning statement or campaign brief generator',
    },
    {
      title: 'Five-day email course',
      bestFor: 'Teaching a practical process in small, useful daily steps',
      example: 'Build your first client referral system in five days',
    },
  ];

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="help-topic-icon flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">Quality beats size</p>
          <h3 className="text-lg font-semibold text-ink-950">What lead magnets work best?</h3>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-ink-600">
        There is no single format that wins for every audience. The strongest option is the one that
        solves one specific problem, is easy to use, and naturally connects to what you help people do
        next. A concise checklist can be more valuable than a long ebook if it gets someone to a result.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {ideas.map((idea) => (
          <article className="rounded-xl border border-ink-200 bg-white p-4" key={idea.title}>
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-brand-orange" />
              <h4 className="text-sm font-semibold text-ink-950">{idea.title}</h4>
            </div>
            <p className="mt-2 text-xs leading-5 text-ink-600">{idea.bestFor}</p>
            <p className="mt-2 rounded-md bg-ink-50 px-2.5 py-2 text-xs font-medium text-ink-700">
              Example: {idea.example}
            </p>
          </article>
        ))}
      </div>

      <div className="help-success-card mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-950">A strong idea should pass four checks</p>
        <ul className="mt-2 grid gap-1.5 text-sm leading-6 text-emerald-900 sm:grid-cols-2">
          <li>One clear audience and problem</li>
          <li>A specific, benefit-led title</li>
          <li>A result they can use quickly</li>
          <li>A natural link to your paid offer</li>
        </ul>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
          <p className="text-sm font-semibold text-ink-950">Make an AI artefact genuinely useful</p>
          <p className="mt-1 text-sm leading-6 text-ink-600">
            Ask only for the information needed to create a specific output. Give the visitor something
            they can use immediately, not a generic block of generated text.
          </p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
          <p className="text-sm font-semibold text-ink-950">Build trust before making the offer</p>
          <p className="mt-1 text-sm leading-6 text-ink-600">
            In a five-day course, deliver one clear win each day. On the final day, introduce a relevant
            paid next step that helps the reader continue the progress they have already made.
          </p>
        </div>
      </div>
    </div>
  );
}

function CustomDomainGuide({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="help-topic-icon flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
          <Globe2 className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">Optional setup</p>
          <h3 className="text-lg font-semibold text-ink-950">Use your own domain</h3>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-brand-orange/20 bg-brand-orange/5 p-4">
        <p className="text-sm font-semibold text-ink-950">You can skip this completely.</p>
        <p className="mt-1 text-sm leading-6 text-ink-600">
          Every published lead magnet can use its included magnets.so link. A custom domain gives you a
          recognisable branded address, but it is not required to create, publish, deliver, or collect
          signups.
        </p>
      </div>

      <ol className="mt-6 grid gap-5">
        <Step
          detail="Use the root domain you already own, such as example.com, then choose a page subdomain such as get."
          number={1}
          title="Choose your address"
        />
        <Step
          detail="Magnets gives you a TXT record. Add it wherever your DNS is managed, then click Check ownership."
          number={2}
          title="Prove you own the domain"
        />
        <Step
          detail="Add the CNAME record shown in Magnets and connect the subdomain. DNS changes can take a little while to appear."
          number={3}
          title="Point the subdomain to Magnets"
        />
      </ol>

      <div className="mt-7 border-t border-ink-200 pt-5">
        <Link
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-ink-950 px-4 text-sm font-semibold text-white transition hover:bg-ink-800"
          href="/dashboard?setup=custom-domain"
          onClick={onClose}
        >
          Open custom-domain setup
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function HostedResourcesGuide({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <ArticleHeading
        eyebrow="Files and downloads"
        icon={FolderOpen}
        title="How do I host a resource?"
      />
      <p className="mt-5 text-sm leading-6 text-ink-600">
        Hosted resources give you a stable download link for a PDF, image, ZIP file, or other supported
        resource. The file is private in storage. Only someone with its unique link can download it.
      </p>
      <ol className="mt-8 grid gap-6">
        <Step detail="Open Hosted resources from the sidebar and choose Upload resource." number={1} title="Upload the file" />
        <Step detail="Give it a clear name. This is the name shown in your resource library." number={2} title="Name the resource" />
        <Step detail="Copy its unique link, then paste it into the Delivery email for the lead magnet that should send it." number={3} title="Add it to the Delivery email" />
      </ol>
      <div className="mt-7 rounded-xl border border-ink-200 bg-ink-50 p-4">
        <p className="text-sm font-semibold text-ink-950">Deleting a resource revokes its link</p>
        <p className="mt-1 text-sm leading-6 text-ink-600">
          Anyone using the old link will lose access immediately, so update any lead magnets that still use it.
        </p>
      </div>
      <ArticleLink href="/dashboard/resources" onClose={onClose}>Open Hosted resources</ArticleLink>
    </div>
  );
}

function BrandGuide({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <ArticleHeading
        eyebrow="Page appearance"
        icon={Palette}
        title="How do I update my brand colours?"
      />
      <p className="mt-5 text-sm leading-6 text-ink-600">
        Brand settings apply to every public lead magnet and to the editor preview.
      </p>
      <ol className="mt-8 grid gap-6">
        <Step detail="Open Brand from the dashboard sidebar." number={1} title="Open your brand settings" />
        <Step detail="Add your business name, upload a logo, and choose the primary colour used across your pages." number={2} title="Set the identity and colour" />
        <Step detail="Choose light or dark page appearance and adjust the highlight intensity." number={3} title="Choose the page style" />
        <Step detail="Check the preview, then choose Save brand." number={4} title="Preview and save" />
      </ol>
      <ArticleLink href="/dashboard/brand" onClose={onClose}>Open Brand settings</ArticleLink>
    </div>
  );
}

function SenderEmailGuide({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <ArticleHeading
        eyebrow="Email delivery"
        icon={Mail}
        title="How do I send from my own email?"
      />
      <div className="mt-5 rounded-xl border border-brand-orange/20 bg-brand-orange/5 p-4">
        <p className="text-sm font-semibold text-ink-950">This is optional</p>
        <p className="mt-1 text-sm leading-6 text-ink-600">
          If Magnets sending is already connected, you can publish and deliver a resource without setting
          up your own sender domain. Using a recognisable From address can make the email feel more
          consistent with your brand.
        </p>
      </div>
      <ol className="mt-8 grid gap-6">
        <Step detail="In Workspace setup, add the root domain you own. You do not have to publish your pages on that domain." number={1} title="Add your domain" />
        <Step detail="Open Optional connections, then Your sender domain. Choose a sending subdomain and the address you want people to see." number={2} title="Choose the From address" />
        <Step detail="Add the exact DNS records shown by Magnets wherever your domain's DNS is managed." number={3} title="Add the sending records" />
        <Step detail="Return to Magnets and run the verification check. Use the address only after it shows as verified." number={4} title="Verify the sender" />
      </ol>
      <p className="mt-7 rounded-xl border border-ink-200 bg-ink-50 p-4 text-sm leading-6 text-ink-600">
        Magnets uses a sending subdomain so its email reputation is separated from your main website.
        Copy every DNS record exactly as shown. Verification is often quick, but DNS changes can take up
        to 72 hours to appear.
      </p>
      <ArticleLink href="/dashboard?connection=sender" onClose={onClose}>Open email setup</ArticleLink>
    </div>
  );
}

function DeliveryEmailGuide({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <ArticleHeading eyebrow="Deliver the promise" icon={Send} title="How do delivery emails work?" />
      <p className="mt-5 text-sm leading-6 text-ink-600">
        The delivery email is sent immediately after a successful signup. It should make the promised
        resource easy to find and remind the reader why it is useful.
      </p>
      <div className="mt-5 rounded-xl border border-brand-orange/20 bg-brand-orange/5 p-4">
        <p className="text-sm font-semibold text-ink-950">Bring your own resource link</p>
        <p className="mt-1 text-sm leading-6 text-ink-600">
          Create the resource yourself, then paste its full download or access link into this email.
          For files, you can upload the resource under Hosted resources and use the unique link Magnets
          gives you.
        </p>
      </div>
      <ol className="mt-8 grid gap-6">
        <Step detail="Open a lead magnet and choose the Delivery email tab." number={1} title="Open the email editor" />
        <Step detail="Write a clear subject and preview line so the reader recognises what they requested." number={2} title="Set the inbox details" />
        <Step detail="Add a short welcome and a prominent link to the promised file or resource." number={3} title="Make access obvious" />
        <Step detail="Use Preview to check the exact email before publishing the lead magnet." number={4} title="Preview before sending" />
      </ol>
      <div className="mt-7 rounded-xl border border-ink-200 bg-ink-50 p-4">
        <p className="text-sm font-semibold text-ink-950">Delivery content and sender setup are different</p>
        <p className="mt-1 text-sm leading-6 text-ink-600">
          The Delivery email tab controls what the email says. Your sender setup controls the From name
          and address. You can edit the email without connecting your own sender domain.
        </p>
      </div>
      <ArticleLink href="/dashboard/pages" onClose={onClose}>Open Lead magnets</ArticleLink>
    </div>
  );
}

function SequenceGuide({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <ArticleHeading eyebrow="Continue the conversation" icon={Workflow} title="How do follow-up sequences work?" />
      <p className="mt-5 text-sm leading-6 text-ink-600">
        A follow-up sequence is an optional set of emails sent after the resource. Use it to help someone
        apply what they downloaded, answer the next question, and introduce a relevant next step.
      </p>
      <ol className="mt-8 grid gap-6">
        <Step detail="Open the Sequence tab and enable the sequence. Sending must be ready on the account first." number={1} title="Turn on follow-up" />
        <Step detail="Add up to 10 emails. Give each one a focused subject, preview line, and message." number={2} title="Build the sequence" />
        <Step detail="Choose the delay before each email. The first delay starts at signup, and later delays start after the previous email." number={3} title="Set the timing" />
        <Step detail="If Calendly or Cal.com is connected, you can stop this magnet's sequence when the same email books a call." number={4} title="Stop when someone books" />
      </ol>
      <p className="mt-7 rounded-xl border border-ink-200 bg-ink-50 p-4 text-sm leading-6 text-ink-600">
        Keep the sequence connected to the resource they requested. Useful follow-up builds trust;
        unrelated promotion gives people a reason to unsubscribe.
      </p>
      <ArticleLink href="/dashboard/pages" onClose={onClose}>Open Lead magnets</ArticleLink>
    </div>
  );
}

function AfterSignupGuide({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <ArticleHeading eyebrow="Choose the next step" icon={CalendarCheck} title="What happens after someone signs up?" />
      <p className="mt-5 text-sm leading-6 text-ink-600">
        Use the After signup tab to decide what a visitor sees after the form succeeds. The resource
        email still sends separately.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          ['Standard confirmation', 'Show a simple message telling them to check their email.'],
          ['Send them elsewhere', 'Redirect immediately to a complete public URL.'],
          ['Custom next step', 'Show your own heading, message, video, button, or quiz.'],
        ].map(([title, detail]) => (
          <div className="rounded-xl border border-ink-200 bg-ink-50 p-4" key={title}>
            <p className="text-sm font-semibold text-ink-950">{title}</p>
            <p className="mt-1 text-sm leading-6 text-ink-600">{detail}</p>
          </div>
        ))}
      </div>
      <p className="mt-7 text-sm leading-6 text-ink-600">
        A custom page can keep momentum after the signup. Offer one clear next action, such as watching
        a short video, booking a call, or answering a few qualifying questions. Video plays and completed
        quizzes appear in Analytics when Magnets can tie them to the signup.
      </p>
      <ArticleLink href="/dashboard/pages" onClose={onClose}>Open Lead magnets</ArticleLink>
    </div>
  );
}

function LegalLinksGuide({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <ArticleHeading eyebrow="Public page footer" icon={BookOpen} title="How do I add legal links?" />
      <p className="mt-5 text-sm leading-6 text-ink-600">
        Add links to your own privacy policy and terms so visitors can understand how your business
        handles their information and the rules that apply to your offer.
      </p>
      <ol className="mt-8 grid gap-6">
        <Step detail="Open Workspace setup and expand Legal links." number={1} title="Open the legal settings" />
        <Step detail="Paste the full public URL for your privacy policy, beginning with https://." number={2} title="Add your privacy policy" />
        <Step detail="Add a full public URL for your terms if you use them." number={3} title="Add your terms" />
        <Step detail="Open a page preview and check both links. They open in a new tab from every public lead magnet footer." number={4} title="Check the public page" />
      </ol>
      <div className="mt-7 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-950">Magnets does not write these policies for you</p>
        <p className="mt-1 text-sm leading-6 text-amber-900">
          The right wording depends on your business, location, audience, and the services you use.
          Get appropriate legal advice if you are unsure what your policies need to cover. Leaving a
          field blank hides that custom link.
        </p>
      </div>
      <ArticleLink href="/dashboard?connection=legal" onClose={onClose}>Open Legal links</ArticleLink>
    </div>
  );
}

function NewsletterGuide({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <ArticleHeading
        eyebrow="Audience sync"
        icon={Newspaper}
        title="How do I connect Beehiiv or Substack?"
      />
      <p className="mt-5 text-sm leading-6 text-ink-600">
        Send new signups straight to the newsletter you already use, without exporting and importing a
        list by hand. Open Workspace setup, expand Optional connections, then open Newsletter under
        Audience sync.
      </p>
      <p className="mt-3 text-sm leading-6 text-ink-600">
        Every signup remains saved in Magnets. Make it clear on the signup page if requesting the resource
        also adds someone to your newsletter.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-ink-200 bg-ink-50 p-4">
          <h4 className="text-sm font-semibold text-ink-950">Beehiiv</h4>
          <ol className="mt-3 space-y-3 text-sm leading-6 text-ink-600">
            <li><strong className="text-ink-900">1.</strong> In Beehiiv, open Settings, Workspace Settings, then API.</li>
            <li><strong className="text-ink-900">2.</strong> Copy the API V2 publication ID for the publication you want.</li>
            <li><strong className="text-ink-900">3.</strong> Create an API key and copy it when shown. Beehiiv only shows the key once.</li>
            <li><strong className="text-ink-900">4.</strong> Paste both values into Magnets. They save when you leave each field.</li>
          </ol>
          <p className="mt-3 text-xs leading-5 text-ink-500">
            Beehiiv restricts API access to workspace owners and admins and may ask for identity verification.
          </p>
        </section>
        <section className="rounded-xl border border-ink-200 bg-ink-50 p-4">
          <h4 className="text-sm font-semibold text-ink-950">Substack</h4>
          <ol className="mt-3 space-y-3 text-sm leading-6 text-ink-600">
            <li><strong className="text-ink-900">1.</strong> Find your publication subdomain.</li>
            <li><strong className="text-ink-900">2.</strong> Enter only the first part, such as myletter.</li>
            <li><strong className="text-ink-900">3.</strong> Do not enter myletter.substack.com.</li>
          </ol>
        </section>
      </div>
      <p className="mt-5 text-xs leading-5 text-ink-500">
        Substack does not provide a documented public subscriber API for this connection. It uses
        Substack&apos;s public signup flow and may stop working if that flow changes.
      </p>
      <ArticleLink href="/dashboard?connection=newsletter" onClose={onClose}>Open newsletter connections</ArticleLink>
    </div>
  );
}

function KitGuide({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <ArticleHeading eyebrow="Audience sync" icon={Mail} title="How do I connect Kit?" />
      <p className="mt-5 text-sm leading-6 text-ink-600">
        Add each new signup to Kit automatically and tag them with the lead magnet they requested. Open
        Workspace setup, expand Optional connections, then open Kit under Automations.
      </p>
      <ol className="mt-8 grid gap-6">
        <Step detail="Choose Connect Kit. Magnets sends you to Kit's secure authorization screen." number={1} title="Start the connection" />
        <Step detail="Sign in to Kit if needed, choose the account, and approve access." number={2} title="Approve in Kit" />
        <Step detail="Return to Magnets and confirm that the connected account name is shown." number={3} title="Check the connection" />
      </ol>
      <p className="mt-7 rounded-xl border border-ink-200 bg-ink-50 p-4 text-sm leading-6 text-ink-600">
        New signups are added or updated by email and receive a tag identifying the lead magnet they requested.
      </p>
      <ArticleLink href="/dashboard?connection=kit" onClose={onClose}>Open Kit connection</ArticleLink>
    </div>
  );
}

function SlackGuide({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <ArticleHeading eyebrow="Signup notifications" icon={MessageSquare} title="How do I connect Slack?" />
      <p className="mt-5 text-sm leading-6 text-ink-600">
        Send a useful signup alert to the right channel so your team can see interest as it happens.
      </p>
      <ol className="mt-8 grid gap-6">
        <Step detail="Create a Slack app, turn on Incoming Webhooks, then choose Add New Webhook to Workspace." number={1} title="Create an incoming webhook" />
        <Step detail="Choose the channel, authorise the app, and copy the hooks.slack.com URL. Treat this URL like a password." number={2} title="Copy the webhook URL" />
        <Step detail="In Magnets, open Workspace setup, Optional connections, then Slack. Paste the URL into the webhook field." number={3} title="Paste it into Magnets" />
        <Step detail="Choose Send test and confirm the message arrives in the selected channel." number={4} title="Test the connection" />
      </ol>
      <p className="mt-7 rounded-xl border border-ink-200 bg-ink-50 p-4 text-sm leading-6 text-ink-600">
        Slack receives the signup name, email, lead magnet title, and public page link.
      </p>
      <ArticleLink href="/dashboard?connection=slack" onClose={onClose}>Open Slack connection</ArticleLink>
    </div>
  );
}

function ZapierGuide({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <ArticleHeading eyebrow="Automations" icon={Webhook} title="How do I connect Zapier?" />
      <p className="mt-5 text-sm leading-6 text-ink-600">
        Use each signup to start another workflow, such as adding a database row, creating a task, or
        notifying another tool.
      </p>
      <ol className="mt-8 grid gap-6">
        <Step detail="Create a Zap and choose Webhooks by Zapier as the trigger." number={1} title="Create the trigger" />
        <Step detail="Choose Catch Hook, open the Test tab, then copy the unique webhook URL." number={2} title="Copy the Catch Hook URL" />
        <Step detail="Open Workspace setup, Optional connections, then Zapier. Paste the URL into Magnets." number={3} title="Add it to Magnets" />
        <Step detail="Choose Send test in Magnets. Return to Zapier, choose Test trigger, then map the sample fields into your next action." number={4} title="Test and map the fields" />
      </ol>
      <ArticleLink href="/dashboard?connection=zapier" onClose={onClose}>Open Zapier connection</ArticleLink>
    </div>
  );
}

function PipedriveGuide({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <ArticleHeading eyebrow="CRM sync" icon={BriefcaseBusiness} title="How do I connect Pipedrive?" />
      <p className="mt-5 text-sm leading-6 text-ink-600">
        Keep new contacts in your CRM without entering the same name and email by hand.
      </p>
      <ol className="mt-8 grid gap-6">
        <Step detail="In Pipedrive, open Personal preferences, then API." number={1} title="Find your API token" />
        <Step detail="Copy the token. Treat it like a password and do not share it anywhere else." number={2} title="Copy the token safely" />
        <Step detail="In Magnets, open Workspace setup, Optional connections, then Pipedrive. Paste the token." number={3} title="Add it to Magnets" />
        <Step detail="Choose Test connection and wait for the connected confirmation." number={4} title="Test the connection" />
      </ol>
      <p className="mt-7 rounded-xl border border-ink-200 bg-ink-50 p-4 text-sm leading-6 text-ink-600">
        Each signup creates or updates a Pipedrive person. Existing people are matched by email.
      </p>
      <ArticleLink href="/dashboard?connection=pipedrive" onClose={onClose}>Open Pipedrive connection</ArticleLink>
    </div>
  );
}

function CalendarGuide({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <ArticleHeading eyebrow="Sequence controls" icon={CalendarCheck} title="How do I connect a calendar?" />
      <p className="mt-5 text-sm leading-6 text-ink-600">
        Stop sending sales follow-up after a lead has already booked. Magnets can stop an eligible
        sequence when the booking email matches the signup and that lead magnet has the option enabled.
        Your sender setup must be ready first.
      </p>
      <ol className="mt-8 grid gap-6">
        <Step detail="Open Workspace setup, Optional connections, then Calendar." number={1} title="Open Calendar settings" />
        <Step detail="For Calendly, create a personal access token under Integrations, API and Webhooks. For Cal.com, create an API key." number={2} title="Add the provider credential" />
        <Step detail="Connect the account. Calendly requires a paid plan that supports webhooks. Magnets configures the booking webhook for you." number={3} title="Finish the connection" />
        <Step detail="In each lead magnet's Sequence tab, turn on the option to stop the sequence when a booking is received." number={4} title="Enable it per lead magnet" />
      </ol>
      <ArticleLink href="/dashboard?connection=calendar" onClose={onClose}>Open Calendar connection</ArticleLink>
    </div>
  );
}

function SignupsGuide({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <ArticleHeading eyebrow="Lead management" icon={Users} title="How do I manage signups?" />
      <p className="mt-5 text-sm leading-6 text-ink-600">
        The Signups area contains everyone who has requested one of your lead magnets.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {[
          ['Review', 'See which lead magnet someone requested and the status of their follow-up sequence.'],
          ['Add or import', 'Add one person manually or import up to 5,000 rows from a CSV file.'],
          ['Export', 'Download the current signup list as a CSV file.'],
          ['Control follow-up', 'Start a missing sequence or stop an active sequence for an individual signup.'],
        ].map(([title, detail]) => (
          <div className="rounded-xl border border-ink-200 bg-ink-50 p-4" key={title}>
            <p className="text-sm font-semibold text-ink-950">{title}</p>
            <p className="mt-1 text-sm leading-6 text-ink-600">{detail}</p>
          </div>
        ))}
      </div>
      <ArticleLink href="/dashboard/signups" onClose={onClose}>Open Signups</ArticleLink>
    </div>
  );
}

function AnalyticsGuide({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <ArticleHeading eyebrow="Measure results" icon={BarChart3} title="How do analytics and A/B tests work?" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-ink-200 bg-ink-50 p-4">
          <h4 className="text-sm font-semibold text-ink-950">Analytics</h4>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            Open a lead magnet and choose Analytics to see visits, signups, conversion rate, engagement,
            and results from the after-signup experience.
          </p>
        </section>
        <section className="rounded-xl border border-ink-200 bg-ink-50 p-4">
          <h4 className="text-sm font-semibold text-ink-950">A/B testing</h4>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            Test a different title or image against the current page. Magnets splits new visitors between
            the versions and keeps each visitor on the same version.
          </p>
        </section>
      </div>
      <ol className="mt-8 grid gap-6">
        <Step detail="Open the landing-page editor and find Test title and image." number={1} title="Create a second version" />
        <Step detail="Change the title, image, or both, then start the test." number={2} title="Start the comparison" />
        <Step detail="Review each version's visits and conversion rate in Analytics." number={3} title="Watch the results" />
        <Step
          detail={`After ${AB_TEST_MINIMUM_DAYS} days, once every version has at least ${AB_TEST_MINIMUM_VISITS_PER_VERSION} visitors, Magnets selects by conversion rate and applies the winner automatically.`}
          number={4}
          title="Use the winner"
        />
      </ol>
      <ArticleLink href="/dashboard/pages" onClose={onClose}>Open Lead magnets</ArticleLink>
    </div>
  );
}

function AccountGuide({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <ArticleHeading eyebrow="Identity and security" icon={Settings} title="What can I change in Account settings?" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {[
          ['Your name', 'Update the name shown on your Magnets account. Your sign-in email is read-only here.'],
          ['Password', 'Confirm your current password, then choose a different password with at least 8 characters.'],
        ].map(([title, detail]) => (
          <div className="rounded-xl border border-ink-200 bg-ink-50 p-4" key={title}>
            <p className="text-sm font-semibold text-ink-950">{title}</p>
            <p className="mt-1 text-sm leading-6 text-ink-600">{detail}</p>
          </div>
        ))}
      </div>
      <div className="mt-7 rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-800">Account deletion is permanent</p>
        <p className="mt-1 text-sm leading-6 text-red-700">
          Deleting the account removes its lead magnets, signups, integrations, and attached custom
          domains. There is no recovery. Magnets asks for your password and the word DELETE before it
          can continue.
        </p>
      </div>
      <ArticleLink href="/dashboard/account" onClose={onClose}>Open Account settings</ArticleLink>
    </div>
  );
}

function VideoGuide() {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">Watch the full flow</p>
          <h3 className="text-lg font-semibold text-ink-950">Platform walkthrough</h3>
        </div>
        <a
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 transition hover:text-ink-950"
          href={PLATFORM_WALKTHROUGH_URL}
          rel="noreferrer"
          target="_blank"
        >
          Open in Loom
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      <WalkthroughVideo className="mt-4 rounded-xl" />
    </div>
  );
}

export function HelpCenterModal({
  initialTopic = null,
  open,
  onClose,
}: {
  initialTopic?: HelpTopic | null;
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const contentScrollerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [activeTopic, setActiveTopic] = useState<HelpTopic | null>(initialTopic);
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const activeTopicInfo = topicGroups
    .flatMap((group) => group.topics.map((topic) => ({ ...topic, group: group.label })))
    .find((topic) => topic.id === activeTopic);
  const visibleTopicGroups = topicGroups
    .map((group) => ({
      ...group,
      topics: group.topics.filter((topic) =>
        !normalizedQuery ||
        `${topic.label} ${topic.keywords}`.toLowerCase().includes(normalizedQuery)
      ),
    }))
    .filter((group) => group.topics.length > 0);
  const learnGroup = topicGroups.find((group) => group.label === 'Learn')!;
  const buildGroup = topicGroups.find((group) => group.label === 'Build')!;
  const setupGroup = topicGroups.find((group) => group.label === 'Set up')!;
  const connectionsGroup = topicGroups.find((group) => group.label === 'Connections')!;
  const manageGroup = topicGroups.find((group) => group.label === 'Manage')!;

  function openTopic(topic: HelpTopic) {
    contentScrollerRef.current?.scrollTo({ top: 0 });
    setActiveTopic(topic);
    setSearchQuery('');
  }

  useLayoutEffect(() => {
    if (!open) return;
    setActiveTopic(initialTopic);
    setSearchQuery('');
  }, [initialTopic, open]);

  useEffect(() => {
    if (!open) {
      setActiveTopic(null);
      setSearchQuery('');
      return;
    }

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [onClose, open]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="app-theme help-centre fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
        >
          <motion.button
            aria-label="Close help centre"
            className="absolute inset-0 cursor-default bg-ink-950/60 backdrop-blur-sm"
            onClick={onClose}
            type="button"
          />
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-labelledby={titleId}
            aria-modal="true"
            className="relative z-10 flex h-[calc(100dvh-1.5rem)] max-h-[820px] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[0_32px_100px_-24px_rgba(0,0,0,0.55)] outline-none sm:h-[calc(100dvh-3rem)]"
            exit={{ opacity: 0, scale: 0.98, y: 12 }}
            initial={{ opacity: 0, scale: 0.98, y: 18 }}
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center justify-between gap-4 border-b border-ink-200 px-4 py-3.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="help-centre-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-orange text-ink-950">
                  <ListChecks className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-ink-950" id={titleId}>Help centre</h2>
                  <p className="text-xs text-ink-500">Learn the basics or find your next step.</p>
                </div>
              </div>
              <button
                aria-label="Close help centre"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-500 transition hover:bg-ink-100 hover:text-ink-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                onClick={onClose}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative min-h-0 flex-1 overflow-y-auto" ref={contentScrollerRef}>
              <AnimatePresence initial={false} mode="popLayout">
                {activeTopic === null ? (
                  <motion.div
                    animate={{ opacity: 1, x: 0 }}
                    className="min-h-full w-full"
                    exit={{ opacity: 0, x: -24 }}
                    initial={{ opacity: 0, x: -24 }}
                    key="help-library"
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="mx-auto max-w-4xl p-5 sm:p-7 md:p-8">
                      <div className="max-w-2xl">
                        <h3 className="text-xl font-semibold tracking-tight text-ink-950 sm:text-2xl">
                          What do you need help with?
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-ink-600">
                          Choose a topic for a clear answer and the exact steps to follow.
                        </p>
                      </div>

                      <label className="relative mt-6 block">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                        <input
                          aria-label="Search help"
                          autoComplete="off"
                          className="h-12 w-full rounded-xl border border-ink-200 bg-white pl-11 pr-4 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15"
                          onChange={(event) => setSearchQuery(event.target.value)}
                          placeholder="Search topics, integrations, or setup"
                          type="search"
                          value={searchQuery}
                        />
                      </label>

                      {visibleTopicGroups.length > 0 ? (
                        <nav aria-label="Help topics" className="mt-7">
                          {!normalizedQuery ? (
                            <>
                              <div className="grid items-start gap-4 lg:grid-cols-2">
                                <TopicGroupSection
                                  className="lg:col-start-1 lg:row-start-1"
                                  group={learnGroup}
                                  onTopicClick={openTopic}
                                />
                                <TopicGroupSection
                                  className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
                                  group={buildGroup}
                                  onTopicClick={openTopic}
                                />
                                <TopicGroupSection
                                  className="lg:col-start-1 lg:row-start-2"
                                  group={setupGroup}
                                  onTopicClick={openTopic}
                                />
                              </div>
                              <TopicGroupSection
                                className="mt-4"
                                group={connectionsGroup}
                                onTopicClick={openTopic}
                                twoColumns
                              />
                              <TopicGroupSection
                                className="mt-4"
                                group={manageGroup}
                                onTopicClick={openTopic}
                                twoColumns
                              />
                            </>
                          ) : (
                            <div className="grid items-start gap-4 lg:grid-cols-2">
                              {visibleTopicGroups.map((group) => (
                                <TopicGroupSection
                                  className={cn(group.label === 'Connections' && 'lg:col-span-2')}
                                  group={group}
                                  key={group.label}
                                  onTopicClick={openTopic}
                                  twoColumns={group.label === 'Connections'}
                                />
                              ))}
                            </div>
                          )}
                        </nav>
                      ) : (
                        <div className="mt-7 rounded-2xl border border-dashed border-ink-300 bg-ink-50 px-5 py-10 text-center">
                          <Search className="mx-auto h-5 w-5 text-ink-400" />
                          <p className="mt-3 text-sm font-medium text-ink-800">No matching help topics</p>
                          <p className="mt-1 text-sm text-ink-500">Try a shorter or more general search.</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    animate={{ opacity: 1, x: 0 }}
                    className="min-h-full w-full"
                    exit={{ opacity: 0, x: 24 }}
                    initial={{ opacity: 0, x: 24 }}
                    key={activeTopic}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="sticky top-0 z-10 border-b border-ink-200 bg-white px-5 py-3 sm:px-7">
                      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
                        <button
                          className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-ink-700 transition hover:bg-ink-100 hover:text-ink-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                          onClick={() => {
                            contentScrollerRef.current?.scrollTo({ top: 0 });
                            setActiveTopic(null);
                          }}
                          type="button"
                        >
                          <ArrowLeft className="h-4 w-4" />
                          All help topics
                        </button>
                        <p className="hidden text-xs font-semibold uppercase tracking-[0.12em] text-ink-400 sm:block">
                          {activeTopicInfo?.group}
                        </p>
                      </div>
                    </div>
                    <div className="mx-auto max-w-3xl p-5 pb-10 sm:p-7 sm:pb-12 md:p-9 md:pb-14">
                      {activeTopic === 'what' && <WhatIsALeadMagnet />}
                      {activeTopic === 'why' && <WhyUseALeadMagnet />}
                      {activeTopic === 'how' && <HowLeadMagnetsWork />}
                      {activeTopic === 'ideas' && <BestIdeas />}
                      {activeTopic === 'start' && <StartHere onClose={onClose} />}
                      {activeTopic === 'editor' && <EditorGuide onClose={onClose} />}
                      {activeTopic === 'resources' && <HostedResourcesGuide onClose={onClose} />}
                      {activeTopic === 'brand' && <BrandGuide onClose={onClose} />}
                      {activeTopic === 'workspace' && <WorkspaceSetupGuide onClose={onClose} />}
                      {activeTopic === 'domain' && <CustomDomainGuide onClose={onClose} />}
                      {activeTopic === 'email' && <SenderEmailGuide onClose={onClose} />}
                      {activeTopic === 'delivery' && <DeliveryEmailGuide onClose={onClose} />}
                      {activeTopic === 'sequence' && <SequenceGuide onClose={onClose} />}
                      {activeTopic === 'after' && <AfterSignupGuide onClose={onClose} />}
                      {activeTopic === 'legal' && <LegalLinksGuide onClose={onClose} />}
                      {activeTopic === 'newsletter' && <NewsletterGuide onClose={onClose} />}
                      {activeTopic === 'kit' && <KitGuide onClose={onClose} />}
                      {activeTopic === 'slack' && <SlackGuide onClose={onClose} />}
                      {activeTopic === 'zapier' && <ZapierGuide onClose={onClose} />}
                      {activeTopic === 'pipedrive' && <PipedriveGuide onClose={onClose} />}
                      {activeTopic === 'calendar' && <CalendarGuide onClose={onClose} />}
                      {activeTopic === 'signups' && <SignupsGuide onClose={onClose} />}
                      {activeTopic === 'analytics' && <AnalyticsGuide onClose={onClose} />}
                      {activeTopic === 'account' && <AccountGuide onClose={onClose} />}
                      {activeTopic === 'video' && <VideoGuide />}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
