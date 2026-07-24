'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarCheck,
  Check,
  ChevronRight,
  CircleCheck,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Globe2,
  LayoutDashboard,
  Mail,
  MousePointerClick,
  Palette,
  Plus,
  Search,
  Send,
  Settings2,
  Sparkles,
  TrendingUp,
  UserRoundPlus,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MagnetsLogo } from '@/components/magnets-logo-mark';
import { cn } from '@/lib/utils';

type DemoView = 'overview' | 'magnets' | 'signups' | 'automations';
type DemoRange = '7d' | '30d' | '90d';
type MagnetStage = 'page' | 'delivery' | 'sequence' | 'after';

type DemoMagnet = {
  id: string;
  title: string;
  description: string;
  slug: string;
  format: string;
  signups: string;
  conversion: string;
  visits: string;
  status: 'Published' | 'Draft';
  previewBackground: string;
  artworkInk?: boolean;
  accentClass: string;
  accentSoftClass: string;
};

const demoMagnets: DemoMagnet[] = [
  {
    id: 'ai-content-system',
    title: 'The AI Content System',
    description: 'Turn one sharp idea into a month of useful content.',
    slug: 'ai-content-system',
    format: '5-day email course',
    signups: '2,418',
    conversion: '48.7%',
    visits: '4,964',
    status: 'Published',
    previewBackground: 'linear-gradient(145deg, #211d1b 0%, #111111 58%, #35221a 100%)',
    accentClass: 'bg-brand-orange',
    accentSoftClass: 'bg-[#fff0e9] text-[#c44218]',
  },
  {
    id: 'linkedin-playbook',
    title: 'Founder-led LinkedIn Playbook',
    description: 'A practical system for posts that start sales conversations.',
    slug: 'linkedin-playbook',
    format: 'PDF playbook',
    signups: '1,362',
    conversion: '41.2%',
    visits: '3,306',
    status: 'Published',
    previewBackground: 'linear-gradient(145deg, #142b35 0%, #0c1c24 60%, #173f4b 100%)',
    accentClass: 'bg-brand-aqua',
    accentSoftClass: 'bg-[#e8f9fb] text-[#176b75]',
  },
  {
    id: 'homepage-scorecard',
    title: 'Homepage Teardown Scorecard',
    description: 'Get an instant, personalised homepage conversion score.',
    slug: 'homepage-scorecard',
    format: 'Interactive AI artefact',
    signups: '934',
    conversion: '37.8%',
    visits: '2,471',
    status: 'Published',
    previewBackground: 'linear-gradient(145deg, #fff4bf 0%, #fdc957 55%, #f6a93b 100%)',
    artworkInk: true,
    accentClass: 'bg-brand-yellow',
    accentSoftClass: 'bg-[#fff8df] text-[#8a5a00]',
  },
  {
    id: 'pricing-calculator',
    title: 'B2B Pricing Calculator',
    description: 'Model a clearer pricing strategy in under five minutes.',
    slug: 'pricing-calculator',
    format: 'Interactive calculator',
    signups: '504',
    conversion: '32.1%',
    visits: '1,570',
    status: 'Published',
    previewBackground: 'linear-gradient(145deg, #2d1630 0%, #170e1a 58%, #4e1f42 100%)',
    accentClass: 'bg-brand-coral',
    accentSoftClass: 'bg-[#fff0f0] text-[#b42d38]',
  },
];

const demoLeads = [
  { id: 'maya', name: 'Maya Chen', company: 'Northstar Studio', magnet: 'The AI Content System', time: '2m ago', source: 'LinkedIn', initials: 'MC', tone: 'bg-[#e8f9fb] text-[#176b75]', opened: true },
  { id: 'theo', name: 'Theo Martin', company: 'Luma Works', magnet: 'Homepage Teardown Scorecard', time: '8m ago', source: 'Organic', initials: 'TM', tone: 'bg-[#fff8df] text-[#8a5a00]', opened: true },
  { id: 'amina', name: 'Amina Yusuf', company: 'Brightline Labs', magnet: 'Founder-led LinkedIn Playbook', time: '19m ago', source: 'Newsletter', initials: 'AY', tone: 'bg-[#fff0e9] text-[#c44218]', opened: false },
  { id: 'jon', name: 'Jon Bell', company: 'Mesa Advisory', magnet: 'B2B Pricing Calculator', time: '31m ago', source: 'Direct', initials: 'JB', tone: 'bg-[#fff0f0] text-[#b42d38]', opened: true },
  { id: 'sofia', name: 'Sofia Rossi', company: 'Good Monday', magnet: 'The AI Content System', time: '47m ago', source: 'LinkedIn', initials: 'SR', tone: 'bg-[#efebe4] text-[#46403b]', opened: true },
];

const rangeData: Record<DemoRange, { signups: string; visits: string; rate: string; conversations: string; change: string; series: number[] }> = {
  '7d': {
    signups: '1,284',
    visits: '3,102',
    rate: '41.4%',
    conversations: '186',
    change: '+18.2%',
    series: [23, 31, 29, 46, 42, 58, 64, 61, 78, 83, 92, 88],
  },
  '30d': {
    signups: '5,218',
    visits: '12,846',
    rate: '40.6%',
    conversations: '742',
    change: '+24.8%',
    series: [18, 27, 25, 39, 36, 48, 44, 58, 65, 61, 76, 84],
  },
  '90d': {
    signups: '14,892',
    visits: '38,104',
    rate: '39.1%',
    conversations: '2,126',
    change: '+31.6%',
    series: [14, 19, 24, 29, 27, 38, 47, 45, 59, 68, 77, 91],
  },
};

const navItems: Array<{ id: DemoView; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'magnets', label: 'Lead magnets', icon: FileText },
  { id: 'signups', label: 'Signups', icon: Users },
  { id: 'automations', label: 'Delivery', icon: Workflow },
];

function DemoBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-orange/25 bg-brand-orange/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-700 sm:text-[10px]">
      <Sparkles className="h-3 w-3 text-brand-orange" />
      Interactive demo
    </span>
  );
}

function TrendPill({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
      <TrendingUp className="h-3 w-3" />
      {children}
    </span>
  );
}

function DemoChart({ range }: { range: DemoRange }) {
  const series = rangeData[range].series;
  const width = 520;
  const height = 170;
  const points = series.map((value, index) => ({
    x: (index / (series.length - 1)) * width,
    y: height - (value / 100) * (height - 16) - 8,
  }));
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <div className="relative mt-4 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid grid-rows-4">
        {[0, 1, 2, 3].map((line) => <span className="border-t border-ink-100" key={line} />)}
      </div>
      <svg aria-label={`${range} signup trend`} className="relative h-36 w-full overflow-visible sm:h-44" preserveAspectRatio="none" role="img" viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id={`demo-chart-fill-${range}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#FE6F34" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#FE6F34" stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          animate={{ d: areaPath }}
          d={areaPath}
          fill={`url(#demo-chart-fill-${range})`}
          initial={false}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        />
        <motion.path
          animate={{ d: linePath }}
          d={linePath}
          fill="none"
          initial={false}
          stroke="#FE6F34"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
          transition={{ duration: 0.45, ease: 'easeOut' }}
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={points.at(-1)?.x} cy={points.at(-1)?.y} fill="#ffffff" r="5" stroke="#FE6F34" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function MagnetArtwork({ magnet, compact = false }: { magnet: DemoMagnet; compact?: boolean }) {
  return (
    <div
      className={cn('relative overflow-hidden', compact ? 'h-28' : 'min-h-64')}
      style={{ background: magnet.previewBackground, color: magnet.artworkInk ? '#111111' : '#ffffff' }}
    >
      <div aria-hidden="true" className={cn('absolute -right-10 -top-12 h-32 w-32 rounded-full border', magnet.artworkInk ? 'border-black/10' : 'border-white/15')} />
      <div aria-hidden="true" className={cn('absolute -bottom-16 -left-10 h-36 w-36 rounded-full border', magnet.artworkInk ? 'border-black/10' : 'border-white/10')} />
      <div className={cn('relative flex h-full flex-col', compact ? 'p-4' : 'p-6 sm:p-8')}>
        <span className={cn('inline-flex w-fit rounded-full font-semibold uppercase tracking-[0.14em] backdrop-blur', magnet.artworkInk ? 'bg-black/10' : 'bg-white/10', compact ? 'px-2 py-1 text-[7px]' : 'px-2.5 py-1 text-[9px]')}>
          {magnet.format}
        </span>
        <h4 className={cn('max-w-sm font-semibold leading-[1.08]', compact ? 'mt-4 text-base' : 'mt-8 text-3xl')}>
          {magnet.title}
        </h4>
        {!compact && <p className={cn('mt-3 max-w-sm text-sm leading-6', magnet.artworkInk ? 'text-black/65' : 'text-white/70')}>{magnet.description}</p>}
        <div className={cn('mt-auto flex items-center', compact ? 'pt-4' : 'pt-10')}>
          <span className={cn('rounded-full', magnet.accentClass, compact ? 'h-2 w-10' : 'h-2.5 w-14')} />
          <span className={cn('ml-2 text-[8px] font-semibold uppercase tracking-[0.16em]', magnet.artworkInk ? 'text-black/55' : 'text-white/55')}>by Demo Studio</span>
        </div>
      </div>
    </div>
  );
}

function OverviewView({
  range,
  setRange,
  openMagnet,
}: {
  range: DemoRange;
  setRange: (range: DemoRange) => void;
  openMagnet: (magnet: DemoMagnet) => void;
}) {
  const data = rangeData[range];
  const stats = [
    { label: 'Signups', value: data.signups, detail: 'Email addresses captured', icon: UserRoundPlus },
    { label: 'Conversion rate', value: data.rate, detail: 'Visit to signup', icon: MousePointerClick },
    { label: 'Page visits', value: data.visits, detail: 'Anonymous sessions', icon: Eye },
    { label: 'Conversations', value: data.conversations, detail: 'Replies and bookings', icon: CalendarCheck },
  ];

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <DemoBadge />
          <h2 className="mt-3 text-xl font-semibold tracking-[-0.025em] text-ink-950 sm:text-2xl">Good morning, Alex</h2>
          <p className="mt-1 text-xs text-ink-500 sm:text-sm">Here is what your lead magnets are doing for you.</p>
        </div>
        <div aria-label="Analytics date range" className="flex w-fit rounded-lg border border-ink-200 bg-white p-1" role="group">
          {(['7d', '30d', '90d'] as DemoRange[]).map((item) => (
            <button
              aria-pressed={range === item}
              className={cn(
                'rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition',
                range === item ? 'bg-ink-950 text-white shadow-sm' : 'text-ink-500 hover:bg-ink-50 hover:text-ink-950',
              )}
              key={item}
              onClick={() => setRange(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        {stats.map(({ label, value, detail, icon: Icon }, index) => (
          <motion.article
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-ink-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(17,17,17,0.03)] sm:p-4"
            initial={{ opacity: 0, y: 8 }}
            key={`${range}-${label}`}
            transition={{ delay: index * 0.04 }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">{label}</span>
              <Icon className="h-3.5 w-3.5 text-ink-400" />
            </div>
            <p className="mt-3 text-xl font-semibold tracking-[-0.03em] text-ink-950 sm:text-2xl">{value}</p>
            <p className="mt-1 hidden text-[10px] text-ink-500 sm:block">{detail}</p>
          </motion.article>
        ))}
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(15rem,0.75fr)]">
        <article className="rounded-xl border border-ink-200 bg-white p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink-950">Signup momentum</p>
              <p className="mt-0.5 text-[10px] text-ink-500">New contacts captured across every page</p>
            </div>
            <TrendPill>{data.change}</TrendPill>
          </div>
          <DemoChart range={range} />
          <div className="flex justify-between text-[9px] font-medium uppercase tracking-[0.12em] text-ink-400">
            <span>{range === '7d' ? 'Mon' : range === '30d' ? '1 Jun' : 'May'}</span>
            <span>{range === '7d' ? 'Today' : range === '30d' ? 'Today' : 'Today'}</span>
          </div>
        </article>

        <article className="overflow-hidden rounded-xl border border-ink-200 bg-white">
          <button className="block w-full text-left transition hover:bg-ink-50" onClick={() => openMagnet(demoMagnets[0])} type="button">
            <MagnetArtwork compact magnet={demoMagnets[0]} />
            <div className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-brand-orange">Top performer</p>
                <ArrowUpRight className="h-3.5 w-3.5 text-ink-400" />
              </div>
              <p className="mt-2 text-sm font-semibold text-ink-950">{demoMagnets[0].title}</p>
              <div className="mt-3 flex items-center gap-4 text-[10px] text-ink-500">
                <span><strong className="text-ink-900">{demoMagnets[0].signups}</strong> signups</span>
                <span><strong className="text-ink-900">{demoMagnets[0].conversion}</strong> conversion</span>
              </div>
            </div>
          </button>
        </article>
      </div>

      <article className="mt-3 rounded-xl border border-ink-200 bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink-950">Happening now</p>
            <p className="mt-0.5 text-[10px] text-ink-500">A live view of your signup journey</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live
          </span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {[
            ['Maya signed up', 'AI Content System', '2m', UserRoundPlus],
            ['Resource delivered', 'Homepage Scorecard', '8m', Send],
            ['Call booked', 'LinkedIn Playbook', '14m', CalendarCheck],
          ].map(([title, detail, time, icon]) => {
            const Icon = icon as typeof UserRoundPlus;
            return (
              <div className="flex min-w-0 items-center gap-2.5 rounded-lg bg-ink-50 p-2.5" key={title as string}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-brand-orange shadow-sm">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-ink-900">{title as string}</p>
                  <p className="truncate text-[9px] text-ink-500">{detail as string}</p>
                </div>
                <span className="ml-auto text-[9px] text-ink-400">{time as string}</span>
              </div>
            );
          })}
        </div>
      </article>
    </div>
  );
}

function LeadMagnetsView({
  selectedMagnet,
  setSelectedMagnet,
  stage,
  setStage,
  notify,
}: {
  selectedMagnet: DemoMagnet | null;
  setSelectedMagnet: (magnet: DemoMagnet | null) => void;
  stage: MagnetStage;
  setStage: (stage: MagnetStage) => void;
  notify: (message: string) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = demoMagnets.filter((magnet) => `${magnet.title} ${magnet.format}`.toLowerCase().includes(query.toLowerCase()));

  if (selectedMagnet) {
    const stages: Array<{ id: MagnetStage; label: string; icon: typeof Globe2 }> = [
      { id: 'page', label: 'Landing page', icon: Globe2 },
      { id: 'delivery', label: 'Delivery email', icon: Mail },
      { id: 'sequence', label: 'Sequence', icon: Workflow },
      { id: 'after', label: 'After signup', icon: CalendarCheck },
    ];

    return (
      <div>
        <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 transition hover:text-ink-950" onClick={() => setSelectedMagnet(null)} type="button">
          <ArrowLeft className="h-3.5 w-3.5" />
          All lead magnets
        </button>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-[-0.025em] text-ink-950 sm:text-2xl">{selectedMagnet.title}</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Published
              </span>
            </div>
            <p className="mt-1 font-mono text-[10px] text-ink-400">magnets.so/demo/{selectedMagnet.slug}</p>
          </div>
          <button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-ink-950 px-3 text-xs font-semibold text-white transition hover:bg-brand-orange hover:text-ink-950" onClick={() => notify('This is a demo preview. Your real page can be published in one click.')} type="button">
            <Eye className="h-3.5 w-3.5" />
            Preview page
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stages.map(({ id, label, icon: Icon }) => (
            <button
              aria-pressed={stage === id}
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition',
                stage === id ? 'border-brand-orange bg-brand-orange/10 text-ink-950' : 'border-ink-200 bg-white text-ink-500 hover:border-ink-300 hover:text-ink-950',
              )}
              key={id}
              onClick={() => setStage(id)}
              type="button"
            >
              <Icon className={cn('h-3.5 w-3.5 shrink-0', stage === id && 'text-brand-orange')} />
              <span className="truncate text-[10px] font-semibold sm:text-xs">{label}</span>
              {id !== 'after' && <Check className="ml-auto hidden h-3 w-3 text-emerald-600 sm:block" />}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(15rem,0.85fr)]">
          <article className="overflow-hidden rounded-xl border border-ink-200 bg-white">
            {stage === 'page' && (
              <div>
                <MagnetArtwork magnet={selectedMagnet} />
                <div className="flex items-center justify-between gap-3 border-t border-ink-100 p-4">
                  <div>
                    <p className="text-xs font-semibold text-ink-950">Focused signup page</p>
                    <p className="mt-0.5 text-[10px] text-ink-500">Brand, copy, form, and social proof</p>
                  </div>
                  <button className="rounded-md bg-brand-orange px-3 py-2 text-[10px] font-semibold text-ink-950" onClick={() => notify('Demo signup captured. Magnets would now deliver the resource and start the sequence.')} type="button">
                    Get the resource
                  </button>
                </div>
              </div>
            )}
            {stage === 'delivery' && (
              <div className="p-5 sm:p-7">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff0e9] text-brand-orange"><Mail className="h-4 w-4" /></span>
                <p className="mt-5 text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-400">Subject</p>
                <h3 className="mt-1 text-lg font-semibold text-ink-950">Your AI Content System is ready</h3>
                <div className="mt-5 rounded-xl border border-ink-200 bg-ink-50 p-5">
                  <p className="text-sm font-semibold text-ink-950">Hi {'{name}'},</p>
                  <p className="mt-3 text-xs leading-6 text-ink-600">Here is the system I use to turn one useful idea into a month of content. Start with the ten-minute positioning exercise.</p>
                  <button className="mt-5 rounded-md bg-ink-950 px-4 py-2.5 text-xs font-semibold text-white" onClick={() => notify('Demo resource opened. Real delivery links can point to a file, page, or hosted resource.')} type="button">
                    Open the resource
                  </button>
                </div>
              </div>
            )}
            {stage === 'sequence' && (
              <div className="p-5 sm:p-7">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink-950">5-day value sequence</p>
                    <p className="mt-1 text-[10px] text-ink-500">Useful every day, with a natural offer at the end</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700">Active</span>
                </div>
                <div className="mt-5 space-y-2.5">
                  {[
                    ['Day 1', 'Find the idea worth building on', 'Sent immediately'],
                    ['Day 2', 'Turn expertise into a sharp point of view', 'Wait 1 day'],
                    ['Day 3', 'Build your reusable content engine', 'Wait 1 day'],
                    ['Day 4', 'Create the distribution loop', 'Wait 1 day'],
                    ['Day 5', 'Want help putting it into practice?', 'Wait 1 day'],
                  ].map(([day, subject, timing], index) => (
                    <button className="flex w-full items-center gap-3 rounded-lg border border-ink-200 bg-white p-3 text-left transition hover:border-brand-orange/50 hover:bg-brand-orange/5" key={day} onClick={() => notify(`${day}: ${subject}`)} type="button">
                      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold', index === 0 ? 'bg-brand-orange text-ink-950' : 'bg-ink-100 text-ink-600')}>{index + 1}</span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-ink-900">{subject}</p>
                        <p className="mt-0.5 text-[9px] text-ink-400">{timing}</p>
                      </div>
                      <ChevronRight className="ml-auto h-3.5 w-3.5 text-ink-400" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {stage === 'after' && (
              <div className="flex min-h-80 flex-col items-center justify-center p-6 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f9fb] text-[#176b75]"><CircleCheck className="h-5 w-5" /></span>
                <p className="mt-4 text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-400">You are in</p>
                <h3 className="mt-2 max-w-sm text-2xl font-semibold tracking-[-0.025em] text-ink-950">Your first lesson is already on its way</h3>
                <p className="mt-2 max-w-sm text-xs leading-6 text-ink-500">Invite the next action while intent is high. Show a video, ask a question, or offer a call.</p>
                <button className="mt-5 rounded-md bg-ink-950 px-4 py-2.5 text-xs font-semibold text-white" onClick={() => notify('Demo call booked. Magnets can stop the follow-up sequence automatically.')} type="button">
                  Book a strategy call
                </button>
              </div>
            )}
          </article>

          <div className="space-y-3">
            <article className="rounded-xl border border-ink-200 bg-white p-4">
              <p className="text-xs font-semibold text-ink-950">Performance</p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[['Visits', selectedMagnet.visits], ['Signups', selectedMagnet.signups], ['Rate', selectedMagnet.conversion]].map(([label, value]) => (
                  <div className="rounded-lg bg-ink-50 p-2.5" key={label}>
                    <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-ink-400">{label}</p>
                    <p className="mt-1 text-sm font-semibold text-ink-950">{value}</p>
                  </div>
                ))}
              </div>
            </article>
            <article className="rounded-xl border border-ink-200 bg-white p-4">
              <p className="text-xs font-semibold text-ink-950">Conversion journey</p>
              <div className="mt-4 space-y-3">
                {[
                  ['Landing page', 'Live', Globe2],
                  ['Resource delivery', 'Instant', Send],
                  ['Follow-up sequence', '5 emails', Workflow],
                  ['After-signup page', 'Call booking', CalendarCheck],
                ].map(([label, value, icon]) => {
                  const Icon = icon as typeof Globe2;
                  return (
                    <div className="flex items-center gap-2.5" key={label as string}>
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-50 text-ink-500"><Icon className="h-3.5 w-3.5" /></span>
                      <span className="text-[10px] font-medium text-ink-700">{label as string}</span>
                      <span className="ml-auto text-[9px] text-ink-400">{value as string}</span>
                    </div>
                  );
                })}
              </div>
            </article>
            <article className="rounded-xl border border-brand-orange/20 bg-brand-orange/10 p-4">
              <div className="flex gap-3">
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
                <div>
                  <p className="text-xs font-semibold text-ink-950">Everything is connected</p>
                  <p className="mt-1 text-[10px] leading-5 text-ink-600">Every signup is delivered, recorded, tagged, and moved into the right follow-up.</p>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <DemoBadge />
          <h2 className="mt-3 text-xl font-semibold tracking-[-0.025em] text-ink-950 sm:text-2xl">Lead magnets</h2>
          <p className="mt-1 text-xs text-ink-500 sm:text-sm">The page, delivery, follow-up, and results in one place.</p>
        </div>
        <button className="inline-flex h-9 w-fit items-center justify-center gap-1.5 rounded-lg bg-ink-950 px-3 text-xs font-semibold text-white transition hover:bg-brand-orange hover:text-ink-950" onClick={() => notify('Ready to build yours? Create a free account to start with this exact workflow.')} type="button">
          <Plus className="h-3.5 w-3.5" />
          New lead magnet
        </button>
      </div>
      <label className="relative mt-4 block max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
        <input
          className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-xs text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search demo lead magnets"
          value={query}
        />
      </label>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {filtered.map((magnet) => (
          <button
            className="group overflow-hidden rounded-xl border border-ink-200 bg-white text-left shadow-[0_1px_2px_rgba(17,17,17,0.03)] transition duration-200 hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-[0_18px_45px_-32px_rgba(17,17,17,0.5)]"
            key={magnet.id}
            onClick={() => setSelectedMagnet(magnet)}
            type="button"
          >
            <MagnetArtwork compact magnet={magnet} />
            <div className="p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {magnet.status}
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 text-ink-400 transition group-hover:text-brand-orange" />
              </div>
              <p className="mt-2 line-clamp-2 min-h-9 text-xs font-semibold leading-5 text-ink-950">{magnet.title}</p>
              <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3 text-[9px] text-ink-500">
                <span><strong className="text-ink-900">{magnet.signups}</strong> signups</span>
                <span><strong className="text-ink-900">{magnet.conversion}</strong> CVR</span>
              </div>
            </div>
          </button>
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-ink-200 bg-white py-12 text-center">
          <p className="text-sm font-semibold text-ink-950">No demo magnets match that search</p>
          <button className="mt-2 text-xs font-semibold text-brand-orange hover:underline" onClick={() => setQuery('')} type="button">Clear search</button>
        </div>
      )}
    </div>
  );
}

function SignupsView({ notify }: { notify: (message: string) => void }) {
  const [filter, setFilter] = useState('All');
  const [selectedLead, setSelectedLead] = useState(demoLeads[0]);
  const filters = ['All', 'AI Content System', 'Scorecard', 'LinkedIn'];
  const visibleLeads = filter === 'All'
    ? demoLeads
    : demoLeads.filter((lead) => lead.magnet.includes(filter === 'Scorecard' ? 'Scorecard' : filter));

  function applyFilter(nextFilter: string) {
    const nextLeads = nextFilter === 'All'
      ? demoLeads
      : demoLeads.filter((lead) => lead.magnet.includes(nextFilter === 'Scorecard' ? 'Scorecard' : nextFilter));
    setFilter(nextFilter);
    if (!nextLeads.some((lead) => lead.id === selectedLead.id)) {
      setSelectedLead(nextLeads[0] ?? demoLeads[0]);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <DemoBadge />
          <h2 className="mt-3 text-xl font-semibold tracking-[-0.025em] text-ink-950 sm:text-2xl">Signups</h2>
          <p className="mt-1 text-xs text-ink-500 sm:text-sm">Every lead, source, delivery, and next step in one view.</p>
        </div>
        <button className="inline-flex h-9 w-fit items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 transition hover:bg-ink-50 hover:text-ink-950" onClick={() => notify('Demo CSV prepared. Real exports include every captured field and source.')} type="button">
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {filters.map((item) => (
          <button
            aria-pressed={filter === item}
            className={cn('shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition', filter === item ? 'border-ink-950 bg-ink-950 text-white' : 'border-ink-200 bg-white text-ink-500 hover:border-ink-300 hover:text-ink-950')}
            key={item}
            onClick={() => applyFilter(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(14rem,0.55fr)]">
        <article className="overflow-hidden rounded-xl border border-ink-200 bg-white">
          <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] border-b border-ink-100 bg-ink-50 px-4 py-2.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-ink-400 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.15fr)_5.5rem_4.5rem]">
            <span>Contact</span>
            <span className="hidden sm:block">Lead magnet</span>
            <span className="hidden sm:block">Source</span>
            <span className="text-right">When</span>
          </div>
          <div className="divide-y divide-ink-100">
            {visibleLeads.map((lead) => (
              <button
                className={cn('grid w-full grid-cols-[minmax(0,1fr)_4.5rem] items-center px-4 py-3 text-left transition sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.15fr)_5.5rem_4.5rem]', selectedLead.id === lead.id ? 'bg-brand-orange/5' : 'hover:bg-ink-50')}
                key={lead.id}
                onClick={() => setSelectedLead(lead)}
                type="button"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold', lead.tone)}>{lead.initials}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-semibold text-ink-900">{lead.name}</span>
                    <span className="hidden truncate text-[9px] text-ink-400 sm:block">{lead.company}</span>
                    <span className="block truncate text-[9px] text-ink-400 sm:hidden">{lead.magnet}</span>
                  </span>
                </span>
                <span className="hidden truncate pr-2 text-[10px] text-ink-600 sm:block">{lead.magnet}</span>
                <span className="hidden text-[9px] text-ink-500 sm:block">{lead.source}</span>
                <span className="text-right text-[9px] text-ink-400">{lead.time}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-ink-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <span className={cn('flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold', selectedLead.tone)}>{selectedLead.initials}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-950">{selectedLead.name}</p>
              <p className="truncate text-[10px] text-ink-500">{selectedLead.company}</p>
            </div>
          </div>
          <div className="mt-4 space-y-2.5 border-t border-ink-100 pt-4">
            {[
              ['Signed up', selectedLead.time, CircleCheck],
              ['Resource delivered', 'Instantly', Send],
              ['Email opened', selectedLead.opened ? 'Yes' : 'Waiting', Mail],
              ['Sequence', 'Day 1 of 5', Workflow],
            ].map(([label, value, icon]) => {
              const Icon = icon as typeof CircleCheck;
              return (
                <div className="flex items-center gap-2" key={label as string}>
                  <Icon className="h-3.5 w-3.5 text-ink-400" />
                  <span className="text-[10px] text-ink-600">{label as string}</span>
                  <span className="ml-auto text-[9px] font-semibold text-ink-900">{value as string}</span>
                </div>
              );
            })}
          </div>
          <button className="mt-4 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-ink-950 text-[10px] font-semibold text-white transition hover:bg-brand-orange hover:text-ink-950" onClick={() => notify(`Opened the demo journey for ${selectedLead.name}.`)} type="button">
            View full journey
            <ArrowRight className="h-3 w-3" />
          </button>
        </article>
      </div>
    </div>
  );
}

function AutomationsView({ notify }: { notify: (message: string) => void }) {
  const [activeWorkflow, setActiveWorkflow] = useState(demoMagnets[0].id);
  const magnet = demoMagnets.find((item) => item.id === activeWorkflow) ?? demoMagnets[0];
  const journey = [
    { label: 'Signup captured', detail: 'Form and attribution saved', icon: UserRoundPlus, tone: 'bg-[#fff0e9] text-brand-orange' },
    { label: 'Resource delivered', detail: 'Sent from your verified email', icon: Send, tone: 'bg-[#e8f9fb] text-[#176b75]' },
    { label: 'Follow-up started', detail: magnet.id === 'ai-content-system' ? '5 value emails over 5 days' : '3 useful emails over 4 days', icon: Workflow, tone: 'bg-[#fff8df] text-[#8a5a00]' },
    { label: 'Lead routed', detail: 'Slack, newsletter, and CRM', icon: Zap, tone: 'bg-[#fff0f0] text-[#b42d38]' },
  ];

  return (
    <div>
      <div>
        <DemoBadge />
        <h2 className="mt-3 text-xl font-semibold tracking-[-0.025em] text-ink-950 sm:text-2xl">Delivery and follow-up</h2>
        <p className="mt-1 text-xs text-ink-500 sm:text-sm">One signup triggers the complete journey without manual work.</p>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {demoMagnets.slice(0, 3).map((item) => (
          <button
            aria-pressed={activeWorkflow === item.id}
            className={cn('shrink-0 rounded-lg border px-3 py-2 text-left transition', activeWorkflow === item.id ? 'border-brand-orange bg-brand-orange/10' : 'border-ink-200 bg-white hover:border-ink-300')}
            key={item.id}
            onClick={() => setActiveWorkflow(item.id)}
            type="button"
          >
            <span className="block text-[10px] font-semibold text-ink-900">{item.title}</span>
            <span className="mt-0.5 block text-[8px] text-ink-400">{item.format}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(15rem,0.8fr)]">
        <article className="rounded-xl border border-ink-200 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink-950">The signup journey</p>
              <p className="mt-0.5 text-[10px] text-ink-500">Runs automatically for every new lead</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Active
            </span>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-4">
            {journey.map(({ label, detail, icon: Icon, tone }, index) => (
              <button className="relative rounded-xl border border-ink-200 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-brand-orange/50 hover:shadow-sm" key={label} onClick={() => notify(`${label}: ${detail}`)} type="button">
                <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', tone)}><Icon className="h-4 w-4" /></span>
                <p className="mt-4 text-[11px] font-semibold text-ink-900">{label}</p>
                <p className="mt-1 text-[9px] leading-4 text-ink-500">{detail}</p>
                {index < journey.length - 1 && <ChevronRight className="absolute -right-2.5 top-6 z-10 hidden h-4 w-4 rounded-full bg-white text-ink-300 sm:block" />}
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-xl bg-ink-50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-ink-950">Sequence performance</p>
              <span className="text-[9px] text-ink-400">Last 30 days</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {[['Delivered', '99.8%'], ['Opened', '68.4%'], ['Replied', '12.7%']].map(([label, value]) => (
                <div key={label}>
                  <p className="text-base font-semibold text-ink-950 sm:text-lg">{value}</p>
                  <p className="mt-0.5 text-[8px] uppercase tracking-[0.12em] text-ink-400">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </article>

        <div className="space-y-3">
          <article className="rounded-xl border border-ink-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-ink-950">Connected tools</p>
                <p className="mt-0.5 text-[9px] text-ink-500">Send each lead where work happens</p>
              </div>
              <span className="text-[9px] font-semibold text-emerald-700">4 live</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                ['Beehiiv', BookOpen, 'Newsletter'],
                ['Slack', Bell, 'Notification'],
                ['Pipedrive', FolderOpen, 'CRM'],
                ['Zapier', Zap, 'Anything else'],
              ].map(([label, icon, detail]) => {
                const Icon = icon as typeof BookOpen;
                return (
                  <button className="flex items-center gap-2 rounded-lg border border-ink-200 p-2.5 text-left transition hover:border-brand-orange/50 hover:bg-brand-orange/5" key={label as string} onClick={() => notify(`${label as string} is connected in this demo workspace.`)} type="button">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-500"><Icon className="h-3.5 w-3.5" /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-[10px] font-semibold text-ink-900">{label as string}</span>
                      <span className="block truncate text-[8px] text-ink-400">{detail as string}</span>
                    </span>
                    <Check className="ml-auto h-3 w-3 shrink-0 text-emerald-600" />
                  </button>
                );
              })}
            </div>
          </article>
          <article className="rounded-xl border border-ink-200 bg-ink-950 p-4 text-white">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-orange text-ink-950"><CalendarCheck className="h-4 w-4" /></span>
              <div>
                <p className="text-xs font-semibold">Booking protection</p>
                <p className="mt-1 text-[9px] leading-5 text-white/60">When a lead books through Calendly or Cal.com, Magnets stops the sales follow-up automatically.</p>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}

export function HeroDashboard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [view, setView] = useState<DemoView>('overview');
  const [range, setRange] = useState<DemoRange>('30d');
  const [selectedMagnet, setSelectedMagnet] = useState<DemoMagnet | null>(null);
  const [magnetStage, setMagnetStage] = useState<MagnetStage>('page');
  const [notice, setNotice] = useState('');
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });
  const motionConfig = { damping: 28, stiffness: 120, mass: 0.7 };
  const rawY = useTransform(scrollYProgress, [0, 0.38, 0.76, 1], reduceMotion ? [0, 0, 0, 0] : [88, 18, -14, -40]);
  const rawScale = useTransform(scrollYProgress, [0, 0.4, 1], reduceMotion ? [1, 1, 1] : [0.965, 1, 0.99]);
  const rawRotateX = useTransform(scrollYProgress, [0, 0.42, 1], reduceMotion ? [0, 0, 0] : [3, 0, -1]);
  const y = useSpring(rawY, motionConfig);
  const scale = useSpring(rawScale, motionConfig);
  const rotateX = useSpring(rawRotateX, motionConfig);

  const activeTitle = useMemo(() => navItems.find((item) => item.id === view)?.label ?? 'Overview', [view]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function resetDemoScroll() {
    window.requestAnimationFrame(() => {
      contentRef.current?.scrollTo({ behavior: reduceMotion ? 'auto' : 'smooth', top: 0 });
    });
  }

  function chooseView(nextView: DemoView) {
    setView(nextView);
    if (nextView !== 'magnets') setSelectedMagnet(null);
    resetDemoScroll();
  }

  function openMagnet(magnet: DemoMagnet) {
    setSelectedMagnet(magnet);
    setMagnetStage('page');
    setView('magnets');
    resetDemoScroll();
  }

  return (
    <div className="relative z-10 mx-auto mt-14 max-w-7xl sm:mt-16" ref={containerRef}>
      <motion.div
        className="origin-top will-change-transform"
        style={isHydrated ? { perspective: 1400, rotateX, scale, y } : undefined}
      >
        <div className="relative overflow-hidden rounded-2xl border border-ink-200 bg-white p-1.5 shadow-[0_36px_110px_-48px_rgba(17,17,17,0.56)] sm:p-2">
          <div className="flex h-9 items-center gap-1.5 px-2">
            <span className="h-2.5 w-2.5 rounded-full bg-brand-coral" />
            <span className="h-2.5 w-2.5 rounded-full bg-brand-yellow" />
            <span className="h-2.5 w-2.5 rounded-full bg-brand-aqua" />
            <span className="ml-3 hidden rounded-md bg-ink-50 px-2.5 py-1 font-mono text-[9px] text-ink-400 sm:block">
              magnets.so/demo-workspace
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.11em] text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Fictional data
            </span>
          </div>

          <div className="overflow-hidden rounded-xl border border-ink-200 bg-ink-50">
            <div className="flex min-h-[660px] flex-col md:min-h-[690px] md:flex-row">
              <aside className="hidden w-44 shrink-0 border-r border-ink-200 bg-white md:flex md:flex-col">
                <div className="flex h-14 items-center border-b border-ink-100 px-4">
                  <MagnetsLogo markClassName="h-6" textClassName="h-4 w-auto" />
                </div>
                <nav aria-label="Demo workspace" className="space-y-1 p-2.5">
                  {navItems.map(({ id, label, icon: Icon }) => (
                    <button
                      aria-current={view === id ? 'page' : undefined}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[11px] font-medium transition',
                        view === id ? 'bg-brand-orange/10 text-ink-950' : 'text-ink-500 hover:bg-ink-50 hover:text-ink-950',
                      )}
                      key={id}
                      onClick={() => chooseView(id)}
                      type="button"
                    >
                      <Icon className={cn('h-3.5 w-3.5', view === id && 'text-brand-orange')} />
                      {label}
                      {id === 'signups' && <span className="ml-auto rounded-full bg-brand-orange px-1.5 py-0.5 text-[8px] font-semibold text-ink-950">28</span>}
                    </button>
                  ))}
                </nav>
                <div className="mx-3 border-t border-ink-100 pt-3">
                  {[
                    [Palette, 'Brand'],
                    [Settings2, 'Workspace'],
                  ].map(([icon, label]) => {
                    const Icon = icon as typeof Palette;
                    return (
                      <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[10px] text-ink-400 transition hover:bg-ink-50 hover:text-ink-900" key={label as string} onClick={() => setNotice(`${label as string} settings are available in the real dashboard.`)} type="button">
                        <Icon className="h-3.5 w-3.5" />
                        {label as string}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-auto border-t border-ink-100 p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-950 text-[9px] font-semibold text-white">AS</span>
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-semibold text-ink-900">Alex at Demo Studio</p>
                      <p className="truncate text-[8px] text-ink-400">Fictional workspace</p>
                    </div>
                  </div>
                </div>
              </aside>

              <div className="min-w-0 flex-1">
                <header className="flex h-14 items-center gap-3 border-b border-ink-200 bg-white px-3 sm:px-5">
                  <div className="md:hidden">
                    <MagnetsLogo markClassName="h-6" textClassName="hidden" />
                  </div>
                  <div>
                    <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-ink-400">Demo workspace</p>
                    <p className="text-xs font-semibold text-ink-900">{activeTitle}</p>
                  </div>
                  <span className="ml-auto hidden items-center gap-1.5 rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-[9px] text-ink-500 sm:inline-flex">
                    <Globe2 className="h-3 w-3" />
                    demo.magnets.so
                  </span>
                  <button aria-label="Demo notifications" className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-500 transition hover:bg-ink-50 hover:text-ink-950" onClick={() => setNotice('You are all caught up. This demo has no unread notifications.')} type="button">
                    <Bell className="h-3.5 w-3.5" />
                  </button>
                  <Link className="hidden h-8 items-center rounded-lg bg-ink-950 px-3 text-[10px] font-semibold text-white transition hover:bg-brand-orange hover:text-ink-950 sm:inline-flex" href="/register">
                    Build yours
                  </Link>
                </header>

                <nav aria-label="Demo sections" className="flex gap-1 overflow-x-auto border-b border-ink-200 bg-white px-2 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:hidden">
                  {navItems.map(({ id, label, icon: Icon }) => (
                    <button
                      aria-current={view === id ? 'page' : undefined}
                      className={cn('flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-[9px] font-semibold transition', view === id ? 'bg-brand-orange/10 text-ink-950' : 'text-ink-500')}
                      key={id}
                      onClick={() => chooseView(id)}
                      type="button"
                    >
                      <Icon className={cn('h-3 w-3', view === id && 'text-brand-orange')} />
                      {label}
                    </button>
                  ))}
                </nav>

                <div className="h-[604px] overflow-y-auto p-3 sm:p-5 md:h-[636px]" ref={contentRef}>
                  <AnimatePresence mode="wait">
                    <motion.div
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      initial={{ opacity: 0, x: 8 }}
                      key={`${view}-${selectedMagnet?.id ?? 'library'}`}
                      transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
                    >
                      {view === 'overview' && <OverviewView openMagnet={openMagnet} range={range} setRange={setRange} />}
                      {view === 'magnets' && (
                        <LeadMagnetsView
                          notify={setNotice}
                          selectedMagnet={selectedMagnet}
                          setSelectedMagnet={(magnet) => {
                            setSelectedMagnet(magnet);
                            resetDemoScroll();
                          }}
                          setStage={setMagnetStage}
                          stage={magnetStage}
                        />
                      )}
                      {view === 'signups' && <SignupsView notify={setNotice} />}
                      {view === 'automations' && <AutomationsView notify={setNotice} />}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {notice && (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-5 left-1/2 z-30 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-start gap-2.5 rounded-xl border border-ink-700 bg-ink-950 px-4 py-3 text-left text-[11px] leading-5 text-white shadow-2xl"
                exit={{ opacity: 0, y: 10 }}
                initial={{ opacity: 0, y: 10 }}
              >
                <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-orange" />
                <span>{notice}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
      <div className="relative -mt-1 flex flex-col items-center gap-3 text-center">
        <p className="text-xs text-ink-500">Click around the demo. Every name and number is fictional.</p>
        <Link className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-950 transition hover:text-brand-orange" href="/register">
          Create your own workspace
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
