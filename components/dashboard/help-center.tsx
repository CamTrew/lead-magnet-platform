'use client';

import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SAVED_LEAD_MAGNET_PROMPT } from '@/lib/assistant-provider';
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
  | 'connect'
  | 'chat'
  | 'troubleshoot'
  | 'manual'
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
    label: 'Start with your assistant',
    topics: [
      { id: 'start', label: 'From your idea to a live page', icon: Compass, keywords: 'first create chatgpt claude onboarding publish saved idea' },
      { id: 'connect', label: 'Connect ChatGPT or Claude', icon: MessageSquare, keywords: 'mcp plugin connector oauth setup reconnect mobile' },
      { id: 'chat', label: 'Create and edit in chat', icon: Sparkles, keywords: 'prompt update file pdf image upload follow up email resource' },
      { id: 'troubleshoot', label: 'Stuck? Find your next step', icon: Lightbulb, keywords: 'missing connection failed draft publish not showing limit mobile' },
    ],
  },
  {
    label: 'Your content',
    topics: [
      { id: 'manual', label: 'Create manually instead', icon: PanelTop, keywords: 'without assistant own resource new page upload' },
      { id: 'editor', label: 'Edit and publish a magnet', icon: PanelTop, keywords: 'editor autosave preview publish qr copilot delete' },
      { id: 'resources', label: 'Hosted resources', icon: FolderOpen, keywords: 'upload file pdf download link private' },
      { id: 'brand', label: 'Brand colours and logo', icon: Palette, keywords: 'color colour theme appearance business name website import logo' },
      { id: 'delivery', label: 'Delivery emails', icon: Send, keywords: 'resource email subject body preview immediate link' },
      { id: 'sequence', label: 'Follow-up sequences', icon: Workflow, keywords: 'nurture delay emails automation stop booking' },
      { id: 'after', label: 'After-signup experience', icon: CalendarCheck, keywords: 'confirmation redirect page video quiz call to action' },
    ],
  },
  {
    label: 'Your audience and results',
    topics: [
      { id: 'signups', label: 'Manage signups', icon: Users, keywords: 'leads csv import export sequence' },
      { id: 'analytics', label: 'Analytics and A/B tests', icon: BarChart3, keywords: 'visits conversion engagement results variants winner' },
      { id: 'account', label: 'Account settings', icon: Settings, keywords: 'name email password delete account security' },
      { id: 'video', label: 'Video walkthrough', icon: PlayCircle, keywords: 'watch tutorial demo' },
    ],
  },
  {
    label: 'Optional setup',
    topics: [
      { id: 'workspace', label: 'Customise', icon: Settings, keywords: 'url setup address connections account' },
      { id: 'domain', label: 'Custom domains', icon: Globe2, keywords: 'dns cname txt url subdomain' },
      { id: 'email', label: 'Send from my email', icon: Mail, keywords: 'sender resend domain dkim spf dns from address' },
      { id: 'legal', label: 'Legal links', icon: BookOpen, keywords: 'privacy policy terms footer compliance url' },
    ],
  },
  {
    label: 'Optional integrations',
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
    label: 'The basics',
    topics: [
      { id: 'what', label: 'What is a lead magnet?', icon: BookOpen, keywords: 'definition basics' },
      { id: 'why', label: 'Why use a lead magnet?', icon: Gift, keywords: 'benefits leads subscribers' },
      { id: 'how', label: 'How do they work?', icon: ListChecks, keywords: 'signup delivery follow up' },
      { id: 'ideas', label: 'What works best', icon: Lightbulb, keywords: 'ideas checklist template guide quiz calculator' },
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
  return <div>
    <ArticleHeading eyebrow="The recommended way" icon={Rocket} title="Create in chat. Manage it in Magnets." />
    <p className="mt-5 text-sm leading-6 text-ink-600">Start with an idea. Your connected assistant creates the resource, signup page, delivery email. Magnets hosts the result and collects your signups.</p>
    <ol className="mt-6 grid gap-5">
      <Step number={1} title="Save your idea and brand" detail="Describe who it is for and what it helps them do. Choose your Magnets address. Import your website, review the suggested name, logo and colours, then apply the details you want." />
      <Step number={2} title="Connect your assistant once" detail="Choose ChatGPT or Claude and follow the visual connection guide. Approve access to your Magnets account, then check that the connection is complete." />
      <Step number={3} title="Ask it to create your saved idea" detail={`In a new ChatGPT chat, type @ and select Magnets. In Claude, enable Magnets for the chat. Send “${SAVED_LEAD_MAGNET_PROMPT}” and press Enter. This asks for a new document, so your assistant skips the existing-resource question. Prefer an existing file? Ask it to use that file instead. Choose delivery only or follow-up emails too before publishing.`} />
      <Step number={4} title="Open your finished lead magnet" detail="The assistant saves everything in Magnets and publishes the completed page automatically. If publishing is blocked, it stays a draft and the assistant explains what needs fixing. Follow its live-page or edit link." />
      <Step number={5} title="Share it and see who signs up" detail="Share the live signup page, not the resource download link. Open Lead magnets to edit, Hosted resources for the download, and Signups to see your audience or export a CSV." />
    </ol>
    <p className="mt-6 rounded-xl border border-ink-200 bg-ink-50 p-4 text-sm leading-6 text-ink-600">Already set up? Start from Home. Choose “Explain this page” on Home whenever you want a quick tour.</p>
    <ArticleLink href="/create?new=1" onClose={onClose}>Start with my idea</ArticleLink>
  </div>;
}

function ConnectGuide({ onClose }: { onClose: () => void }) {
  return <div>
    <ArticleHeading eyebrow="One-time setup" icon={MessageSquare} title="Connect ChatGPT or Claude" />
    <p className="mt-5 text-sm leading-6 text-ink-600">The connection lets your assistant save and manage work in your Magnets account. You stay in your own ChatGPT or Claude chat to create.</p>
    <ol className="mt-6 grid gap-5">
      <Step number={1} title="Open the visual guide" detail="Go to Home and choose ‘Connect ChatGPT or Claude’. Pick your assistant. The guide shows the setup screens and gives you the connection link to copy." />
      <Step number={2} title="Add Magnets in your assistant" detail="Follow the guide in your assistant’s browser tab. Name the connection Magnets, paste the supplied server URL and use the sign-in option shown. Pasting the URL into an ordinary chat does not connect it." />
      <Step number={3} title="Approve and check" detail="Sign in to Magnets if asked and approve the connection. Finish any remaining installation step in your assistant. Return to the guide and choose ‘Check connection’." />
      <Step number={4} title="Select Magnets in a new chat" detail="In ChatGPT, type @ and select Magnets from the menu. In Claude, enable the Magnets connector. Paste your request and press Enter. Merely typing the name does not enable the connection." />
    </ol>
    <p className="mt-6 rounded-xl border border-ink-200 bg-ink-50 p-4 text-sm leading-6 text-ink-600">Custom connections depend on your assistant’s plan and workspace settings. If the option is missing on your phone, try the assistant’s desktop website. You can still create manually in Magnets. Older creation-only connections need to reconnect through this guide for workspace access.</p>
    <ArticleLink href="/dashboard/home" onClose={onClose}>Open Home to connect</ArticleLink>
  </div>;
}

function ChatGuide({ onClose }: { onClose: () => void }) {
  return <div>
    <ArticleHeading eyebrow="Tell it what you need" icon={Sparkles} title="Create and edit in chat" />
    <p className="mt-5 text-sm leading-6 text-ink-600">Enable Magnets in your connected assistant, make your request and approve the requested tool actions. Wait for it to confirm the work was saved.</p>
    <div className="mt-6 grid gap-3">
      {[
        ['Create', SAVED_LEAD_MAGNET_PROMPT, 'Or describe a new idea, its audience and the result it should help them get.'],
        ['Edit', 'Find my pricing checklist and shorten the headline.', 'Identify the lead magnet by name or link. Changes to a published page go live, so confirm when you want to update it.'],
        ['Use your file', 'Use this PDF as the download, unchanged.', 'Attach the file and explain whether it is the actual download or just research. If your assistant cannot upload it, use Hosted resources and paste its resource link into the chat.'],
        ['Choose emails', 'Just the delivery email, please.', 'Follow-ups are optional. The assistant asks before creating them. For custom timing or changes to an existing live sequence, use the Sequence tab in Magnets.'],
        ['Add artwork', 'Create a graphic for this lead magnet using my saved brand.', 'ChatGPT can use image generation. Claude can design a graphic and have Magnets render and attach it without transferring a file. Ask to see a preview first if you want to check it before it appears on your live page.'],
        ['See your audience', 'Show me the signups for my pricing checklist.', 'Workspace access lets the assistant retrieve your account’s signups. You can also view and export them from Signups in Magnets.'],
      ].map(([title, prompt, detail]) => <section key={title} className="rounded-xl border border-ink-200 bg-ink-50 p-4">
        <h4 className="text-sm font-semibold text-ink-950">{title}</h4>
        <p className="mt-2 text-base font-medium text-ink-900">“{prompt}”</p>
        <p className="mt-2 text-sm leading-6 text-ink-600">{detail}</p>
      </section>)}
    </div>
    <p className="mt-6 text-sm leading-6 text-ink-600">Your assistant provides the AI capabilities through your own plan. Its limits still apply. Magnets allows up to 10 new lead magnets per rolling 24 hours, shared across chat and manual creation.</p>
    <ArticleLink href="/dashboard/pages" onClose={onClose}>Find my lead magnets</ArticleLink>
  </div>;
}

function TroubleshootingGuide({ onClose }: { onClose: () => void }) {
  return <div>
    <ArticleHeading eyebrow="Get moving again" icon={Lightbulb} title="Find your next step" />
    <div className="mt-6 grid gap-3">
      {[
        ['I copied the connection link. Now what?', 'Open the visual connection guide from Home. Add the link in your assistant’s connection settings, approve access and choose Check connection. Copying alone does not finish setup.'],
        ['My assistant cannot see Magnets', 'Start a new chat and select Magnets. Check you connected the same account you use here. Reconnect through Home if you have an older creation-only connection.'],
        ['I cannot find the finished page', 'Open Lead magnets and look for its title. A message in chat is not a saved page until the assistant confirms it saved successfully. Ask it to check the result before creating another copy.'],
        ['My page is still a draft', 'Read the publishing error and fix the requested setting. Ask the assistant to retry publishing that same lead magnet, or publish it in the editor. A draft link is not a live page.'],
        ['My file or image did not upload', 'For a Claude graphic, ask it to use the Magnets graphic preview and attachment tools instead of sending encoded image data. If it needs to redraw an existing image, check the new preview first. For a download file, use Hosted resources and paste its resource link into chat. You can also upload an image directly in the lead magnet editor.'],
        ['I reached the creation limit', 'The limit is 10 new lead magnets in a rolling 24-hour window across chat and the app. Wait until an earlier creation falls outside that window. You can continue managing existing work.'],
      ].map(([title, detail]) => <section key={title} className="rounded-xl border border-ink-200 bg-ink-50 p-4"><h4 className="text-sm font-semibold text-ink-950">{title}</h4><p className="mt-2 text-sm leading-6 text-ink-600">{detail}</p></section>)}
    </div>
    <ArticleLink href="/dashboard/home" onClose={onClose}>Go to Home</ArticleLink>
  </div>;
}

function ManualGuide({ onClose }: { onClose: () => void }) {
  return <div>
    <ArticleHeading eyebrow="Another way to create" icon={PanelTop} title="Create without an assistant" />
    <p className="mt-5 text-sm leading-6 text-ink-600">You can use the full editor without connecting ChatGPT or Claude. Existing lead magnets and custom domains keep working.</p>
    <ol className="mt-6 grid gap-5">
      <Step number={1} title="Bring your resource" detail="Upload your file in Hosted resources and copy its download link, or use an accessible link to your existing resource." />
      <Step number={2} title="Choose Create manually" detail="Open Lead magnets and create a page. Add the title, short description and resource link." />
      <Step number={3} title="Edit the page and email" detail="Complete Landing page and Delivery email. Add optional follow-ups in Sequence and choose what visitors see under After signup." />
      <Step number={4} title="Preview, publish and share" detail="Check the page and delivery email, publish when ready, then share the live signup-page link. New signups appear in Signups." />
    </ol>
    <ArticleLink href="/dashboard/pages?new=1" onClose={onClose}>Create manually</ArticleLink>
  </div>;
}

function EditorGuide({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <ArticleHeading eyebrow="Build the full journey" icon={PanelTop} title="How do I edit and publish a lead magnet?" />
      <p className="mt-5 text-sm leading-6 text-ink-600">
        Each lead magnet has one editor for the page people visit, the email that delivers the resource,
        any follow-up emails, and what happens after signup. Changes save automatically while you work.
        Temporary connection or save conflicts retry automatically; the toolbar confirms when your changes are saved.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {[
          ['Landing page', 'Write the promise, explain the value, optionally add an image, and choose the details the form should collect.'],
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
        <Step detail="Assistant-created pages publish automatically when ready. Manual pages and blocked publications remain drafts until published. Check the status before sharing; draft pages are not available to visitors." number={3} title="Publish when ready" />
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
      <ArticleHeading eyebrow="Your account foundations" icon={Settings} title="What belongs in Customise?" />
      <p className="mt-5 text-sm leading-6 text-ink-600">
        Customise controls where your pages live, where emails come from, and which other tools
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
      <ArticleLink href="/dashboard?setup=workspace" onClose={onClose}>Open Settings → Customise</ArticleLink>
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
        <Step detail="Ask your connected assistant to create the resource, page and delivery email, or bring your own resource and use the manual editor." number={1} title="Make the resource" />
        <Step detail="Assistant-created resources are linked in the delivery email automatically. For a manual page, add your resource link to the email." number={2} title="Add it to the journey" />
        <Step detail="Assistant-created pages publish when ready. Publish manual pages in the editor, then share the live signup-page link." number={3} title="Promote the page" />
        <Step detail="A visitor sees the promise and enters their details to request the resource." number={4} title="They sign up" />
        <Step detail="Magnets emails the resource link immediately and records the signup for you." number={5} title="They get the promised value" />
        <Step detail="Only add follow-up emails if you want them. The delivery email works on its own." number={6} title="Continue the conversation" />
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
      <div className="mt-5 rounded-xl border border-ink-200 bg-ink-50 p-4">
        <p className="text-sm font-semibold text-ink-950">Created with ChatGPT or Claude?</p>
        <p className="mt-1 text-sm leading-6 text-ink-600">
          Generated resources appear here automatically. Choose Open resource to read it, PDF to download it,
          or Edit lead magnet to change its signup page and emails. Published lead magnets also have a
          View live lead magnet link. Draft resources remain private until you publish.
        </p>
      </div>
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
        Import your website during onboarding or from Brand, then review the suggested name, logo and colours before applying them. You can correct any suggestion or upload your own logo. Saved brand settings apply to your public pages and editor preview, and are passed to your assistant for new artwork. Changing Brand also affects existing live pages.
      </p>
      <ol className="mt-8 grid gap-6">
        <Step detail="Open Settings in the sidebar, then choose Brand." number={1} title="Open your brand settings" />
        <Step detail="Add your business name, upload a logo, choose its display size, and set the primary colour used across your pages." number={2} title="Set the identity and colour" />
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
        <Step detail="In Settings → Customise, add the root domain you own. You do not have to publish your pages on that domain." number={1} title="Add your domain" />
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
        <p className="text-sm font-semibold text-ink-950">Your resource link is included</p>
        <p className="mt-1 text-sm leading-6 text-ink-600">
          When your assistant creates the lead magnet, it includes the resource link in the delivery email.
          For a manually created page, paste your download or access link here. Hosted resources gives
          uploaded files a unique link you can use.
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
        Your assistant asks whether you want just the delivery email or follow-ups too. Follow-ups are never required. A sequence is an optional set of emails sent after the resource. Use it to help someone
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
        <Step detail="Open Settings → Customise and expand Legal links." number={1} title="Open the legal settings" />
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
        list by hand. Open Settings → Customise, expand Optional connections, then open Newsletter under
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
        Settings → Customise, expand Optional connections, then open Kit under Automations.
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
        <Step detail="In Magnets, open Settings → Customise, Optional connections, then Slack. Paste the URL into the webhook field." number={3} title="Paste it into Magnets" />
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
        <Step detail="Open Settings → Customise, Optional connections, then Zapier. Paste the URL into Magnets." number={3} title="Add it to Magnets" />
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
        <Step detail="In Magnets, open Settings → Customise, Optional connections, then Pipedrive. Paste the token." number={3} title="Add it to Magnets" />
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
        <Step detail="Open Settings → Customise, Optional connections, then Calendar." number={1} title="Open Calendar settings" />
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
            Open a lead magnet and choose Analytics to see total signups, unique people, tracked visits
            and conversions, conversion rate, engagement, and results from the after-signup experience.
            Total signups include repeat requests. Conversion rate uses only signups matched to a tracked visit.
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
                  <p className="text-xs text-ink-500">Create in chat. Manage everything here.</p>
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
                          Your next step, made simple.
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-ink-600">
                          Connect your assistant, create your lead magnet, then share it and see who signs up.
                        </p>
                      </div>

                      {!normalizedQuery && <div className="mt-5 grid gap-2 sm:grid-cols-3" aria-label="Quick start">
                        {([
                          ['start', '01', 'Start with an idea', 'See the whole flow', Compass],
                          ['connect', '02', 'Connect your assistant', 'Follow the visual guide', MessageSquare],
                          ['chat', '03', 'Create and keep editing', 'Know what to ask in chat', Sparkles],
                        ] as const).map(([topic, number, title, detail, Icon]) => <button key={topic} type="button" onClick={() => openTopic(topic)} className="group flex items-center gap-3 rounded-xl border border-brand-orange/25 bg-brand-orange/5 p-4 text-left transition hover:-translate-y-0.5 hover:bg-brand-orange/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange motion-reduce:transform-none sm:block">
                          <span className="flex shrink-0 items-center justify-between gap-2 text-brand-orange"><Icon className="h-5 w-5" /><span className="text-xs font-semibold">{number}</span></span>
                          <span className="block min-w-0 sm:mt-3"><span className="block text-sm font-semibold text-ink-950">{title}</span>
                          <span className="mt-1 block text-xs leading-5 text-ink-600">{detail}</span></span>
                        </button>)}
                      </div>}

                      <label className="relative mt-6 block">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                        <input
                          aria-label="Search help"
                          autoComplete="off"
                          className="h-12 w-full rounded-xl border border-ink-200 bg-white pl-11 pr-4 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15"
                          onChange={(event) => setSearchQuery(event.target.value)}
                          placeholder="Search connection, editing, emails…"
                          type="search"
                          value={searchQuery}
                        />
                      </label>

                      {visibleTopicGroups.length > 0 ? (
                        <nav aria-label="Help topics" className="mt-7">
                          <div className="grid items-start gap-4 sm:grid-cols-2">
                            {visibleTopicGroups.map((group) => (
                              <TopicGroupSection group={group} key={group.label} onTopicClick={openTopic} />
                            ))}
                          </div>
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
                      {activeTopic === 'connect' && <ConnectGuide onClose={onClose} />}
                      {activeTopic === 'chat' && <ChatGuide onClose={onClose} />}
                      {activeTopic === 'troubleshoot' && <TroubleshootingGuide onClose={onClose} />}
                      {activeTopic === 'manual' && <ManualGuide onClose={onClose} />}
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
