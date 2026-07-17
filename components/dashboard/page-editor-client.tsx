'use client';

import type { CSSProperties, ChangeEvent } from 'react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadPresigned } from '@vercel/blob/client';
import {
  ArrowLeft,
  Bold,
  Braces,
  CalendarCheck,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListChecks,
  ListMinus,
  ListOrdered,
  Loader2,
  Mail,
  Minus,
  Pilcrow,
  Plus,
  Save,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { brandHighlightOpacity } from '@/lib/brand-highlight';
import { safeLegalUrl } from '@/lib/legal-links';
import {
  appendEmailImage,
  parseEmailBodySegments,
  removeEmailBodySegment,
  replaceEmailBodySegment,
} from '@/lib/email-body-images';
import { blobUploadErrorMessage } from '@/lib/blob-upload-error';
import { normaliseEmailLinkUrl, renderEmailEditorHtml } from '@/lib/email-body-links';
import { pruneQuizRouteConditions } from '@/lib/quiz-routing';
import type { DashboardBasePayload, LeadMagnet } from '@/lib/types';
import { PageHeader } from '@/components/dashboard/app-shell';
import {
  AceternityButton,
  AceternityCard,
  AceternityInput,
  AceternityTextarea,
} from '@/components/ui/aceternity';
import { ConfirmDialog } from '@/components/dashboard/confirm-dialog';
import { LeadMagnetCopilot } from '@/components/dashboard/lead-magnet-copilot';
import { EditableHotspot, InlineParagraphs, InlineText } from '@/components/dashboard/inline-edit';
import type {
  LeadMagnetCopilotFollowUpUpdate,
  LeadMagnetCopilotPatch,
} from '@/lib/lead-magnet-copilot';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type Mode = 'page' | 'email' | 'sequence' | 'after';
type PreviewCss = CSSProperties & Record<`--${string}`, string>;
type EmailImageTarget =
  | { kind: 'resource' }
  | { kind: 'follow-up'; emailId: string };
type PendingEmailImage = {
  target: EmailImageTarget;
  previewUrl: string;
  progress: number;
};

const EDITOR_STEPS: Array<{
  description: string;
  label: string;
  mode: Mode;
}> = [
  { mode: 'page', label: 'Page', description: 'Design the page' },
  { mode: 'email', label: 'Delivery', description: 'Send the resource' },
  { mode: 'sequence', label: 'Follow-up', description: 'Nurture leads' },
  { mode: 'after', label: 'After signup', description: 'Choose the next step' },
];

const MAX_MAGNET_IMAGE_BYTES = 10_000_000;
const MAX_FOLLOW_UP_DELAY_MINUTES = 30 * 24 * 60;
const MAGNET_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const MAGNET_IMAGE_TYPES = new Set(MAGNET_IMAGE_ACCEPT.split(','));

function extensionForImage(file: File) {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';
  return 'jpg';
}

function safeImageName(file: File) {
  const base = file.name
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'image';

  return `${base}-${Date.now()}.${extensionForImage(file)}`;
}

function magnetImageProxyUrl(leadMagnetId: string) {
  return `/magnet-images/${leadMagnetId}?v=${Date.now()}`;
}

function newFollowUpEmail() {
  return {
    id: `email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    delayMinutes: 24 * 60,
    delayHours: 24,
    subject: '',
    preview: '',
    body: '',
    resendTemplateId: '',
  };
}

function newQuizQuestion() {
  const questionId = `question-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id: questionId,
    prompt: 'Which best describes you?',
    options: [
      { id: `${questionId}-option-1`, label: 'Option one', destinationUrl: '' },
      { id: `${questionId}-option-2`, label: 'Option two', destinationUrl: '' },
    ],
  };
}

function newQuizRoute() {
  return {
    id: `route-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    destinationUrl: '',
    conditions: [],
  };
}

function followUpDelayMinutes(email: LeadMagnet['followUpEmails'][number]) {
  const delayMinutes = Number(email.delayMinutes);
  if (Number.isFinite(delayMinutes)) {
    return Math.max(0, Math.round(delayMinutes));
  }

  const delayHours = Number(email.delayHours);
  if (Number.isFinite(delayHours)) {
    return Math.max(0, Math.round(delayHours * 60));
  }

  return 24 * 60;
}

function delayPatchFromMinutes(minutes: number) {
  const delayMinutes = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  return {
    delayMinutes,
    delayHours: Math.round(delayMinutes / 60),
  };
}

function followUpDelayUnit(minutes: number) {
  return minutes > 0 && minutes % 60 === 0 ? 'hours' : 'minutes';
}

function validateFollowUpDelays(leadMagnet: LeadMagnet) {
  for (let index = 0; index < leadMagnet.followUpEmails.length; index += 1) {
    const delayMinutes = followUpDelayMinutes(leadMagnet.followUpEmails[index]);
    if (delayMinutes > MAX_FOLLOW_UP_DELAY_MINUTES) {
      return `Email ${index + 1} delay must be 30 days or less.`;
    }
  }

  return '';
}

async function recordUploadedMagnetImage(leadMagnetId: string, imageUrl: string) {
  const response = await fetch(`/api/lead-magnets/${leadMagnetId}/image`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl }),
  });

  const data = (await response.json().catch(() => null)) as {
    leadMagnet?: LeadMagnet;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(data?.error || 'Image uploaded, but could not be attached to this page.');
  }

  if (!data?.leadMagnet) {
    throw new Error('Image uploaded, but this page did not refresh correctly.');
  }

  return data.leadMagnet;
}

async function finaliseUploadedEmailImage(leadMagnetId: string, blobUrl: string) {
  const response = await fetch(`/api/lead-magnets/${leadMagnetId}/email-image`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blobUrl }),
  });
  const data = (await response.json().catch(() => null)) as {
    imageUrl?: string;
    error?: string;
  } | null;

  if (!response.ok || !data?.imageUrl) {
    throw new Error(data?.error || 'Image uploaded, but could not be prepared for email.');
  }

  return data.imageUrl;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function brandTextColor(brand: string) {
  return brand;
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '');
  const value = clean.length === 3
    ? clean.split('').map((char) => `${char}${char}`).join('')
    : clean;

  if (value.length !== 6) return null;

  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);

  return Number.isNaN(red) || Number.isNaN(green) || Number.isNaN(blue)
    ? null
    : `${red} ${green} ${blue}`;
}

function alpha(hex: string, opacity: number) {
  const rgb = hexToRgb(hex);
  return rgb ? `rgb(${rgb} / ${opacity})` : hex;
}

const pageBackground = [
  'radial-gradient(circle at 7% 38%, var(--brand-primary-edge) 0, transparent 34%)',
  'radial-gradient(circle at 93% 42%, var(--brand-primary-edge) 0, transparent 34%)',
  'linear-gradient(180deg, #ffffff 0%, #f8fbff 44%, #ffffff 100%)',
  'linear-gradient(to right, rgb(15 23 42 / 0.035) 1px, transparent 1px)',
  'linear-gradient(to bottom, rgb(15 23 42 / 0.035) 1px, transparent 1px)',
].join(', ');

function preserveEmailImages(currentBody: string, nextBody: string) {
  const currentImages = parseEmailBodySegments(currentBody)
    .filter((segment) => segment.kind === 'image')
    .map((segment) => segment.raw);
  const missingImages = currentImages.filter((image) => !nextBody.includes(image));

  return [nextBody.trim(), ...missingImages].filter(Boolean).join('\n\n');
}

function EditorWorkflowNav({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
}) {
  return (
    <nav aria-label="Lead magnet setup steps" className="border-t border-ink-200 pt-3">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-0">
        {EDITOR_STEPS.map((step, index) => {
          const active = mode === step.mode;

          return (
            <div className="contents" key={step.mode}>
              <button
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'group flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition sm:flex-1 sm:gap-2.5 sm:px-3',
                  active
                    ? 'border-brand-orange/50 bg-brand-orange/10'
                    : 'border-transparent hover:border-ink-200'
                )}
                onClick={() => onChange(step.mode)}
                type="button"
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition',
                    active
                      ? 'border-brand-orange bg-brand-orange text-[#111111]'
                      : 'border-ink-300 bg-white text-ink-500 group-hover:border-ink-400 group-hover:text-ink-800'
                  )}
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className={cn(
                    'block truncate text-xs font-semibold',
                    active ? 'text-ink-950' : 'text-ink-700'
                  )}>
                    {step.label}
                  </span>
                  <span className="block truncate text-[10px] leading-4 text-ink-500">
                    {step.description}
                  </span>
                </span>
              </button>
              {index < EDITOR_STEPS.length - 1 && (
                <span aria-hidden="true" className="mx-1 hidden h-px w-4 shrink-0 border-t border-ink-200 sm:block" />
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

export function PageEditorClient({
  initialData,
  initialLeadMagnet,
}: {
  initialData: DashboardBasePayload;
  initialLeadMagnet: LeadMagnet;
}) {
  const router = useRouter();
  const [leadMagnet, setLeadMagnet] = useState(initialLeadMagnet);
  const [mode, setMode] = useState<Mode>('page');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingEmailImage, setIsUploadingEmailImage] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);
  const [emailImageUploadTarget, setEmailImageUploadTarget] = useState<EmailImageTarget | null>(null);
  const [pendingEmailImage, setPendingEmailImage] = useState<PendingEmailImage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const emailImageInputRef = useRef<HTMLInputElement | null>(null);
  const account = initialData.account;
  const dirtyRef = useRef(false);
  const lastSavedRef = useRef(initialLeadMagnet);

  const patchLeadMagnet = (updates: Partial<LeadMagnet>) => {
    dirtyRef.current = true;
    setSaveState('idle');
    setLeadMagnet((current) => ({ ...current, ...updates }));
  };

  const patchFollowUpEmail = (
    emailId: string,
    updates: Partial<LeadMagnet['followUpEmails'][number]>
  ) => {
    dirtyRef.current = true;
    setSaveState('idle');
    setLeadMagnet((current) => ({
      ...current,
      followUpEmails: current.followUpEmails.map((email) =>
        email.id === emailId ? { ...email, ...updates } : email
      ),
    }));
  };

  const applyCopilotChanges = (
    updates: LeadMagnetCopilotPatch,
    followUpUpdates: LeadMagnetCopilotFollowUpUpdate[]
  ) => {
    dirtyRef.current = true;
    setSaveState('idle');
    setLeadMagnet((current) => {
      const nextUpdates = {
        ...updates,
        ...(updates.emailBody
          ? { emailBody: preserveEmailImages(current.emailBody, updates.emailBody) }
          : {}),
      };
      const followUpUpdatesById = new Map(followUpUpdates.map((update) => [update.id, update]));

      return {
        ...current,
        ...nextUpdates,
        followUpEmails: current.followUpEmails.map((email) => {
          const update = followUpUpdatesById.get(email.id);
          if (!update) return email;

          return {
            ...email,
            ...update,
            ...(update.body
              ? { body: preserveEmailImages(email.body, update.body) }
              : {}),
          };
        }),
      };
    });
  };

  // No auto-save. The user explicitly hits Save (or toggles Published) when
  // they're done. Auto-saving on every keystroke was making them feel like
  // the editor was fighting them, especially around the publish-time
  // validation: any half-edited state would 400 and roll back to draft.

  // Browser-level warning if the user tries to close / refresh with unsaved
  // changes. Doesn't catch in-app navigation but stops accidental tab close.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  async function saveLeadMagnet(overrides: Partial<LeadMagnet> = {}) {
    if (saveState === 'saving' || isUploadingImage || isUploadingEmailImage) return;
    setError('');

    // Merge any caller overrides into the payload AND into local state. The
    // publish toggle uses this to flip `published` and persist it in the
    // same request — without it the toggle just patched state and waited
    // for a separate Save click, which read as "publish doesn't do anything".
    const payload = { ...leadMagnet, ...overrides };
    const delayError = validateFollowUpDelays(payload);
    if (delayError) {
      setError(delayError);
      setSaveState('error');
      return;
    }

    setSaveState('saving');
    if (Object.keys(overrides).length > 0) {
      setLeadMagnet(payload);
    }

    try {
      const response = await fetch(`/api/lead-magnets/${leadMagnet.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: payload.slug,
          title: payload.title,
          subtitle: payload.subtitle,
          description: payload.description,
          bullets: payload.bullets,
          bulletsHeading: payload.bulletsHeading,
          ctaText: payload.ctaText,
          formHeading: payload.formHeading,
          formSubtext: payload.formSubtext,
          imageUrl: payload.imageUrl,
          downloadLink: payload.downloadLink,
          emailSubject: payload.emailSubject,
          emailBody: payload.emailBody,
          emailPreview: payload.emailPreview,
          followUpEnabled: payload.followUpEnabled,
          followUpStopOnBooking: payload.followUpStopOnBooking,
          followUpEmails: payload.followUpEmails,
          resendFollowUpAutomationId: payload.resendFollowUpAutomationId,
          postSignupMode: payload.postSignupMode,
          postSignupRedirectUrl: payload.postSignupRedirectUrl,
          postSignupHeading: payload.postSignupHeading,
          postSignupBody: payload.postSignupBody,
          postSignupVideoUrl: payload.postSignupVideoUrl,
          postSignupCtaLabel: payload.postSignupCtaLabel,
          postSignupCtaUrl: payload.postSignupCtaUrl,
          postSignupQuizEnabled: payload.postSignupQuizEnabled,
          postSignupQuizTitle: payload.postSignupQuizTitle,
          postSignupQuizDescription: payload.postSignupQuizDescription,
          postSignupQuizQuestions: payload.postSignupQuizQuestions,
          postSignupQuizRoutes: payload.postSignupQuizRoutes,
          published: payload.published,
        }),
      });

      if (!response.ok) {
        if (response.status === 413) {
          throw new Error('The image is still embedded in this save request. Re-upload it so it goes straight to storage, then save again.');
        }

        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        // If the publish-time validation tripped, revert the toggle locally
        // so the user can see what's wrong without the page bouncing back
        // and forth.
        if (response.status === 400 && payload.published) {
          setLeadMagnet((current) => ({ ...current, published: false }));
        }
        throw new Error(data?.error || 'Page could not be saved');
      }

      const data = (await response.json()) as { leadMagnet: LeadMagnet };
      setLeadMagnet(data.leadMagnet);
      lastSavedRef.current = data.leadMagnet;
      dirtyRef.current = false;
      setSaveState('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSaveState('error');
    }
  }

  async function performDelete() {
    if (isDeleting) return;
    setIsDeleting(true);
    setError('');

    try {
      const response = await fetch(`/api/lead-magnets/${leadMagnet.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Page could not be deleted');
      router.push('/dashboard/pages');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!MAGNET_IMAGE_TYPES.has(file.type)) {
      setError('Image must be a PNG, JPG, WebP, or GIF.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_MAGNET_IMAGE_BYTES) {
      setError('Image must be 10 MB or smaller.');
      event.target.value = '';
      return;
    }

    setError('');
    setIsUploadingImage(true);
    setImageUploadProgress(0);
    try {
      const wasDirty = dirtyRef.current;
      const multipart = file.size > 8_000_000;
      const handleUploadUrl = `/api/lead-magnets/${leadMagnet.id}/image`;
      const pathname = `lead-magnets/${account.id}/${leadMagnet.id}/${safeImageName(file)}`;
      const blob = await uploadPresigned(pathname, file, {
        access: 'public',
        contentType: file.type,
        handleUploadUrl,
        multipart,
        onUploadProgress: ({ percentage }) => setImageUploadProgress(Math.round(percentage)),
      });
      const uploadedLeadMagnet = await recordUploadedMagnetImage(leadMagnet.id, blob.url);
      const imageUrl = uploadedLeadMagnet.imageUrl || magnetImageProxyUrl(leadMagnet.id);

      setLeadMagnet((current) => ({ ...current, imageUrl }));
      lastSavedRef.current = { ...lastSavedRef.current, imageUrl };
      dirtyRef.current = wasDirty;
      setSaveState(wasDirty ? 'idle' : 'saved');
    } catch (err) {
      setError(blobUploadErrorMessage(err, 'Image could not be uploaded.'));
    } finally {
      setIsUploadingImage(false);
      setImageUploadProgress(0);
      event.target.value = '';
    }
  }

  function pickEmailImage(target: EmailImageTarget) {
    if (isUploadingEmailImage) return;
    setEmailImageUploadTarget(target);
    emailImageInputRef.current?.click();
  }

  async function handleEmailImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const target = emailImageUploadTarget;
    if (!file || !target) return;

    if (!MAGNET_IMAGE_TYPES.has(file.type)) {
      setError('Email image must be a PNG, JPG, WebP, or GIF.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_MAGNET_IMAGE_BYTES) {
      setError('Email image must be 10 MB or smaller.');
      event.target.value = '';
      return;
    }

    setError('');
    setIsUploadingEmailImage(true);
    const previewUrl = URL.createObjectURL(file);
    setPendingEmailImage({ target, previewUrl, progress: 0 });
    try {
      const multipart = file.size > 8_000_000;
      const handleUploadUrl = `/api/lead-magnets/${leadMagnet.id}/email-image`;
      const pathname = `lead-magnets/${account.id}/${leadMagnet.id}/email-images/${safeImageName(file)}`;
      const blob = await uploadPresigned(pathname, file, {
        access: 'public',
        contentType: file.type,
        handleUploadUrl,
        multipart,
        onUploadProgress: ({ percentage }) => {
          setPendingEmailImage((current) => current?.previewUrl === previewUrl
            ? { ...current, progress: Math.round(percentage) }
            : current);
        },
      });
      const imageUrl = await finaliseUploadedEmailImage(leadMagnet.id, blob.url);

      dirtyRef.current = true;
      setSaveState('idle');
      setLeadMagnet((current) => {
        if (target.kind === 'resource') {
          return {
            ...current,
            emailBody: appendEmailImage(current.emailBody, imageUrl),
          };
        }

        return {
          ...current,
          followUpEmails: current.followUpEmails.map((email) =>
            email.id === target.emailId
              ? { ...email, body: appendEmailImage(email.body, imageUrl) }
              : email
          ),
        };
      });
    } catch (err) {
      setError(blobUploadErrorMessage(err, 'Email image could not be uploaded.'));
    } finally {
      setIsUploadingEmailImage(false);
      setEmailImageUploadTarget(null);
      setPendingEmailImage(null);
      window.setTimeout(() => URL.revokeObjectURL(previewUrl), 0);
      event.target.value = '';
    }
  }

  const brand = account.brand;
  const editorIsDark = brand.pageTheme === 'dark';
  const accountLogo = useMemo(() => {
    const fallback = (account.logoText.trim() || 'Your Brand').slice(0, 24);
    return { fallback, hasImage: Boolean(account.logoUrl) };
  }, [account.logoText, account.logoUrl]);

  return (
    <>
      <PageHeader title="Edit magnet" subtitle="Click anywhere to edit. Changes save as you go." />

      {confirmDelete && (
        <ConfirmDialog
          confirmLabel={isDeleting ? 'Deleting…' : 'Delete magnet'}
          description={
            <>
              <p>
                This removes the page and stops it serving. Any signups already collected stay on your list.
              </p>
              <p className="mt-2 text-ink-600">This action cannot be undone.</p>
            </>
          }
          onCancel={() => setConfirmDelete(false)}
          onConfirm={performDelete}
          pending={isDeleting}
          title="Delete this magnet?"
        />
      )}

      <div className="mx-auto max-w-6xl space-y-4">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        <AceternityCard
          className={cn(
            'page-editor-frame overflow-hidden',
            editorIsDark
              ? 'magnet-page--dark page-editor-frame--dark'
              : 'magnet-page--light page-editor-frame--light'
          )}
          style={{
            '--page-editor-brand': brand.primary,
          } as CSSProperties}
        >
          <div className="page-editor-toolbar flex flex-col gap-3 border-b border-[#dfd8cf] bg-white p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <AceternityButton onClick={() => router.push('/dashboard/pages')} variant="secondary">
                  <ArrowLeft className="h-4 w-4" />
                  All pages
                </AceternityButton>

                <div className="flex h-9 min-w-0 flex-1 items-center rounded-md border border-ink-200 bg-ink-50 px-2.5 text-sm sm:max-w-[12rem] sm:flex-none">
                  <span className="mr-1 font-mono text-xs text-ink-500">/</span>
                  <input
                    aria-label="Page slug"
                    className="min-w-0 flex-1 bg-transparent font-mono text-sm text-ink-900 outline-none"
                    onBlur={(event) => patchLeadMagnet({ slug: slugify(event.target.value) || leadMagnet.slug })}
                    onChange={(event) => patchLeadMagnet({ slug: event.target.value.toLowerCase() })}
                    spellCheck={false}
                    value={leadMagnet.slug}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {saveState === 'error' && (
                <span className="inline-flex h-9 items-center rounded-md border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-700">
                  Could not save
                </span>
              )}
              <button
                aria-label="Toggle published"
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium transition',
                  leadMagnet.published
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
                )}
                disabled={saveState === 'saving' || isUploadingImage || isUploadingEmailImage}
                onClick={() => saveLeadMagnet({ published: !leadMagnet.published })}
                type="button"
              >
                <span
                  aria-hidden
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    leadMagnet.published ? 'bg-emerald-500' : 'bg-ink-400'
                  )}
                />
                {leadMagnet.published ? 'Published' : 'Draft'}
              </button>
              <AceternityButton
                disabled={saveState === 'saving' || isUploadingImage || isUploadingEmailImage}
                onClick={() => saveLeadMagnet()}
                variant="secondary"
              >
                {saveState === 'saving' || isUploadingImage || isUploadingEmailImage ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : saveState === 'saved' ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isUploadingImage
                  ? imageUploadProgress > 0
                    ? `Uploading ${imageUploadProgress}%`
                    : 'Uploading image'
                  : isUploadingEmailImage
                    ? 'Uploading image'
                  : saveState === 'saving'
                    ? 'Saving'
                    : saveState === 'saved'
                      ? 'Saved'
                      : 'Save now'}
              </AceternityButton>
              <AceternityButton onClick={() => setConfirmDelete(true)} variant="danger" disabled={isDeleting}>
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {isDeleting ? 'Deleting' : 'Delete'}
              </AceternityButton>
              </div>
            </div>

            <EditorWorkflowNav mode={mode} onChange={setMode} />
          </div>

          {mode === 'page' ? (
            <PageCanvas
              account={account}
              accountLogoFallback={accountLogo.fallback}
              accountHasLogo={accountLogo.hasImage}
              brandIntensity={brand.highlightIntensity}
              brandPrimary={brandTextColor(brand.primary)}
              leadMagnet={leadMagnet}
              onPatch={patchLeadMagnet}
              onPickImage={() => fileInputRef.current?.click()}
            />
          ) : mode === 'email' ? (
            <EmailCanvas
              account={account}
              isUploadingEmailImage={isUploadingEmailImage && emailImageUploadTarget?.kind === 'resource'}
              leadMagnet={leadMagnet}
              onAddImage={() => pickEmailImage({ kind: 'resource' })}
              onPatch={patchLeadMagnet}
              pendingImage={pendingEmailImage?.target.kind === 'resource' ? pendingEmailImage : null}
            />
          ) : mode === 'after' ? (
            <AfterSignupCanvas leadMagnet={leadMagnet} onPatch={patchLeadMagnet} />
          ) : (
            <SequenceCanvas
              account={account}
              emailImageUploadTarget={isUploadingEmailImage ? emailImageUploadTarget : null}
              leadMagnet={leadMagnet}
              onAddImage={(emailId) => pickEmailImage({ kind: 'follow-up', emailId })}
              onPatch={patchLeadMagnet}
              onUpdateEmail={patchFollowUpEmail}
              pendingImage={pendingEmailImage?.target.kind === 'follow-up' ? pendingEmailImage : null}
            />
          )}
        </AceternityCard>

        <input
          accept={MAGNET_IMAGE_ACCEPT}
          className="hidden"
          onChange={handleImageUpload}
          ref={fileInputRef}
          type="file"
        />

        <input
          accept={MAGNET_IMAGE_ACCEPT}
          className="hidden"
          onChange={handleEmailImageUpload}
          ref={emailImageInputRef}
          type="file"
        />

        {(mode === 'email' || mode === 'sequence') && (
          <p className="text-center text-xs text-ink-500">
            Tip: use <code className="rounded bg-ink-100 px-1 font-mono text-[10px] text-ink-800">{'{name}'}</code> for the recipient. Highlight words and choose Add link, or paste a URL directly. Bare URLs become clickable when sent.
          </p>
        )}
      </div>

      <LeadMagnetCopilot leadMagnet={leadMagnet} onApply={applyCopilotChanges} />
    </>
  );
}

/**
 * Keep this preview visually in sync with the public renderer in
 * components/lead-magnet-page-view.tsx.
 */
function PageCanvas({
  account,
  accountHasLogo,
  accountLogoFallback,
  brandIntensity,
  brandPrimary,
  leadMagnet,
  onPatch,
  onPickImage,
}: {
  account: DashboardBasePayload['account'];
  accountHasLogo: boolean;
  accountLogoFallback: string;
  brandIntensity: number;
  brandPrimary: string;
  leadMagnet: LeadMagnet;
  onPatch: (updates: Partial<LeadMagnet>) => void;
  onPickImage: () => void;
}) {
  const tone = (opacity: number) => alpha(brandPrimary, brandHighlightOpacity(opacity, brandIntensity));
  const isDark = account.brand.pageTheme === 'dark';
  const privacyPolicyUrl = safeLegalUrl(account.brand.privacyPolicyUrl);
  const termsUrl = safeLegalUrl(account.brand.termsUrl);
  const previewStyle: PreviewCss = {
    '--brand-primary': brandPrimary,
    '--brand-primary-rgb': hexToRgb(brandPrimary) || '254 111 52',
    '--brand-primary-soft': tone(0.16),
    '--brand-primary-faint': tone(0.08),
    '--brand-primary-edge': tone(0.1),
    backgroundColor: isDark ? '#0b0d10' : '#ffffff',
    backgroundImage: isDark
      ? [
          'radial-gradient(circle at 7% 38%, var(--brand-primary-edge) 0, transparent 34%)',
          'radial-gradient(circle at 93% 42%, var(--brand-primary-edge) 0, transparent 34%)',
          'linear-gradient(180deg, #0d0f13 0%, #11151b 44%, #0b0d10 100%)',
          'linear-gradient(to right, rgb(255 255 255 / 0.035) 1px, transparent 1px)',
          'linear-gradient(to bottom, rgb(255 255 255 / 0.035) 1px, transparent 1px)',
        ].join(', ')
      : pageBackground,
    backgroundSize: 'auto, auto, auto, 72px 72px, 72px 72px',
  };

  return (
    <div
      className={`magnet-page relative ${isDark ? 'magnet-page--dark' : 'magnet-page--light bg-white text-zinc-900'}`}
      style={{ ...previewStyle, colorScheme: isDark ? 'dark' : 'light' }}
    >
      <header className="relative z-10">
        <div className="mx-auto flex max-w-[1280px] items-center justify-center px-4 pb-7 pt-6 sm:px-6 sm:pb-8 sm:pt-7 lg:px-8">
          <BrandPreviewLockup
            account={account}
            accountHasLogo={accountHasLogo}
            fallback={accountLogoFallback}
          />
        </div>
      </header>

      <main className="relative z-10">
        <div className="mx-auto max-w-[1280px] px-4 pb-12 sm:px-6 sm:pb-16 lg:px-8 lg:pb-20">
          <div
            className="magnet-page-shell relative overflow-hidden rounded-[24px] border border-gray-200/70 bg-white/95 p-6 backdrop-blur-sm sm:p-9 lg:p-14"
            style={{
              boxShadow: `0 36px 110px -72px rgb(15 23 42 / 0.72), 0 0 0 1px ${tone(0.08)}`,
            }}
          >
            <div className="lg:grid lg:grid-cols-[minmax(0,520px)_minmax(360px,520px)] lg:items-start lg:gap-14">
              <section className="min-w-0 lg:pt-1">
                <InlineText
                  ariaLabel="Page headline"
                  as="h1"
                  className="magnet-page-heading mb-6 block max-w-2xl break-words text-4xl font-bold leading-[1.08] text-gray-950 sm:text-5xl lg:text-[58px] lg:leading-[1.05]"
                  emptyPlaceholder="Your headline"
                  maxLength={140}
                  onChange={(value) => onPatch({ title: value })}
                  value={leadMagnet.title}
                />

                <InlineText
                  ariaLabel="Page subheadline"
                  as="p"
                  className="magnet-page-muted mb-10 block max-w-2xl text-lg font-medium leading-relaxed text-gray-600"
                  emptyPlaceholder="Short subhead. say what they will get"
                  maxLength={220}
                  multiline
                  onChange={(value) => onPatch({ subtitle: value })}
                  value={leadMagnet.subtitle}
                />

                <div className="mb-10 lg:hidden">
                  <MediaAndCapturePreview
                    brandIntensity={brandIntensity}
                    brandPrimary={brandPrimary}
                    ctaText={leadMagnet.ctaText}
                    formHeading={leadMagnet.formHeading}
                    formSubtext={leadMagnet.formSubtext}
                    imageUrl={leadMagnet.imageUrl}
                    onPickImage={onPickImage}
                    onRemoveImage={() => onPatch({ imageUrl: '' })}
                    onPatch={onPatch}
                    title={leadMagnet.title}
                  />
                </div>

                <div className="mb-11 max-w-2xl">
                  <InlineParagraphs
                    ariaLabel="Page description"
                    className="magnet-page-muted text-[15px] leading-7 text-gray-600"
                    emptyPlaceholder="Write a short pitch. Press Enter twice to start a new paragraph."
                    onChange={(value) => onPatch({ description: value })}
                    value={leadMagnet.description}
                  />
                </div>

                <EditableHotspot className="mb-6" label="Bullets">
                  <InlineText
                    as="p"
                    ariaLabel="Bullets heading"
                    className="magnet-page-copy mb-6 block text-base font-semibold text-gray-700"
                    emptyPlaceholder="What they will learn"
                    onChange={(value) => onPatch({ bulletsHeading: value })}
                    value={leadMagnet.bulletsHeading}
                  />
                  <ul className="max-w-2xl space-y-4">
                    {leadMagnet.bullets.length === 0 && (
                      <li className="text-sm italic text-gray-400">No bullets yet. click + to add one.</li>
                    )}
                    {leadMagnet.bullets.map((bullet, index) => (
                      // Keying by index keeps the contenteditable DOM node stable
                      // as the user types; keying by the bullet value would unmount
                      // the input on every keystroke and lose focus.
                      <li key={index} className="group/bullet flex items-start gap-3">
                        <span
                          aria-hidden
                          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-white"
                          style={{
                            background: `linear-gradient(135deg, ${brandPrimary}, ${alpha(brandPrimary, 0.85)})`,
                            boxShadow: `0 6px 16px -6px ${tone(0.5)}`,
                          }}
                        >
                          <svg viewBox="0 0 12 12" className="h-3 w-3">
                            <path
                              d="M2.5 6.2l2.4 2.4 4.6-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        <InlineText
                          as="span"
                          ariaLabel={`Bullet ${index + 1}`}
                          className="magnet-page-copy flex-1 text-[15px] leading-7 text-gray-700"
                          emptyPlaceholder="Write a benefit"
                          onChange={(value) => {
                            const next = [...leadMagnet.bullets];
                            next[index] = value;
                            onPatch({ bullets: next });
                          }}
                          onCommit={(value) => {
                            if (!value.trim()) {
                              onPatch({ bullets: leadMagnet.bullets.filter((_, i) => i !== index) });
                            }
                          }}
                          value={bullet}
                        />
                        <button
                          aria-label={`Remove bullet ${index + 1}`}
                          className="invisible flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 group-hover/bullet:visible"
                          onClick={() => onPatch({ bullets: leadMagnet.bullets.filter((_, i) => i !== index) })}
                          type="button"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-dashed border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                    onClick={() => onPatch({ bullets: [...leadMagnet.bullets, 'New benefit'] })}
                    type="button"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add bullet
                  </button>
                </EditableHotspot>
              </section>

              <aside className="hidden lg:sticky lg:top-10 lg:block">
                <MediaAndCapturePreview
                  brandIntensity={brandIntensity}
                  brandPrimary={brandPrimary}
                  ctaText={leadMagnet.ctaText}
                  formHeading={leadMagnet.formHeading}
                  formSubtext={leadMagnet.formSubtext}
                  imageUrl={leadMagnet.imageUrl}
                  onPickImage={onPickImage}
                  onRemoveImage={() => onPatch({ imageUrl: '' })}
                  onPatch={onPatch}
                  title={leadMagnet.title}
                />
              </aside>
            </div>
          </div>
        </div>
      </main>

      <footer className="magnet-page-footer relative z-10 border-t border-gray-200/60 bg-white/55 py-11">
        <div className="magnet-page-muted mx-auto flex max-w-[1280px] flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 text-center text-sm text-gray-500 sm:px-6 lg:px-8">
          <span>All rights reserved {new Date().getFullYear()}</span>
          {privacyPolicyUrl && (
            <a className="transition hover:text-gray-900" href={privacyPolicyUrl} rel="noreferrer" target="_blank">
              Privacy policy
            </a>
          )}
          {termsUrl && (
            <a className="transition hover:text-gray-900" href={termsUrl} rel="noreferrer" target="_blank">
              Terms
            </a>
          )}
        </div>
      </footer>
    </div>
  );
}

function BrandPreviewLockup({
  account,
  accountHasLogo,
  fallback,
}: {
  account: DashboardBasePayload['account'];
  accountHasLogo: boolean;
  fallback: string;
}) {
  const logoText = account.logoText.trim();

  if (accountHasLogo) {
    return (
      <div className="inline-flex min-h-10 max-w-full items-center justify-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" className="h-8 w-auto max-w-[52px] object-contain sm:h-10" src={account.logoUrl} />
        {logoText && (
          <span className="magnet-page-heading min-w-0 max-w-[72vw] truncate text-[32px] font-bold leading-none text-gray-950 sm:text-[44px] lg:text-[48px]">
            {logoText}
          </span>
        )}
      </div>
    );
  }

  return (
    <span className="magnet-page-heading max-w-[82vw] truncate text-[32px] font-bold leading-none text-gray-950 sm:text-[44px] lg:text-[48px]">
      {fallback}
    </span>
  );
}

function MediaAndCapturePreview({
  brandIntensity,
  brandPrimary,
  ctaText,
  formHeading,
  formSubtext,
  imageUrl,
  onPickImage,
  onPatch,
  onRemoveImage,
  title,
}: {
  brandIntensity: number;
  brandPrimary: string;
  ctaText: string;
  formHeading: string;
  formSubtext: string;
  imageUrl: string;
  onPickImage: () => void;
  onPatch: (updates: Partial<LeadMagnet>) => void;
  onRemoveImage: () => void;
  title: string;
}) {
  return (
    <div className="space-y-8">
      <ImageHotspot
        brandIntensity={brandIntensity}
        brandPrimary={brandPrimary}
        imageUrl={imageUrl}
        onPickImage={onPickImage}
        onRemoveImage={onRemoveImage}
        title={title}
      />
      <CaptureCardPreview
        brandIntensity={brandIntensity}
        brandPrimary={brandPrimary}
        ctaText={ctaText}
        formHeading={formHeading}
        formSubtext={formSubtext}
        onPatch={onPatch}
      />
    </div>
  );
}

function CaptureCardPreview({
  brandIntensity,
  brandPrimary,
  ctaText,
  formHeading,
  formSubtext,
  onPatch,
}: {
  brandIntensity: number;
  brandPrimary: string;
  ctaText: string;
  formHeading: string;
  formSubtext: string;
  onPatch: (updates: Partial<LeadMagnet>) => void;
}) {
  const tone = (opacity: number) => alpha(brandPrimary, brandHighlightOpacity(opacity, brandIntensity));
  return (
    <div
      className="magnet-capture rounded-[22px] border bg-white p-6 sm:p-8"
      style={{
        borderColor: tone(0.28),
        backgroundImage: [
          `radial-gradient(circle at 18% 0%, ${tone(0.1)} 0, transparent 38%)`,
          `radial-gradient(circle at 82% 100%, ${tone(0.08)} 0, transparent 42%)`,
          'linear-gradient(180deg, #ffffff 0%, rgb(248 251 255 / 0.97) 100%)',
        ].join(', '),
        boxShadow: `0 26px 78px -48px ${tone(0.5)}, 0 18px 48px -42px rgb(15 23 42 / 0.24)`,
      }}
    >
      <InlineText
        ariaLabel="Form heading"
        as="h2"
        className="magnet-page-heading mb-2 block break-words text-center text-2xl font-bold leading-tight text-gray-950 sm:text-[30px]"
        emptyPlaceholder="Download for free"
        maxLength={80}
        onChange={(value) => onPatch({ formHeading: value })}
        value={formHeading}
      />
      <InlineText
        ariaLabel="Form subtext"
        as="p"
        className="magnet-page-muted mb-8 block text-center text-sm leading-6 text-gray-600"
        emptyPlaceholder="Pop your email in and we'll send it straight over."
        maxLength={140}
        multiline
        onChange={(value) => onPatch({ formSubtext: value })}
        value={formSubtext}
      />
      <div className="space-y-4">
        <div className="magnet-form-input flex h-14 items-center rounded-xl border-2 border-gray-200 bg-white/80 px-5 text-[15px] text-gray-500 shadow-sm">
          Name
        </div>
        <div className="magnet-form-input flex h-14 items-center rounded-xl border-2 border-gray-200 bg-white/80 px-5 text-[15px] text-gray-500 shadow-sm">
          Email
        </div>
        <EditableHotspot label="CTA button">
          <div className="flex min-h-14 items-center justify-center rounded-xl bg-gradient-to-r from-gray-900 to-gray-800 px-4 py-3 text-center text-sm font-semibold leading-tight text-white shadow-xl shadow-gray-900/30">
            <InlineText
              ariaLabel="CTA button text"
              as="span"
              // Force focused state to keep the gradient background so the
              // white text stays legible while editing.
              className="block px-2 text-center text-white focus:!bg-transparent hover:!bg-white/10"
              emptyPlaceholder="Send me the resource"
              maxLength={60}
              onChange={(value) => onPatch({ ctaText: value })}
              value={ctaText}
            />
          </div>
        </EditableHotspot>
      </div>
    </div>
  );
}

function ImageHotspot({
  brandIntensity,
  brandPrimary,
  imageUrl,
  onPickImage,
  onRemoveImage,
  title,
}: {
  brandIntensity: number;
  brandPrimary: string;
  imageUrl: string;
  onPickImage: () => void;
  onRemoveImage: () => void;
  title: string;
}) {
  const tone = (opacity: number) => alpha(brandPrimary, brandHighlightOpacity(opacity, brandIntensity));

  if (!imageUrl) {
    return (
      <button
        className="magnet-image magnet-page-copy flex aspect-[16/10] w-full flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-gray-200 bg-gray-50/60 text-gray-700 transition hover:bg-gray-100"
        onClick={onPickImage}
        type="button"
      >
        <ImageIcon className="h-7 w-7" />
        <span className="mt-2 text-sm font-semibold">Add an image</span>
        <span className="text-xs text-gray-500">PNG, JPG, WebP, or GIF. 10 MB max.</span>
      </button>
    );
  }

  return (
    <div
      className="magnet-image group/image relative overflow-hidden rounded-[20px] border border-gray-200/70 bg-gray-50 transition-all duration-300"
      style={{ boxShadow: `0 18px 50px -26px ${tone(0.26)}` }}
    >
      <div className="aspect-[16/10] w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={title || 'Magnet'}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover/image:scale-[1.04]"
          src={imageUrl}
        />
      </div>
      <div className="absolute inset-0 flex items-end justify-end gap-2 bg-gradient-to-t from-black/45 via-black/0 to-black/0 p-3 opacity-0 transition group-hover/image:opacity-100">
        <button
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/90 px-3 text-xs font-semibold text-gray-900 backdrop-blur transition hover:bg-white"
          onClick={onPickImage}
          type="button"
        >
          <ImageIcon className="h-3.5 w-3.5" />
          Replace
        </button>
        <button
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/90 px-3 text-xs font-semibold text-red-600 backdrop-blur transition hover:bg-white"
          onClick={onRemoveImage}
          type="button"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove
        </button>
      </div>
    </div>
  );
}

type EmailTextSegmentEditorHandle = {
  applyFormat: (format: EmailFormatCommand) => void;
  insertVariable: (value: string) => void;
  openLinkEditor: () => void;
};

type EmailFormatCommand =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bold'
  | 'italic'
  | 'unorderedList'
  | 'dashedList'
  | 'orderedList'
  | 'divider';

function EmailBodyEditor({
  ariaLabel,
  isUploadingImage,
  onAddImage,
  onChange,
  pendingImage,
  value,
}: {
  ariaLabel: string;
  isUploadingImage: boolean;
  onAddImage: () => void;
  onChange: (value: string) => void;
  pendingImage: PendingEmailImage | null;
  value: string;
}) {
  const segments = parseEmailBodySegments(value);
  const activeTextSegmentRef = useRef(0);
  const textSegmentRefs = useRef(new Map<number, EmailTextSegmentEditorHandle>());

  function activeEditor() {
    return textSegmentRefs.current.get(activeTextSegmentRef.current)
      || textSegmentRefs.current.values().next().value;
  }

  const applyFormat = (format: EmailFormatCommand) => activeEditor()?.applyFormat(format);
  const toolbarButton = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-700 transition hover:bg-white hover:text-ink-950';

  return (
    <div className="space-y-3">
      <div
        aria-label={`${ariaLabel} formatting`}
        className="flex flex-wrap items-center gap-1 rounded-lg border border-ink-200 bg-ink-50 p-1.5"
        role="toolbar"
      >
        <button
          aria-label="Paragraph"
          className={toolbarButton}
          onClick={() => applyFormat('paragraph')}
          onMouseDown={(event) => event.preventDefault()}
          title="Paragraph"
          type="button"
        >
          <Pilcrow className="h-4 w-4" />
        </button>
        <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-ink-200" />
        {([
          ['heading1', Heading1, 'Heading 1'],
          ['heading2', Heading2, 'Heading 2'],
          ['heading3', Heading3, 'Heading 3'],
        ] as const).map(([format, Icon, label]) => (
          <button
            aria-label={label}
            className={toolbarButton}
            key={format}
            onClick={() => applyFormat(format)}
            onMouseDown={(event) => event.preventDefault()}
            title={label}
            type="button"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
        <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-ink-200" />
        <button
          aria-label="Bold"
          className={toolbarButton}
          onClick={() => applyFormat('bold')}
          onMouseDown={(event) => event.preventDefault()}
          title="Bold"
          type="button"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          aria-label="Italic"
          className={toolbarButton}
          onClick={() => applyFormat('italic')}
          onMouseDown={(event) => event.preventDefault()}
          title="Italic"
          type="button"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          aria-label="Bulleted list"
          className={toolbarButton}
          onClick={() => applyFormat('unorderedList')}
          onMouseDown={(event) => event.preventDefault()}
          title="Bulleted list"
          type="button"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          aria-label="Dashed list"
          className={toolbarButton}
          onClick={() => applyFormat('dashedList')}
          onMouseDown={(event) => event.preventDefault()}
          title="Dashed list"
          type="button"
        >
          <ListMinus className="h-4 w-4" />
        </button>
        <button
          aria-label="Numbered list"
          className={toolbarButton}
          onClick={() => applyFormat('orderedList')}
          onMouseDown={(event) => event.preventDefault()}
          title="Numbered list"
          type="button"
        >
          <ListOrdered className="h-4 w-4" />
        </button>
        <button
          aria-label="Divider"
          className={toolbarButton}
          onClick={() => applyFormat('divider')}
          onMouseDown={(event) => event.preventDefault()}
          title="Divider"
          type="button"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-ink-200" />
        <button
          aria-label="Insert name variable"
          className={toolbarButton}
          onClick={() => activeEditor()?.insertVariable('{name}')}
          onMouseDown={(event) => event.preventDefault()}
          title="Insert name variable"
          type="button"
        >
          <Braces className="h-4 w-4" />
        </button>
        <button
          aria-label="Add link"
          className={toolbarButton}
          onClick={() => activeEditor()?.openLinkEditor()}
          onMouseDown={(event) => event.preventDefault()}
          title="Add link"
          type="button"
        >
          <Link2 className="h-4 w-4" />
        </button>
        <button
          aria-label={isUploadingImage ? 'Uploading image' : 'Add image'}
          className={`${toolbarButton} disabled:pointer-events-none disabled:opacity-50`}
          disabled={isUploadingImage}
          onClick={onAddImage}
          title={isUploadingImage ? 'Uploading image' : 'Add image'}
          type="button"
        >
          {isUploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
        </button>
      </div>
      {segments.map((segment, index) => {
        if (segment.kind === 'image') {
          return (
            <div
              className="group/email-image relative overflow-hidden rounded-lg border border-ink-200 bg-ink-50"
              key={`image-${index}-${segment.url}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={segment.alt}
                className="max-h-96 w-full object-contain"
                src={segment.url}
              />
              <button
                aria-label={`Remove ${segment.alt}`}
                className="absolute right-2 top-2 inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-200 bg-white/95 px-2.5 text-xs font-medium text-red-600 shadow-sm backdrop-blur transition hover:bg-red-50"
                onClick={(event) => {
                  event.preventDefault();
                  onChange(removeEmailBodySegment(value, index));
                }}
                type="button"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            </div>
          );
        }

        const trimmedText = segment.raw.trim();
        const visibleLines = trimmedText
          ? Math.max(2, Math.min(10, trimmedText.split('\n').length + 1))
          : 2;
        return (
          <div className="space-y-1" key={`text-${index}`}>
            {index > 0 && segments[index - 1]?.kind === 'image' && (
              <p className="px-2 text-[11px] font-medium text-ink-400">Text below image</p>
            )}
            <EmailTextSegmentEditor
              ariaLabel={segments.length === 1 ? ariaLabel : `${ariaLabel}, text section ${index + 1}`}
              onFocus={() => {
                activeTextSegmentRef.current = index;
              }}
              onChange={(nextText) => onChange(replaceEmailBodySegment(value, index, nextText))}
              placeholder={index === 0
                ? 'Write the email. Use {name} for the recipient.'
                : 'Continue writing below the image...'}
              ref={(editor) => {
                if (editor) textSegmentRefs.current.set(index, editor);
                else textSegmentRefs.current.delete(index);
              }}
              rows={visibleLines}
              value={segment.raw}
            />
          </div>
        );
      })}

      {pendingImage && (
        <div className="relative overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Uploading email image"
            className="max-h-96 w-full object-contain opacity-75"
            src={pendingImage.previewUrl}
          />
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-white/90 px-3 py-2 text-xs font-medium text-ink-700 backdrop-blur">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Uploading{pendingImage.progress > 0 ? ` ${pendingImage.progress}%` : ''}
          </div>
        </div>
      )}
    </div>
  );
}

type EmailLinkDraft = {
  error: string;
  label: string;
  url: string;
};

function serializeEmailEditorInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (!(node instanceof HTMLElement)) return '';
  if (node.tagName === 'BR') return '\n';

  if (node.tagName === 'A') {
    const label = (node.textContent || '').replace(/\s+/g, ' ').trim();
    const href = normaliseEmailLinkUrl(node.getAttribute('href') || '');
    if (!label || !href) return label;

    const labelUrl = /^(?:https?:\/\/|www\.)/i.test(label)
      ? normaliseEmailLinkUrl(label)
      : null;
    if (labelUrl === href) return label;

    const safeLabel = label.replace(/[\[\]]/g, '');
    return `[${safeLabel}](${href})`;
  }

  const children = Array.from(node.childNodes).map(serializeEmailEditorInline).join('');
  if (node.tagName === 'STRONG' || node.tagName === 'B') return children ? `**${children}**` : '';
  if (node.tagName === 'EM' || node.tagName === 'I') return children ? `*${children}*` : '';
  return children;
}

function serializeEmailEditorBlock(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (!(node instanceof HTMLElement)) return '';

  if (node.tagName === 'H1') return `# ${serializeEmailEditorInline(node).trim()}\n\n`;
  if (node.tagName === 'H2') return `## ${serializeEmailEditorInline(node).trim()}\n\n`;
  if (node.tagName === 'H3') return `### ${serializeEmailEditorInline(node).trim()}\n\n`;
  if (node.tagName === 'HR') return '---\n\n';
  if (node.tagName === 'UL' || node.tagName === 'OL') {
    const ordered = node.tagName === 'OL';
    const dashed = node.tagName === 'UL' && node.dataset.emailListStyle === 'dash';
    const items = Array.from(node.children)
      .filter((child) => child.tagName === 'LI')
      .map((child, index) => `${dashed ? '–' : ordered ? `${index + 1}.` : '-'} ${serializeEmailEditorInline(child).trim()}`)
        .filter((item) => !/^(?:[-–—]|\d+\.)\s*$/.test(item));
    return items.length ? `${items.join('\n')}\n\n` : '';
  }
  if (node.tagName === 'P' || node.tagName === 'DIV') {
    const containsBlock = Array.from(node.children).some((child) =>
      ['H1', 'H2', 'H3', 'HR', 'UL', 'OL', 'P', 'DIV'].includes(child.tagName)
    );
    const content = containsBlock
      ? Array.from(node.childNodes).map(serializeEmailEditorBlock).join('')
      : serializeEmailEditorInline(node);
    return `${content}\n\n`;
  }
  if (node.tagName === 'BR') return '\n';
  return serializeEmailEditorInline(node);
}

function extractEmailEditorValue(element: HTMLElement) {
  return Array.from(element.childNodes)
    .map(serializeEmailEditorBlock)
    .join('')
    .replace(/ /g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '');
}

const EmailTextSegmentEditor = forwardRef<EmailTextSegmentEditorHandle, {
  ariaLabel: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  placeholder: string;
  rows: number;
  value: string;
}>(function EmailTextSegmentEditor({
  ariaLabel,
  onChange,
  onFocus,
  placeholder,
  rows,
  value,
}, ref) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const lastEmittedRef = useRef('');
  const [linkDraft, setLinkDraft] = useState<EmailLinkDraft | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor || value === lastEmittedRef.current) return;
    editor.innerHTML = renderEmailEditorHtml(value);
    lastEmittedRef.current = value;
  }, [value]);

  function rangeAtEditorEnd() {
    const editor = editorRef.current;
    if (!editor) return null;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    return range;
  }

  function currentEditorRange() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return rangeAtEditorEnd();

    const range = selection.getRangeAt(0);
    if (range.commonAncestorContainer === editor || editor.contains(range.commonAncestorContainer)) {
      return range;
    }
    return rangeAtEditorEnd();
  }

  function selectRange(range: Range) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function linkContaining(node: Node) {
    const editor = editorRef.current;
    const element = node instanceof HTMLElement ? node : node.parentElement;
    const anchor = element?.closest('a');
    return editor && anchor && editor.contains(anchor) ? anchor : null;
  }

  function adjacentLink(range: Range, inputType: string) {
    if (!range.collapsed || !inputType.startsWith('delete')) return null;
    const backward = inputType.toLowerCase().includes('backward');
    const forward = inputType.toLowerCase().includes('forward');
    if (!backward && !forward) return null;

    const container = range.startContainer;
    const offset = range.startOffset;
    let candidate: ChildNode | null = null;

    if (container.nodeType === Node.TEXT_NODE) {
      if (backward && offset === 0) candidate = container.previousSibling;
      if (forward && offset === (container.textContent || '').length) candidate = container.nextSibling;
    } else if (container instanceof HTMLElement) {
      candidate = backward
        ? container.childNodes.item(offset - 1)
        : container.childNodes.item(offset);
    }

    return candidate ? linkContaining(candidate) : null;
  }

  function textOffsetWithin(element: HTMLElement, node: Node, offset: number) {
    const measure = document.createRange();
    measure.selectNodeContents(element);
    measure.setEnd(node, offset);
    return measure.toString().length;
  }

  function unlinkForMutation(inputType: string) {
    if (!inputType.startsWith('insert') && !inputType.startsWith('delete')) return;

    const range = currentEditorRange();
    if (!range) return;
    const anchor = linkContaining(range.startContainer)
      || linkContaining(range.endContainer)
      || adjacentLink(range, inputType);
    if (!anchor) return;

    const text = anchor.textContent || '';
    const startInside = range.startContainer === anchor || anchor.contains(range.startContainer);
    const endInside = range.endContainer === anchor || anchor.contains(range.endContainer);
    const startOffset = startInside
      ? textOffsetWithin(anchor, range.startContainer, range.startOffset)
      : range.startOffset;
    const endOffset = endInside
      ? textOffsetWithin(anchor, range.endContainer, range.endOffset)
      : range.endOffset;
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;
    const textNode = document.createTextNode(text);

    anchor.replaceWith(textNode);

    const nextRange = document.createRange();
    if (startInside) nextRange.setStart(textNode, Math.min(startOffset, text.length));
    else nextRange.setStart(startContainer, startOffset);
    if (endInside) nextRange.setEnd(textNode, Math.min(endOffset, text.length));
    else nextRange.setEnd(endContainer, endOffset);

    if (range.collapsed && !startInside && !endInside) {
      const caret = inputType.toLowerCase().includes('backward') ? text.length : 0;
      nextRange.setStart(textNode, caret);
      nextRange.collapse(true);
    }

    selectRange(nextRange);
  }

  function emitChange() {
    const editor = editorRef.current;
    if (!editor) return;
    const nextValue = extractEmailEditorValue(editor);
    lastEmittedRef.current = nextValue;
    onChange(nextValue);
  }

  function listContainingRange(range: Range | null) {
    const editor = editorRef.current;
    if (!editor || !range) return null;
    const element = range.startContainer instanceof HTMLElement
      ? range.startContainer
      : range.startContainer.parentElement;
    const list = element?.closest('ul, ol');
    return list && editor.contains(list) ? list as HTMLElement : null;
  }

  function applyListFormat(format: 'unorderedList' | 'dashedList' | 'orderedList') {
    const currentList = listContainingRange(currentEditorRange());

    if (format === 'dashedList' && currentList?.tagName === 'UL') {
      if (currentList.dataset.emailListStyle === 'dash') {
        delete currentList.dataset.emailListStyle;
        document.execCommand('insertUnorderedList');
      } else {
        currentList.dataset.emailListStyle = 'dash';
      }
      return;
    }

    if (
      format === 'unorderedList'
      && currentList?.tagName === 'UL'
      && currentList.dataset.emailListStyle === 'dash'
    ) {
      delete currentList.dataset.emailListStyle;
      return;
    }

    if (format === 'orderedList' && currentList?.dataset.emailListStyle === 'dash') {
      delete currentList.dataset.emailListStyle;
    }

    document.execCommand(
      format === 'orderedList' ? 'insertOrderedList' : 'insertUnorderedList'
    );

    const updatedList = listContainingRange(currentEditorRange());
    if (updatedList?.tagName === 'UL') {
      if (format === 'dashedList') updatedList.dataset.emailListStyle = 'dash';
      else delete updatedList.dataset.emailListStyle;
    }
  }

  function insertAtRange(range: Range, node: Node) {
    range.deleteContents();
    range.insertNode(node);
    const nextRange = document.createRange();
    nextRange.setStartAfter(node);
    nextRange.collapse(true);
    selectRange(nextRange);
    emitChange();
  }

  function openLinkEditor() {
    const range = currentEditorRange();
    if (!range) return;
    savedRangeRef.current = range.cloneRange();

    setLinkDraft({
      error: '',
      label: range.toString(),
      url: '',
    });
    requestAnimationFrame(() => urlInputRef.current?.focus());
  }

  function insertVariable(value: string) {
    const range = currentEditorRange();
    if (!range) return;
    insertAtRange(range, document.createTextNode(value));
  }

  function applyFormat(format: EmailFormatCommand) {
    const range = currentEditorRange();
    if (!range) return;
    selectRange(range);

    if (format === 'paragraph') document.execCommand('formatBlock', false, 'p');
    if (format === 'heading1') document.execCommand('formatBlock', false, 'h1');
    if (format === 'heading2') document.execCommand('formatBlock', false, 'h2');
    if (format === 'heading3') document.execCommand('formatBlock', false, 'h3');
    if (format === 'bold') document.execCommand('bold');
    if (format === 'italic') document.execCommand('italic');
    if (
      format === 'unorderedList'
      || format === 'dashedList'
      || format === 'orderedList'
    ) applyListFormat(format);
    if (format === 'divider') document.execCommand('insertHorizontalRule');

    emitChange();
  }

  useImperativeHandle(ref, () => ({ applyFormat, insertVariable, openLinkEditor }));

  function addLink() {
    if (!linkDraft) return;
    const label = linkDraft.label.replace(/\s+/g, ' ').replace(/[\[\]]/g, '').trim();
    const href = normaliseEmailLinkUrl(linkDraft.url);

    if (!label || !href) {
      setLinkDraft((current) => current
        ? {
            ...current,
            error: current.label.trim()
              ? 'Paste a valid web or email link.'
              : 'Enter the words people should click.',
          }
        : current);
      return;
    }

    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.textContent = label;
    anchor.style.color = 'inherit';
    anchor.style.textDecoration = 'underline';
    anchor.style.textUnderlineOffset = '2px';

    const range = savedRangeRef.current || rangeAtEditorEnd();
    if (!range) return;
    insertAtRange(range, anchor);
    savedRangeRef.current = null;
    setLinkDraft(null);
  }

  return (
    <div className="rounded-lg border border-ink-200 bg-white transition focus-within:border-ink-400 focus-within:ring-1 focus-within:ring-ink-200">
      <div
        aria-label={ariaLabel}
        aria-multiline="true"
        className="email-rich-editor relative w-full whitespace-pre-wrap break-words px-4 py-3 text-base leading-6 text-ink-900 outline-none sm:text-sm"
        contentEditable
        data-empty={!value || undefined}
        data-placeholder={placeholder}
        onBeforeInput={(event) => {
          unlinkForMutation((event.nativeEvent as InputEvent).inputType || '');
        }}
        onBlur={emitChange}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) event.preventDefault();
        }}
        onFocus={onFocus}
        onInput={emitChange}
        onPointerDown={onFocus}
        onPaste={(event) => {
          event.preventDefault();
          unlinkForMutation('insertFromPaste');
          const pastedText = event.clipboardData.getData('text/plain');
          const range = currentEditorRange();
          if (!range) return;

          const pastedUrl = /^(?:https?:\/\/|www\.)\S+$/i.test(pastedText.trim())
            ? normaliseEmailLinkUrl(pastedText)
            : null;
          if (pastedUrl) {
            const anchor = document.createElement('a');
            anchor.href = pastedUrl;
            anchor.textContent = range.collapsed ? pastedText.trim() : range.toString();
            anchor.style.color = 'inherit';
            anchor.style.textDecoration = 'underline';
            anchor.style.textUnderlineOffset = '2px';
            insertAtRange(range, anchor);
            return;
          }

          insertAtRange(range, document.createTextNode(pastedText));
        }}
        ref={editorRef}
        role="textbox"
        style={{ minHeight: `${Math.max(rows, 2) * 1.5 + 0.5}rem` }}
        suppressContentEditableWarning
      />

      {linkDraft && (
        <div className="m-1 space-y-2 rounded-md border border-ink-200 bg-ink-50 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-ink-600">Text to display</span>
              <AceternityInput
                onChange={(event) => setLinkDraft((current) => current
                  ? { ...current, error: '', label: event.target.value }
                  : current)}
                placeholder="Read the guide"
                value={linkDraft.label}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-ink-600">Link</span>
              <AceternityInput
                inputMode="url"
                onChange={(event) => setLinkDraft((current) => current
                  ? { ...current, error: '', url: event.target.value }
                  : current)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addLink();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setLinkDraft(null);
                    const range = savedRangeRef.current;
                    savedRangeRef.current = null;
                    if (range) requestAnimationFrame(() => selectRange(range));
                  }
                }}
                placeholder="https://example.com"
                ref={urlInputRef}
                value={linkDraft.url}
              />
            </label>
          </div>
          {linkDraft.error && (
            <p className="text-xs text-red-600" role="alert">{linkDraft.error}</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              className="h-8 rounded-md px-2.5 text-xs font-medium text-ink-600 transition hover:bg-white"
              onClick={() => {
                const range = savedRangeRef.current;
                setLinkDraft(null);
                savedRangeRef.current = null;
                if (range) requestAnimationFrame(() => selectRange(range));
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-ink-950 px-3 text-xs font-semibold text-white transition hover:bg-ink-800"
              onClick={addLink}
              type="button"
            >
              <Link2 className="h-3.5 w-3.5" />
              Add link
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

function EmailCanvas({
  account,
  isUploadingEmailImage,
  leadMagnet,
  onAddImage,
  onPatch,
  pendingImage,
}: {
  account: DashboardBasePayload['account'];
  isUploadingEmailImage: boolean;
  leadMagnet: LeadMagnet;
  onAddImage: () => void;
  onPatch: (updates: Partial<LeadMagnet>) => void;
  pendingImage: PendingEmailImage | null;
}) {
  return (
    <div className="bg-ink-50 px-4 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-lg border border-ink-200 bg-white">
          <div className="flex items-center gap-2 border-b border-ink-200 bg-ink-50 px-5 py-3 text-xs text-ink-500">
            <Mail className="h-4 w-4 text-ink-700" />
            <span className="font-medium">Email preview</span>
            <span className="ml-auto font-mono text-[10px]">{account.resendFromEmail || 'Magnets <hello@mail.magnets.so>'}</span>
          </div>

          <div className="space-y-2 border-b border-ink-200 bg-white px-5 py-4">
            <label className="block">
              <span className="text-[11px] font-medium text-ink-500">Subject</span>
              <InlineText
                ariaLabel="Email subject"
                as="div"
                className="block text-base font-semibold text-ink-900"
                emptyPlaceholder="What people see in the inbox"
                maxLength={140}
                onChange={(value) => onPatch({ emailSubject: value })}
                value={leadMagnet.emailSubject}
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-ink-500">Preview text</span>
              <InlineText
                ariaLabel="Email preview text"
                as="div"
                className="block text-sm text-ink-600"
                emptyPlaceholder="A short teaser shown after the subject"
                maxLength={160}
                onChange={(value) => onPatch({ emailPreview: value })}
                value={leadMagnet.emailPreview}
              />
            </label>
          </div>

          <div className="px-6 py-7">
            <p className="mb-3 text-xs font-medium text-ink-700">Body</p>
            <EmailBodyEditor
              ariaLabel="Email body"
              isUploadingImage={isUploadingEmailImage}
              onAddImage={onAddImage}
              onChange={(value) => onPatch({ emailBody: value })}
              pendingImage={pendingImage}
              value={leadMagnet.emailBody}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SequenceCanvas({
  account,
  emailImageUploadTarget,
  leadMagnet,
  onAddImage,
  onPatch,
  onUpdateEmail,
  pendingImage,
}: {
  account: DashboardBasePayload['account'];
  emailImageUploadTarget: EmailImageTarget | null;
  leadMagnet: LeadMagnet;
  onAddImage: (emailId: string) => void;
  onPatch: (updates: Partial<LeadMagnet>) => void;
  onUpdateEmail: (
    emailId: string,
    updates: Partial<LeadMagnet['followUpEmails'][number]>
  ) => void;
  pendingImage: PendingEmailImage | null;
}) {
  const [delayDrafts, setDelayDrafts] = useState<Record<string, string>>({});
  const resendConfigured = account.resendConfigured;
  const calendarConnected = Boolean(account.calendarWebhookEnabled && account.calendarProvider);
  const calendarProviderLabel =
    account.calendarProvider === 'calendly'
      ? 'Calendly'
      : account.calendarProvider === 'calcom'
        ? 'Cal.com'
        : 'a calendar provider';

  function updateEmail(index: number, updates: Partial<LeadMagnet['followUpEmails'][number]>) {
    const email = leadMagnet.followUpEmails[index];
    if (!email) return;
    onUpdateEmail(email.id, updates);
  }

  function updateDelayDraft(emailId: string, value: string) {
    setDelayDrafts((current) => ({ ...current, [emailId]: value }));
  }

  function clearDelayDraft(emailId: string) {
    setDelayDrafts((current) => {
      if (!(emailId in current)) return current;
      const next = { ...current };
      delete next[emailId];
      return next;
    });
  }

  function addEmail() {
    if (!leadMagnet.followUpEnabled || leadMagnet.followUpEmails.length >= 10) return;
    onPatch({
      followUpEmails: [
        ...leadMagnet.followUpEmails,
        newFollowUpEmail(),
      ],
    });
  }

  return (
    <div className="bg-ink-50 px-4 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-4">
        {!resendConfigured && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-semibold">Magnets-managed sending is not available yet.</p>
            <p className="mt-1 text-xs leading-5">
              Contact support before enabling a follow-up sequence.
            </p>
          </div>
        )}

        <div className="rounded-lg border border-ink-200 bg-white p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink-950">Follow-up sequence</p>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-600">
                Send extra emails after the lead magnet email. Delays are counted from the previous email or from signup for the first one.
              </p>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-ink-500">
                Magnets creates the events, templates, and automation for this sequence after your sender domain is ready.
              </p>
            </div>
            <button
              aria-pressed={leadMagnet.followUpEnabled}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-2 rounded-full border px-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
                leadMagnet.followUpEnabled
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-ink-200 bg-white text-ink-600'
              )}
              disabled={!resendConfigured}
              onClick={() => onPatch({
                followUpEnabled: !leadMagnet.followUpEnabled,
                ...(!leadMagnet.followUpEnabled ? {} : { followUpStopOnBooking: false }),
              })}
              type="button"
            >
              <span
                className={cn(
                  'block h-4 w-4 rounded-full transition',
                  leadMagnet.followUpEnabled ? 'bg-emerald-500' : 'bg-ink-300'
                )}
              />
              {leadMagnet.followUpEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              aria-pressed={leadMagnet.followUpEnabled && leadMagnet.followUpStopOnBooking}
              className={cn(
                'flex min-h-16 items-start gap-3 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50',
                leadMagnet.followUpEnabled && leadMagnet.followUpStopOnBooking
                  ? 'border-ink-950 bg-ink-950 text-white'
                  : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
              )}
              disabled={!leadMagnet.followUpEnabled}
              onClick={() => onPatch({ followUpStopOnBooking: !leadMagnet.followUpStopOnBooking })}
              type="button"
            >
              <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="block text-sm font-semibold">Stop when a call is booked</span>
                <span className={cn('mt-1 block text-xs leading-5', leadMagnet.followUpEnabled && leadMagnet.followUpStopOnBooking ? 'text-white/70' : 'text-ink-500')}>
                  Calendly and Cal.com booking-created webhooks stop this magnet&apos;s sequence for that email.
                </span>
              </span>
            </button>
            <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
              <p className="text-xs font-medium text-ink-500">Calendar connection</p>
              <p className="mt-2 text-xs leading-5 text-ink-600">
                {calendarConnected
                  ? `${calendarProviderLabel} is connected on this account. If this option is on, a booked call from the same email stops this magnet's active sequence.`
                  : 'Connect Calendly or Cal.com in Configure to let booked calls stop this sequence.'}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {leadMagnet.followUpEmails.length === 0 && (
            <div className="rounded-lg border border-dashed border-ink-300 bg-white p-6 text-center">
              <p className="text-sm font-semibold text-ink-950">No follow-up emails yet</p>
              <p className="mt-1 text-xs text-ink-500">Add up to 10 emails to build this magnet&apos;s sequence.</p>
            </div>
          )}

          {leadMagnet.followUpEmails.map((email, index) => {
            const delayMinutes = followUpDelayMinutes(email);
            const delayUnit = followUpDelayUnit(delayMinutes);
            const delayValue = delayUnit === 'hours' ? delayMinutes / 60 : delayMinutes;
            const delayInputValue = delayDrafts[email.id] ?? String(delayValue);

            return (
              <div key={email.id} className="rounded-lg border border-ink-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 bg-ink-50 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-ink-700" />
                    <p className="text-sm font-semibold text-ink-950">Email {index + 1}</p>
                  </div>
                  <button
                    aria-label={`Remove email ${index + 1}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-red-600 transition hover:bg-red-50"
                    onClick={() =>
                      onPatch({
                        followUpEmails: leadMagnet.followUpEmails.filter((_, emailIndex) => emailIndex !== index),
                      })
                    }
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>

                <div className="space-y-4 p-5">
                  <label className="block">
                    <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-700">
                      <Clock className="h-3.5 w-3.5" />
                      Delay from previous email
                    </span>
                    <div className="flex max-w-sm items-center gap-2">
                      <AceternityInput
                        inputMode="numeric"
                        onChange={(event) => {
                          const rawValue = event.target.value.trim();
                          if (!/^\d*$/.test(rawValue)) return;
                          updateDelayDraft(email.id, rawValue);
                          const value = rawValue === '' ? 0 : Number(rawValue);
                          updateEmail(
                            index,
                            delayPatchFromMinutes(delayUnit === 'hours' ? value * 60 : value)
                          );
                        }}
                        onBlur={() => clearDelayDraft(email.id)}
                        pattern="[0-9]*"
                        type="text"
                        value={delayInputValue}
                      />
                      <select
                        aria-label={`Delay unit for email ${index + 1}`}
                        className="h-11 rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-800 outline-none transition focus:border-ink-500 focus:ring-2 focus:ring-ink-100"
                        onChange={(event) => {
                          const nextUnit = event.target.value === 'minutes' ? 'minutes' : 'hours';
                          const value = delayInputValue === '' ? 0 : Number(delayInputValue);
                          clearDelayDraft(email.id);
                          updateEmail(
                            index,
                            delayPatchFromMinutes(nextUnit === 'hours' ? value * 60 : value)
                          );
                        }}
                        value={delayUnit}
                      >
                        <option value="minutes">minutes</option>
                        <option value="hours">hours</option>
                      </select>
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-ink-700">Subject</span>
                    <AceternityInput
                      onChange={(event) => updateEmail(index, { subject: event.target.value })}
                      placeholder="Quick follow-up"
                      value={email.subject}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-ink-700">Preview text</span>
                    <AceternityInput
                      onChange={(event) => updateEmail(index, { preview: event.target.value })}
                      placeholder="Short inbox teaser"
                      value={email.preview}
                    />
                  </label>

                  <div className="block">
                    <p className="mb-1.5 text-xs font-medium text-ink-700">Body</p>
                    <EmailBodyEditor
                      ariaLabel={`Body for email ${index + 1}`}
                      isUploadingImage={Boolean(emailImageUploadTarget)}
                      onAddImage={() => onAddImage(email.id)}
                      onChange={(value) => onUpdateEmail(email.id, { body: value })}
                      pendingImage={pendingImage?.target.kind === 'follow-up' && pendingImage.target.emailId === email.id
                        ? pendingImage
                        : null}
                      value={email.body}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <AceternityButton
            disabled={!leadMagnet.followUpEnabled || leadMagnet.followUpEmails.length >= 10}
            onClick={addEmail}
            title={!leadMagnet.followUpEnabled ? 'Enable the follow-up sequence first.' : undefined}
            type="button"
            variant="secondary"
          >
            <Plus className="h-4 w-4" />
            Add email
          </AceternityButton>
        </div>
      </div>
    </div>
  );
}

function AfterSignupCanvas({
  leadMagnet,
  onPatch,
}: {
  leadMagnet: LeadMagnet;
  onPatch: (updates: Partial<LeadMagnet>) => void;
}) {
  const quizQuestions = leadMagnet.postSignupQuizQuestions;
  const quizRoutes = leadMagnet.postSignupQuizRoutes;
  const [routingOpen, setRoutingOpen] = useState(quizRoutes.length > 0);

  function patchQuestion(questionIndex: number, updates: Partial<LeadMagnet['postSignupQuizQuestions'][number]>) {
    onPatch({
      postSignupQuizQuestions: quizQuestions.map((question, index) =>
        index === questionIndex ? { ...question, ...updates } : question
      ),
    });
  }

  function patchOption(questionIndex: number, optionIndex: number, updates: Partial<LeadMagnet['postSignupQuizQuestions'][number]['options'][number]>) {
    const question = quizQuestions[questionIndex];
    if (!question) return;
    patchQuestion(questionIndex, {
      options: question.options.map((option, index) => index === optionIndex ? { ...option, ...updates } : option),
    });
  }

  function patchRoute(routeIndex: number, updates: Partial<LeadMagnet['postSignupQuizRoutes'][number]>) {
    onPatch({
      postSignupQuizRoutes: quizRoutes.map((route, index) => index === routeIndex ? { ...route, ...updates } : route),
    });
  }

  function patchRouteCondition(routeIndex: number, questionId: string, optionId: string) {
    const route = quizRoutes[routeIndex];
    if (!route) return;
    const conditions = route.conditions.filter((condition) => condition.questionId !== questionId);
    if (optionId) conditions.push({ questionId, optionId });
    patchRoute(routeIndex, { conditions });
  }

  return (
    <div className="bg-ink-50 px-4 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="rounded-lg border border-ink-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-ink-50 text-ink-800">
              <Check className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink-950">What happens after someone opts in?</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-600">
                Keep it simple: show a confirmation, take them straight to another URL, or give them a useful next step on a short page.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {([
              ['message', 'Standard confirmation', 'Show the email confirmation message.'],
              ['redirect', 'Send them elsewhere', 'Open a URL as soon as the form is submitted.'],
              ['page', 'Custom next step', 'Show your own message, video, or offer.'],
            ] as const).map(([mode, title, description]) => (
              <button
                aria-pressed={leadMagnet.postSignupMode === mode}
                className={cn(
                  'rounded-lg border p-4 text-left transition',
                  leadMagnet.postSignupMode === mode
                    ? 'border-ink-950 bg-ink-950 text-white dark:text-[#111111]'
                    : 'border-ink-200 bg-white text-ink-800 hover:bg-ink-50'
                )}
                key={mode}
                onClick={() => onPatch({
                  postSignupMode: mode,
                  ...(mode !== 'page' ? { postSignupQuizEnabled: false } : {}),
                })}
                type="button"
              >
                <span className="block text-sm font-semibold">{title}</span>
                <span className={cn(
                  'mt-1 block text-xs leading-5',
                  leadMagnet.postSignupMode === mode
                    ? 'text-white/70 dark:text-[#4a2518]'
                    : 'text-ink-500'
                )}>
                  {description}
                </span>
              </button>
            ))}
          </div>

          {leadMagnet.postSignupMode !== 'page' && (
            <p className="mt-3 text-xs leading-5 text-ink-500">
              A quiz funnel is available with Custom next step.
            </p>
          )}

          {leadMagnet.postSignupMode === 'redirect' && (
            <label className="mt-5 block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-700">
                <ExternalLink className="h-3.5 w-3.5" />
                Destination URL
              </span>
              <AceternityInput
                onChange={(event) => onPatch({ postSignupRedirectUrl: event.target.value })}
                placeholder="https://your-site.com/next-step"
                value={leadMagnet.postSignupRedirectUrl}
              />
              <span className="mt-1.5 block text-xs text-ink-500">They will be taken here straight after a successful signup.</span>
            </label>
          )}

          {leadMagnet.postSignupMode === 'page' && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-ink-700">Heading</span>
                <AceternityInput
                  onChange={(event) => onPatch({ postSignupHeading: event.target.value })}
                  placeholder="You are in. Here is what to do next."
                  value={leadMagnet.postSignupHeading}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-ink-700">Message</span>
                <AceternityTextarea
                  onChange={(event) => onPatch({ postSignupBody: event.target.value })}
                  placeholder="Set expectations, introduce an offer, or explain the next step."
                  rows={4}
                  value={leadMagnet.postSignupBody}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-700">
                  <Video className="h-3.5 w-3.5" />
                  Loom or YouTube URL
                </span>
                <AceternityInput
                  onChange={(event) => onPatch({ postSignupVideoUrl: event.target.value })}
                  placeholder="https://www.loom.com/share/..."
                  value={leadMagnet.postSignupVideoUrl}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-ink-700">Button label</span>
                <AceternityInput
                  onChange={(event) => onPatch({ postSignupCtaLabel: event.target.value })}
                  placeholder="Book a call"
                  value={leadMagnet.postSignupCtaLabel}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-ink-700">Button URL</span>
                <AceternityInput
                  onChange={(event) => onPatch({ postSignupCtaUrl: event.target.value })}
                  placeholder="https://cal.com/..."
                  value={leadMagnet.postSignupCtaUrl}
                />
              </label>
            </div>
          )}
        </div>

        {leadMagnet.postSignupMode === 'page' && (
          <div className="rounded-lg border border-ink-200 bg-white p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-ink-50 text-ink-800">
                  <ListChecks className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-ink-950">Add a quiz funnel</h2>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-600">
                    Ask a short series of questions after signup. Save every answer, then optionally route people based on their responses.
                  </p>
                </div>
              </div>
              <button
                aria-pressed={leadMagnet.postSignupQuizEnabled}
                className={cn(
                  'inline-flex h-8 shrink-0 items-center gap-2 rounded-full border px-2 text-xs font-semibold transition',
                  leadMagnet.postSignupQuizEnabled
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-ink-200 bg-white text-ink-600'
                )}
                onClick={() => onPatch({
                  postSignupQuizEnabled: !leadMagnet.postSignupQuizEnabled,
                  postSignupQuizQuestions: leadMagnet.postSignupQuizQuestions.length
                    ? leadMagnet.postSignupQuizQuestions
                    : [newQuizQuestion()],
                })}
                type="button"
              >
                <span className={cn('block h-4 w-4 rounded-full', leadMagnet.postSignupQuizEnabled ? 'bg-emerald-500' : 'bg-ink-300')} />
                {leadMagnet.postSignupQuizEnabled ? 'Enabled' : 'Off'}
              </button>
            </div>

            {leadMagnet.postSignupQuizEnabled && (
              <div className="mt-5 space-y-4 border-t border-ink-100 pt-5">
                <section>
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold text-ink-950">Quiz intro</h3>
                    <p className="mt-0.5 text-xs text-ink-500">Shown before the first question.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-ink-700">Heading</span>
                      <AceternityInput
                        onChange={(event) => onPatch({ postSignupQuizTitle: event.target.value })}
                        placeholder="A couple of quick questions"
                        value={leadMagnet.postSignupQuizTitle}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-ink-700">Supporting text</span>
                      <AceternityInput
                        onChange={(event) => onPatch({ postSignupQuizDescription: event.target.value })}
                        placeholder="Help us point you in the right direction"
                        value={leadMagnet.postSignupQuizDescription}
                      />
                    </label>
                  </div>
                </section>

                <section className="border-t border-ink-100 pt-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-ink-950">Questions</h3>
                      <p className="mt-0.5 text-xs text-ink-500">Everyone answers these in order.</p>
                    </div>
                    {quizQuestions.length < 5 && (
                      <AceternityButton
                        onClick={() => onPatch({ postSignupQuizQuestions: [...quizQuestions, newQuizQuestion()] })}
                        type="button"
                        variant="secondary"
                      >
                        <Plus className="h-4 w-4" />
                        Add question
                      </AceternityButton>
                    )}
                  </div>

                  <div className="space-y-3">
                    {quizQuestions.map((question, questionIndex) => (
                      <div className="rounded-lg border border-ink-200 bg-white p-4" key={question.id}>
                        <div className="flex items-center gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-950 text-xs font-semibold text-white">
                            {questionIndex + 1}
                          </span>
                          <AceternityInput
                            aria-label={`Question ${questionIndex + 1}`}
                            className="flex-1"
                            onChange={(event) => patchQuestion(questionIndex, { prompt: event.target.value })}
                            placeholder="Write your question"
                            value={question.prompt}
                          />
                          <button
                            aria-label={`Remove question ${questionIndex + 1}`}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                            disabled={quizQuestions.length <= 1}
                            onClick={() => {
                              const nextQuestions = quizQuestions.filter((_, index) => index !== questionIndex);
                              onPatch({
                                postSignupQuizQuestions: nextQuestions,
                                postSignupQuizRoutes: pruneQuizRouteConditions(nextQuestions, quizRoutes),
                              });
                            }}
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="ml-0 mt-3 space-y-2 sm:ml-10">
                          {question.options.map((option, optionIndex) => (
                            <div className="flex items-center gap-2" key={option.id}>
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-ink-50 text-xs font-medium text-ink-500">
                                {String.fromCharCode(65 + optionIndex)}
                              </span>
                              <AceternityInput
                                aria-label={`Answer ${optionIndex + 1}`}
                                className="flex-1"
                                onChange={(event) => patchOption(questionIndex, optionIndex, { label: event.target.value })}
                                placeholder={`Answer ${optionIndex + 1}`}
                                value={option.label}
                              />
                              <button
                                aria-label={`Remove answer ${optionIndex + 1}`}
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                                disabled={question.options.length <= 2}
                                onClick={() => {
                                  const nextQuestions = quizQuestions.map((currentQuestion, index) => index === questionIndex
                                    ? { ...currentQuestion, options: question.options.filter((_, currentOptionIndex) => currentOptionIndex !== optionIndex) }
                                    : currentQuestion);
                                  onPatch({
                                    postSignupQuizQuestions: nextQuestions,
                                    postSignupQuizRoutes: pruneQuizRouteConditions(nextQuestions, quizRoutes),
                                  });
                                }}
                                type="button"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                          {question.options.length < 6 && (
                            <button
                              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-ink-600 transition hover:bg-ink-50 hover:text-ink-900"
                              onClick={() => patchQuestion(questionIndex, {
                                options: [...question.options, {
                                  id: `${question.id}-option-${Date.now()}`,
                                  label: 'Another option',
                                  destinationUrl: '',
                                }],
                              })}
                              type="button"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Add answer
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="overflow-hidden rounded-lg border border-ink-200 bg-white">
                  <button
                    aria-expanded={routingOpen}
                    className="flex w-full items-center justify-between gap-4 p-4 text-left transition hover:bg-ink-50"
                    onClick={() => setRoutingOpen((current) => !current)}
                    type="button"
                  >
                  <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-ink-950">Outcome routing</h3>
                        {quizRoutes.length > 0 && (
                          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium text-ink-600">
                            {quizRoutes.length} {quizRoutes.length === 1 ? 'route' : 'routes'}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-600">
                        Optional. Send matching answer combinations to a different URL.
                      </p>
                    </div>
                    <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-500 transition-transform', routingOpen && 'rotate-180')} />
                  </button>

                  {routingOpen && (
                    <div className="space-y-3 border-t border-ink-100 p-4">
                      <p className="text-xs leading-5 text-ink-500">
                        A route only runs when every selected answer matches. If nothing matches, people see the custom next step above.
                      </p>
                      {quizRoutes.map((route, routeIndex) => (
                        <div className="rounded-md border border-ink-200 bg-ink-50 p-3" key={route.id}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-medium text-ink-700">Route {routeIndex + 1}</p>
                        <button
                          className="inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                          onClick={() => onPatch({ postSignupQuizRoutes: quizRoutes.filter((_, index) => index !== routeIndex) })}
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </div>
                      <label className="mt-3 block">
                        <span className="mb-1 block text-xs text-ink-500">Then send them to</span>
                        <AceternityInput
                          aria-label={`Destination for route ${routeIndex + 1}`}
                          onChange={(event) => patchRoute(routeIndex, { destinationUrl: event.target.value })}
                          placeholder="https://your-site.com/next-step"
                          value={route.destinationUrl}
                        />
                      </label>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {quizQuestions.map((question) => {
                          const selectedOptionId = route.conditions.find((condition) => condition.questionId === question.id)?.optionId || '';
                          return (
                            <label className="block" key={question.id}>
                              <span className="mb-1 block truncate text-xs text-ink-500">{question.prompt}</span>
                              <select
                                aria-label={`Route ${routeIndex + 1} condition for ${question.prompt}`}
                                className="h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-800 outline-none transition focus:border-ink-500 focus:ring-2 focus:ring-ink-100"
                                onChange={(event) => patchRouteCondition(routeIndex, question.id, event.target.value)}
                                value={selectedOptionId}
                              >
                                <option value="">Any answer</option>
                                {question.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                              </select>
                            </label>
                          );
                        })}
                      </div>
                      {!route.destinationUrl.trim() || route.conditions.length === 0 ? (
                        <p className="mt-2 text-xs text-ink-500">Add a destination and select at least one answer to activate this route.</p>
                      ) : null}
                        </div>
                      ))}

                      {quizRoutes.length < 20 && (
                        <button
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-xs font-medium text-ink-700 transition hover:bg-ink-50"
                        onClick={() => {
                          onPatch({ postSignupQuizRoutes: [...quizRoutes, newQuizRoute()] });
                          setRoutingOpen(true);
                        }}
                          type="button"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add route
                        </button>
                      )}
                    </div>
                  )}
                </section>
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
