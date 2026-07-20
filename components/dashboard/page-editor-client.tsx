'use client';

import type { CSSProperties, ChangeEvent, DragEvent as ReactDragEvent, ReactNode } from 'react';
import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { uploadPresigned } from '@vercel/blob/client';
import {
  ArrowLeft,
  BarChart3,
  Bold,
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Columns2,
  Eye,
  ExternalLink,
  Frame,
  Image as ImageIcon,
  GripVertical,
  Italic,
  Link2,
  List,
  ListChecks,
  ListMinus,
  ListOrdered,
  Loader2,
  Mail,
  Monitor,
  Minus,
  Plus,
  Quote,
  Redo2,
  Smartphone,
  Trash2,
  Undo2,
  Video,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { brandHighlightOpacity } from '@/lib/brand-highlight';
import { safeLegalUrl } from '@/lib/legal-links';
import {
  DEFAULT_EMAIL_IMAGE_BORDER,
  emailImageWithBorder,
  emailImageMarkdown,
  emailImageRowMarkdown,
  insertEmailImages,
  mergeEmailImageBlocks,
  normaliseEmailImageBorder,
  parseEmailBodyBlocks,
  parseEmailBodySegments,
  serializeEmailBodyBlocks,
  type EmailBodyBlock,
  type EmailImageBorder,
  type EmailImageInsertion,
} from '@/lib/email-body-images';
import { blobUploadErrorMessage } from '@/lib/blob-upload-error';
import {
  normaliseEmailLinkUrl,
  parseYouTubeVideoUrl,
  renderEmailEditorHtml,
} from '@/lib/email-body-links';
import {
  renderDeliveryEmailHtml,
  renderFollowUpEmailHtml,
} from '@/lib/email-render';
import { pruneQuizRouteConditions } from '@/lib/quiz-routing';
import type { DashboardBasePayload, LeadMagnet } from '@/lib/types';
import { PageHeader } from '@/components/dashboard/app-shell';
import {
  AceternityButton,
  AceternityCard,
  AceternityInput,
  AceternityTextarea,
  aceternityButtonClassName,
} from '@/components/ui/aceternity';
import { ToolbarDropdown } from '@/components/ui/toolbar-dropdown';
import { useModalAccessibility } from '@/components/ui/use-modal-accessibility';
import { ConfirmDialog } from '@/components/dashboard/confirm-dialog';
import { LeadMagnetCopilot } from '@/components/dashboard/lead-magnet-copilot';
import { EditableHotspot, InlineParagraphs, InlineText } from '@/components/dashboard/inline-edit';
import { MagnetsLogoMark } from '@/components/magnets-logo-mark';
import type {
  LeadMagnetCopilotFollowUpUpdate,
  LeadMagnetCopilotPatch,
} from '@/lib/lead-magnet-copilot';

// AI/MAINTAINER CONTEXT:
// This component edits four connected surfaces (landing page, delivery email,
// sequence, and after-signup experience). Email blocks are a UI projection of
// the legacy-compatible string body; never persist DOM/editor-only structures.
// Preview imports the production renderer on purpose. Autosave and undo/redo
// must include uploads, deletes, grouping, captions, and copilot-applied edits.
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type SaveSource = 'autosave' | 'manual';
type Mode = 'page' | 'email' | 'sequence' | 'after';
type PreviewCss = CSSProperties & Record<`--${string}`, string>;
type EmailImageTarget =
  | ({ kind: 'resource' } & EmailImageInsertion)
  | ({ kind: 'follow-up'; emailId: string } & EmailImageInsertion);
type PendingEmailImage = {
  // previewUrl may be blob: while upload is in flight, but only the durable URL
  // returned by the server may enter emailBody/follow-up storage.
  target: EmailImageTarget;
  previewUrl: string;
  progress: number;
};

function editorLandingPageUrl(
  account: DashboardBasePayload['account'],
  leadMagnet: Pick<LeadMagnet, 'id' | 'slug'>
) {
  const attachedHost = account.domainAttachedHost?.trim();
  if (attachedHost) return `https://${attachedHost}/${leadMagnet.slug}`;

  if (account.username) {
    const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '');
    if (configuredSiteUrl) {
      return `${configuredSiteUrl}/${account.username}/${leadMagnet.slug}`;
    }

    if (
      typeof window !== 'undefined'
      && (window.location.hostname === 'localhost' || window.location.hostname.startsWith('127.'))
    ) {
      return `${window.location.origin}/${account.username}/${leadMagnet.slug}`;
    }

    return `https://magnets.so/${account.username}/${leadMagnet.slug}`;
  }

  return `/p/${leadMagnet.id}`;
}

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

function followUpEmailNumber(index: number) {
  // The delivery/resource email is Email 1. Follow-ups continue the same
  // recipient-facing sequence, so their visible numbering begins at Email 2.
  return index + 2;
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
      return `Email ${followUpEmailNumber(index)} delay must be 30 days or less.`;
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
    .filter((segment) => segment.kind !== 'text')
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
  const emailImageUploadTargetRef = useRef<EmailImageTarget | null>(null);
  const [pendingEmailImage, setPendingEmailImage] = useState<PendingEmailImage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const emailImageInputRef = useRef<HTMLInputElement | null>(null);
  const account = initialData.account;
  const dirtyRef = useRef(false);
  const followUpRevisionRef = useRef(0);
  const lastSyncedFollowUpRevisionRef = useRef(0);
  const lastSavedRef = useRef(initialLeadMagnet);
  const editRevisionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const [lastSaveSource, setLastSaveSource] = useState<SaveSource>('manual');

  const markDirty = useCallback(() => {
    editRevisionRef.current += 1;
    dirtyRef.current = true;
    setError('');
    if (!saveInFlightRef.current) setSaveState('idle');
  }, []);

  const patchLeadMagnet = (updates: Partial<LeadMagnet>) => {
    markDirty();
    setLeadMagnet((current) => ({ ...current, ...updates }));
  };

  const patchFollowUpEmail = (
    emailId: string,
    updates: Partial<LeadMagnet['followUpEmails'][number]>
  ) => {
    followUpRevisionRef.current += 1;
    markDirty();
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
    if (followUpUpdates.length > 0) followUpRevisionRef.current += 1;
    markDirty();
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

  const saveLeadMagnet = useCallback(async (
    overrides: Partial<LeadMagnet> = {},
    source: SaveSource = 'manual'
  ) => {
    if (saveInFlightRef.current || isUploadingImage || isUploadingEmailImage) return;
    if (source === 'manual') setError('');

    // Merge any caller overrides into the payload AND into local state. The
    // publish toggle uses this to flip `published` and persist it in the
    // same request — without it the toggle just patched state and waited
    // for a separate Save click, which read as "publish doesn't do anything".
    const payload = { ...leadMagnet, ...overrides };
    const delayError = validateFollowUpDelays(payload);
    if (delayError) {
      if (source === 'manual') {
        setError(delayError);
        setSaveState('error');
      }
      return;
    }

    const revisionAtStart = editRevisionRef.current;
    const followUpRevisionAtStart = followUpRevisionRef.current;
    const syncFollowUp = followUpRevisionAtStart > lastSyncedFollowUpRevisionRef.current;
    saveInFlightRef.current = true;
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
          syncFollowUp,
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
        if (source === 'manual' && response.status === 400 && payload.published) {
          setLeadMagnet((current) => ({ ...current, published: false }));
        }
        throw new Error(data?.error || 'Page could not be saved');
      }

      const data = (await response.json()) as { leadMagnet: LeadMagnet };
      lastSavedRef.current = data.leadMagnet;
      if (syncFollowUp) {
        lastSyncedFollowUpRevisionRef.current = followUpRevisionAtStart;
      }
      setLastSaveSource(source);

      // Never replace characters entered while this request was in flight.
      // A following autosave will persist that newer revision.
      if (editRevisionRef.current === revisionAtStart) {
        setLeadMagnet(data.leadMagnet);
        dirtyRef.current = false;
        setSaveState('saved');
      } else {
        dirtyRef.current = true;
        setSaveState('idle');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(source === 'autosave' ? `Autosave failed: ${message}` : message);
      setSaveState('error');
    } finally {
      saveInFlightRef.current = false;
    }
  }, [isUploadingEmailImage, isUploadingImage, leadMagnet]);

  useEffect(() => {
    if (
      !dirtyRef.current
      || saveInFlightRef.current
      || isUploadingImage
      || isUploadingEmailImage
      || saveState === 'error'
    ) return;

    const timer = window.setTimeout(() => {
      void saveLeadMagnet({}, 'autosave');
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [isUploadingEmailImage, isUploadingImage, leadMagnet, saveLeadMagnet, saveState]);

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
    emailImageUploadTargetRef.current = target;
    setEmailImageUploadTarget(target);
    emailImageInputRef.current?.click();
  }

  async function uploadEmailImageFiles(selectedFiles: File[], target: EmailImageTarget) {
    if (isUploadingEmailImage || selectedFiles.length === 0) return;
    const files = target.mode === 'row' ? selectedFiles.slice(0, 3) : selectedFiles.slice(0, 1);
    if (target.mode === 'row' && files.length < 2) {
      setError('Choose two or three images for an image row.');
      return;
    }

    if (files.some((file) => !MAGNET_IMAGE_TYPES.has(file.type))) {
      setError('Email image must be a PNG, JPG, WebP, or GIF.');
      return;
    }
    if (files.some((file) => file.size > MAX_MAGNET_IMAGE_BYTES)) {
      setError('Email image must be 10 MB or smaller.');
      return;
    }

    setError('');
    emailImageUploadTargetRef.current = target;
    setEmailImageUploadTarget(target);
    setIsUploadingEmailImage(true);
    const previewUrl = URL.createObjectURL(files[0]);
    setPendingEmailImage({ target, previewUrl, progress: 0 });
    try {
      const uploadedImages: Array<{ alt: string; url: string }> = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const multipart = file.size > 8_000_000;
        const handleUploadUrl = `/api/lead-magnets/${leadMagnet.id}/email-image`;
        const pathname = `lead-magnets/${account.id}/${leadMagnet.id}/email-images/${safeImageName(file)}`;
        const blob = await uploadPresigned(pathname, file, {
          access: 'public',
          contentType: file.type,
          handleUploadUrl,
          multipart,
          onUploadProgress: ({ percentage }) => {
            const totalProgress = Math.round(((index * 100) + percentage) / files.length);
            setPendingEmailImage((current) => current?.previewUrl === previewUrl
              ? { ...current, progress: totalProgress }
              : current);
          },
        });
        const imageUrl = await finaliseUploadedEmailImage(leadMagnet.id, blob.url);
        uploadedImages.push({
          alt: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Image',
          url: imageUrl,
        });
      }

      if (target.kind === 'follow-up') followUpRevisionRef.current += 1;
      markDirty();
      setLeadMagnet((current) => {
        if (target.kind === 'resource') {
          return {
            ...current,
            emailBody: insertEmailImages(current.emailBody, target, uploadedImages),
          };
        }

        return {
          ...current,
          followUpEmails: current.followUpEmails.map((email) =>
            email.id === target.emailId
              ? { ...email, body: insertEmailImages(email.body, target, uploadedImages) }
              : email
          ),
        };
      });
    } catch (err) {
      setError(blobUploadErrorMessage(err, 'Email image could not be uploaded.'));
    } finally {
      setIsUploadingEmailImage(false);
      emailImageUploadTargetRef.current = null;
      setEmailImageUploadTarget(null);
      setPendingEmailImage(null);
      window.setTimeout(() => URL.revokeObjectURL(previewUrl), 0);
    }
  }

  async function handleEmailImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files || []);
    const target = emailImageUploadTargetRef.current;
    event.target.value = '';
    if (selectedFiles.length === 0 || !target) return;
    await uploadEmailImageFiles(selectedFiles, target);
  }

  const brand = account.brand;
  const editorIsDark = brand.pageTheme === 'dark';
  const accountLogo = useMemo(() => {
    const fallback = (account.logoText.trim() || 'Your Brand').slice(0, 24);
    return { fallback, hasImage: Boolean(account.logoUrl) };
  }, [account.logoText, account.logoUrl]);
  const landingPageUrl = editorLandingPageUrl(account, leadMagnet);

  return (
    <>
      <PageHeader title="Edit magnet" subtitle="Edit on the canvas, preview the experience, then save when it is ready." />

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
            'page-editor-frame overflow-clip',
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
              {saveState !== 'error' && (
                <span
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 px-1 text-xs font-medium',
                    saveState === 'saving' || isUploadingImage || isUploadingEmailImage
                      ? 'text-ink-500'
                      : 'text-ink-400'
                  )}
                  role="status"
                >
                  {saveState === 'saving' || isUploadingImage || isUploadingEmailImage
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Check className="h-3.5 w-3.5" />}
                  {isUploadingImage
                    ? imageUploadProgress > 0
                      ? `Uploading ${imageUploadProgress}%…`
                      : 'Uploading image…'
                    : isUploadingEmailImage
                      ? 'Uploading image…'
                      : saveState === 'saving'
                        ? 'Saving changes…'
                        : saveState === 'saved'
                          ? lastSaveSource === 'autosave' ? 'Autosaved' : 'All changes saved'
                          : dirtyRef.current ? 'Waiting to autosave…' : 'All changes saved'}
                </span>
              )}
              {saveState === 'error' && (
                <span className="inline-flex h-9 items-center rounded-md border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-700">
                  Could not save
                </span>
              )}
              {leadMagnet.published ? (
                <a
                  className={aceternityButtonClassName({ variant: 'secondary' })}
                  href={landingPageUrl}
                  rel="noreferrer"
                  target="_blank"
                  title="Open the published landing page in a new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                  View page
                </a>
              ) : (
                <AceternityButton
                  disabled
                  title="Publish this page before opening it"
                  variant="secondary"
                >
                  <ExternalLink className="h-4 w-4" />
                  View page
                </AceternityButton>
              )}
              <AceternityButton
                onClick={() => router.push(`/dashboard/pages/${leadMagnet.id}/analytics`)}
                title="View visits and conversions"
                variant="secondary"
              >
                <BarChart3 className="h-4 w-4" />
                Analytics
              </AceternityButton>
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
              onAddImage={(insertion, files) => {
                const target: EmailImageTarget = { kind: 'resource', ...insertion };
                if (files?.length) void uploadEmailImageFiles(files, target);
                else pickEmailImage(target);
              }}
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
              onAddImage={(emailId, insertion, files) => {
                const target: EmailImageTarget = { kind: 'follow-up', emailId, ...insertion };
                if (files?.length) void uploadEmailImageFiles(files, target);
                else pickEmailImage(target);
              }}
              onPatch={(updates) => {
                followUpRevisionRef.current += 1;
                patchLeadMagnet(updates);
              }}
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
          multiple
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
  discardRememberedSelection: () => void;
  focusAt: (position: 'start' | 'end') => void;
  insertVariable: (value: string) => void;
  openCommandMenu: () => void;
  openLinkEditor: () => void;
  rememberInsertionPoint: () => void;
  rememberSelection: () => void;
  splitAtCaret: () => { after: string; before: string };
};

type EmailFormatCommand =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'bold'
  | 'italic'
  | 'quote'
  | 'sideQuote'
  | 'centeredQuote'
  | 'unorderedList'
  | 'dashedList'
  | 'orderedList'
  | 'divider'
  | 'section'
  | 'columns'
  | 'tableOfContents'
  | 'footnote'
  | 'youtube';

type EmailEditorBlock = EmailBodyBlock & { editorId: string };
type ImageBlockDropTarget = { index: number; placement: 'before' | 'after' };
type ContentBlockDropTarget = { index: number; placement: 'before' | 'after' };
type EmailHistoryMode = 'structural' | 'typing';

const EMAIL_HISTORY_LIMIT = 100;
const EMAIL_TYPING_GROUP_MS = 900;

let emailEditorBlockSequence = 0;

function nextEmailEditorBlockId() {
  emailEditorBlockSequence += 1;
  return `email-block-${emailEditorBlockSequence}`;
}

function hydrateEmailEditorBlocks(body: string): EmailEditorBlock[] {
  return parseEmailBodyBlocks(body).map((block) => ({
    ...block,
    editorId: nextEmailEditorBlockId(),
  }));
}

function nearestEmailTextBlockIndex(blocks: EmailEditorBlock[], preferredIndex: number) {
  if (blocks.length === 0) return -1;
  const safeIndex = Math.max(0, Math.min(preferredIndex, blocks.length - 1));
  const nextIndex = blocks.findIndex((block, index) => (
    block.kind === 'text' && index >= safeIndex
  ));
  if (nextIndex >= 0) return nextIndex;
  return blocks.findLastIndex((block, index) => block.kind === 'text' && index <= safeIndex);
}

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
  onAddImage: (insertion: EmailImageInsertion, files?: File[]) => void;
  onChange: (value: string) => void;
  pendingImage: PendingEmailImage | null;
  value: string;
}) {
  const [blocks, setBlocks] = useState<EmailEditorBlock[]>(() => hydrateEmailEditorBlocks(value));
  const [draggedImageBlockIndex, setDraggedImageBlockIndex] = useState<number | null>(null);
  const [imageBlockDropTarget, setImageBlockDropTarget] = useState<ImageBlockDropTarget | null>(null);
  const [imageBorderEditorIndex, setImageBorderEditorIndex] = useState<number | null>(null);
  const [draggedContentBlockIndex, setDraggedContentBlockIndex] = useState<number | null>(null);
  const [contentBlockDropTarget, setContentBlockDropTarget] = useState<ContentBlockDropTarget | null>(null);
  const [historyAvailability, setHistoryAvailability] = useState({ canRedo: false, canUndo: false });
  const draggedImageBlockIndexRef = useRef<number | null>(null);
  const draggedContentBlockIndexRef = useRef<number | null>(null);
  const lastEmittedBodyRef = useRef(value);
  const historyRef = useRef({ entries: [value], index: 0 });
  const lastHistoryMutationRef = useRef<{
    at: number;
    blockIndex: number;
    mode: EmailHistoryMode;
  } | null>(null);
  const pendingBlockFocusRef = useRef<{
    index: number;
    openCommands?: boolean;
    position: 'start' | 'end';
  } | null>(null);
  const activeTextSegmentRef = useRef(0);
  const textSegmentRefs = useRef(new Map<number, EmailTextSegmentEditorHandle>());

  useEffect(() => {
    if (value === lastEmittedBodyRef.current) return;
    const history = historyRef.current;
    const nextEntries = [...history.entries.slice(0, history.index + 1), value]
      .slice(-EMAIL_HISTORY_LIMIT);
    historyRef.current = { entries: nextEntries, index: nextEntries.length - 1 };
    lastHistoryMutationRef.current = null;
    setHistoryAvailability({ canRedo: false, canUndo: nextEntries.length > 1 });
    lastEmittedBodyRef.current = value;
    setBlocks(hydrateEmailEditorBlocks(value));
  }, [value]);

  useLayoutEffect(() => {
    const pending = pendingBlockFocusRef.current;
    if (!pending) return;
    const editor = textSegmentRefs.current.get(pending.index);
    if (!editor) return;
    pendingBlockFocusRef.current = null;
    editor.focusAt(pending.position);
    if (pending.openCommands) editor.openCommandMenu();
  }, [blocks]);

  function updateHistoryAvailability() {
    const history = historyRef.current;
    setHistoryAvailability({
      canRedo: history.index < history.entries.length - 1,
      canUndo: history.index > 0,
    });
  }

  function recordHistory(nextBody: string, mode: EmailHistoryMode, blockIndex: number) {
    const history = historyRef.current;
    if (history.entries[history.index] === nextBody) return;

    const now = Date.now();
    const lastMutation = lastHistoryMutationRef.current;
    const canGroupTyping = mode === 'typing'
      && lastMutation?.mode === 'typing'
      && lastMutation.blockIndex === blockIndex
      && now - lastMutation.at <= EMAIL_TYPING_GROUP_MS
      && history.index === history.entries.length - 1;

    if (canGroupTyping) {
      history.entries[history.index] = nextBody;
    } else {
      const entries = [...history.entries.slice(0, history.index + 1), nextBody]
        .slice(-EMAIL_HISTORY_LIMIT);
      historyRef.current = { entries, index: entries.length - 1 };
    }

    lastHistoryMutationRef.current = { at: now, blockIndex, mode };
    updateHistoryAvailability();
  }

  function restoreHistory(direction: 'redo' | 'undo') {
    const history = historyRef.current;
    const nextIndex = direction === 'undo' ? history.index - 1 : history.index + 1;
    if (nextIndex < 0 || nextIndex >= history.entries.length) return;

    history.index = nextIndex;
    lastHistoryMutationRef.current = null;
    const nextBody = history.entries[nextIndex];
    const nextBlocks = hydrateEmailEditorBlocks(nextBody);
    const focusIndex = nearestEmailTextBlockIndex(nextBlocks, activeTextSegmentRef.current);
    activeTextSegmentRef.current = Math.max(0, focusIndex);
    pendingBlockFocusRef.current = focusIndex >= 0
      ? { index: focusIndex, position: 'end' }
      : null;
    lastEmittedBodyRef.current = nextBody;
    setBlocks(nextBlocks);
    onChange(nextBody);
    updateHistoryAvailability();
  }

  function commitBlocks(
    nextBlocks: EmailEditorBlock[],
    mode: EmailHistoryMode = 'structural',
    blockIndex = activeTextSegmentRef.current
  ) {
    const safeBlocks = nextBlocks.length > 0
      ? nextBlocks
      : [{ kind: 'text' as const, raw: '', editorId: nextEmailEditorBlockId() }];
    const nextBody = serializeEmailBodyBlocks(safeBlocks);
    recordHistory(nextBody, mode, blockIndex);
    setBlocks(safeBlocks);
    lastEmittedBodyRef.current = nextBody;
    onChange(nextBody);
  }

  function updateTextBlock(index: number, raw: string, mode: EmailHistoryMode) {
    commitBlocks(
      blocks.map((block, blockIndex) => blockIndex === index ? { ...block, raw } : block),
      mode,
      index
    );
  }

  function splitTextBlock(index: number, split: { after: string; before: string }) {
    const current = blocks[index];
    if (!current || current.kind !== 'text') return;
    const nextBlocks = blocks.flatMap((block, blockIndex) => blockIndex === index
      ? [
          { ...block, raw: split.before },
          { kind: 'text' as const, raw: split.after, editorId: nextEmailEditorBlockId() },
        ]
      : [block]);
    pendingBlockFocusRef.current = { index: index + 1, position: 'start' };
    activeTextSegmentRef.current = index + 1;
    commitBlocks(nextBlocks);
  }

  function mergeTextBlockWithPrevious(index: number) {
    const current = blocks[index];
    const previous = blocks[index - 1];
    if (!current || current.kind !== 'text' || !previous || previous.kind !== 'text') return false;
    const nextBlocks = blocks
      .map((block, blockIndex) => blockIndex === index - 1
        ? { ...previous, raw: `${previous.raw}${current.raw}` }
        : block)
      .filter((_, blockIndex) => blockIndex !== index);
    pendingBlockFocusRef.current = { index: index - 1, position: 'end' };
    activeTextSegmentRef.current = index - 1;
    commitBlocks(nextBlocks);
    return true;
  }

  function removeBlock(index: number) {
    const remainingBlocks = blocks.filter((_, blockIndex) => blockIndex !== index);
    const nextBlocks: EmailEditorBlock[] = remainingBlocks.length > 0
      ? remainingBlocks
      : [{ kind: 'text', raw: '', editorId: nextEmailEditorBlockId() }];
    const focusIndex = nearestEmailTextBlockIndex(nextBlocks, index);
    activeTextSegmentRef.current = Math.max(0, focusIndex);
    pendingBlockFocusRef.current = focusIndex >= 0
      ? { index: focusIndex, position: 'end' }
      : null;
    commitBlocks(nextBlocks);
  }

  function separateImageRow(index: number) {
    const block = blocks[index];
    if (!block || block.kind !== 'image-row') return;

    const separatedBlocks: EmailEditorBlock[] = block.images.map((image) => ({
      kind: 'image',
      alt: image.alt,
      border: image.border,
      caption: image.caption,
      url: image.url,
      raw: emailImageMarkdown(image),
      editorId: nextEmailEditorBlockId(),
    }));
    commitBlocks([
      ...blocks.slice(0, index),
      ...separatedBlocks,
      ...blocks.slice(index + 1),
    ]);
  }

  function setImageBlockBorder(
    index: number,
    border: EmailImageBorder | undefined,
    mode: EmailHistoryMode = 'structural'
  ) {
    const block = blocks[index];
    if (!block || (block.kind !== 'image' && block.kind !== 'image-row')) return;

    if (block.kind === 'image') {
      const nextImage = emailImageWithBorder({
        alt: block.alt,
        caption: block.caption,
        url: block.url,
      }, border);
      commitBlocks(blocks.map((item, blockIndex) => blockIndex === index
        ? { ...block, ...nextImage, raw: emailImageMarkdown(nextImage) }
        : item), mode, index);
      return;
    }

    const images = block.images.map((image) => emailImageWithBorder(image, border));
    commitBlocks(blocks.map((item, blockIndex) => blockIndex === index
      ? { ...block, images, raw: emailImageRowMarkdown(images) }
      : item), mode, index);
  }

  function setImageCaption(index: number, imageIndex: number, value: string) {
    const block = blocks[index];
    if (!block || (block.kind !== 'image' && block.kind !== 'image-row')) return;
    const caption = value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').slice(0, 240);

    if (block.kind === 'image') {
      const nextImage = {
        alt: block.alt,
        border: block.border,
        caption: caption || undefined,
        url: block.url,
      };
      commitBlocks(blocks.map((item, blockIndex) => blockIndex === index
        ? { ...block, ...nextImage, raw: emailImageMarkdown(nextImage) }
        : item), 'typing', index);
      return;
    }

    const images = block.images.map((image, itemIndex) => itemIndex === imageIndex
      ? { ...image, caption: caption || undefined }
      : image);
    commitBlocks(blocks.map((item, blockIndex) => blockIndex === index
      ? { ...block, images, raw: emailImageRowMarkdown(images) }
      : item), 'typing', index);
  }

  function imageCountForBlock(index: number) {
    const block = blocks[index];
    if (block?.kind === 'image') return 1;
    if (block?.kind === 'image-row') return block.images.length;
    return 0;
  }

  function canMergeImageBlocks(sourceIndex: number, targetIndex: number) {
    if (sourceIndex === targetIndex) return false;
    const sourceCount = imageCountForBlock(sourceIndex);
    const targetCount = imageCountForBlock(targetIndex);
    return sourceCount > 0 && targetCount > 0 && sourceCount + targetCount <= 3;
  }

  function dragImageBlockOver(event: ReactDragEvent<HTMLDivElement>, targetIndex: number) {
    const sourceIndex = draggedImageBlockIndexRef.current;
    if (
      sourceIndex === null
      || !canMergeImageBlocks(sourceIndex, targetIndex)
    ) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setContentBlockDropTarget(null);
    const bounds = event.currentTarget.getBoundingClientRect();
    const placement = event.clientX < bounds.left + bounds.width / 2 ? 'before' : 'after';
    setImageBlockDropTarget((current) => (
      current?.index === targetIndex && current.placement === placement
        ? current
        : { index: targetIndex, placement }
    ));
  }

  function dropImageBlock(event: ReactDragEvent<HTMLDivElement>, targetIndex: number) {
    event.preventDefault();
    const transferredValue = event.dataTransfer.getData('application/x-magnets-image-block');
    const transferredIndex = transferredValue ? Number(transferredValue) : -1;
    const sourceIndex = draggedImageBlockIndexRef.current
      ?? (Number.isInteger(transferredIndex) ? transferredIndex : -1);
    const bounds = event.currentTarget.getBoundingClientRect();
    const placement = event.clientX < bounds.left + bounds.width / 2 ? 'before' : 'after';

    if (canMergeImageBlocks(sourceIndex, targetIndex)) {
      commitBlocks(mergeEmailImageBlocks(blocks, sourceIndex, targetIndex, placement));
    }
    finishDraggingContentBlock();
  }

  function startDraggingContentBlock(event: ReactDragEvent<HTMLElement>, index: number) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-magnets-content-block', String(index));
    event.dataTransfer.setData('text/plain', `content-block-${index}`);
    draggedContentBlockIndexRef.current = index;
    setDraggedContentBlockIndex(index);
    setContentBlockDropTarget(null);

    const block = blocks[index];
    if (block?.kind === 'image' || block?.kind === 'image-row') {
      // The standard six-dot handle owns both behaviours for media: dropping
      // on text reorders the block, while dropping on another compatible image
      // creates a row. A second "Drag beside" handle only duplicated the UI.
      event.dataTransfer.setData('application/x-magnets-image-block', String(index));
      draggedImageBlockIndexRef.current = index;
      setDraggedImageBlockIndex(index);
      setImageBlockDropTarget(null);
    }
  }

  function dragContentBlockOver(event: ReactDragEvent<HTMLDivElement>, targetIndex: number) {
    const sourceIndex = draggedContentBlockIndexRef.current;
    if (sourceIndex === null || sourceIndex === targetIndex) return false;

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setImageBlockDropTarget(null);
    // A direction-based target is much more forgiving than asking the user to
    // hit the correct half of a paragraph. When moving down, the hovered block
    // is the block we want to land after; when moving up, it is the block we
    // want to land before. This also keeps the insertion line stable instead
    // of flickering as the pointer crosses the target's midpoint.
    const placement = targetIndex < sourceIndex ? 'before' : 'after';
    setContentBlockDropTarget((current) => (
      current?.index === targetIndex && current.placement === placement
        ? current
        : { index: targetIndex, placement }
    ));
    return true;
  }

  function dropContentBlock(event: ReactDragEvent<HTMLDivElement>, targetIndex: number) {
    const transferredValue = event.dataTransfer.getData('application/x-magnets-content-block');
    const transferredIndex = transferredValue ? Number(transferredValue) : -1;
    const sourceIndex = draggedContentBlockIndexRef.current
      ?? (Number.isInteger(transferredIndex) ? transferredIndex : -1);
    if (sourceIndex < 0 || sourceIndex === targetIndex || !blocks[sourceIndex]) return false;

    event.preventDefault();
    event.stopPropagation();
    const placement = targetIndex < sourceIndex ? 'before' : 'after';
    const nextBlocks = [...blocks];
    const [movedBlock] = nextBlocks.splice(sourceIndex, 1);
    let insertionIndex = targetIndex + (placement === 'after' ? 1 : 0);
    if (sourceIndex < insertionIndex) insertionIndex -= 1;
    nextBlocks.splice(insertionIndex, 0, movedBlock);
    activeTextSegmentRef.current = movedBlock.kind === 'text'
      ? insertionIndex
      : nearestEmailTextBlockIndex(nextBlocks, insertionIndex);
    commitBlocks(nextBlocks);
    finishDraggingContentBlock();
    return true;
  }

  function finishDraggingContentBlock() {
    draggedContentBlockIndexRef.current = null;
    draggedImageBlockIndexRef.current = null;
    setDraggedContentBlockIndex(null);
    setDraggedImageBlockIndex(null);
    setContentBlockDropTarget(null);
    setImageBlockDropTarget(null);
  }

  function moveContentBlock(index: number, direction: 'down' | 'up') {
    const targetIndex = index + (direction === 'up' ? -1 : 1);
    if (targetIndex < 0 || targetIndex >= blocks.length) return;
    const nextBlocks = [...blocks];
    const [movedBlock] = nextBlocks.splice(index, 1);
    nextBlocks.splice(targetIndex, 0, movedBlock);
    activeTextSegmentRef.current = movedBlock.kind === 'text'
      ? targetIndex
      : nearestEmailTextBlockIndex(nextBlocks, targetIndex);
    commitBlocks(nextBlocks);
  }

  function insertTextBlockAfter(index: number) {
    const nextIndex = index + 1;
    const nextBlock: EmailEditorBlock = {
      kind: 'text',
      raw: '',
      editorId: nextEmailEditorBlockId(),
    };
    const nextBlocks = [
      ...blocks.slice(0, nextIndex),
      nextBlock,
      ...blocks.slice(nextIndex),
    ];
    pendingBlockFocusRef.current = { index: nextIndex, openCommands: true, position: 'start' };
    activeTextSegmentRef.current = nextIndex;
    // An empty draft block has no stored representation yet. Keep it local
    // until the user types or chooses a command; committing here would
    // immediately normalise the blank block away again.
    setBlocks(nextBlocks);
  }

  function activeEditor() {
    return textSegmentRefs.current.get(activeTextSegmentRef.current)
      || textSegmentRefs.current.values().next().value;
  }

  const applyFormat = (format: EmailFormatCommand) => activeEditor()?.applyFormat(format);

  function insertAtCaret(mode: 'single' | 'row') {
    const blockIndex = activeTextSegmentRef.current;
    const editor = activeEditor();
    if (!editor) return;
    const split = editor.splitAtCaret();
    requestImage(blockIndex, mode, split);
  }

  function requestImage(
    blockIndex: number,
    mode: 'single' | 'row',
    split: { after: string; before: string },
    files?: File[]
  ) {
    const current = blocks[blockIndex];
    if (!current || current.kind !== 'text') return;

    const beforeBlocks: EmailBodyBlock[] = [
      ...blocks.slice(0, blockIndex),
      { kind: 'text', raw: split.before },
    ];
    const afterBlocks: EmailBodyBlock[] = [
      { kind: 'text', raw: split.after },
      ...blocks.slice(blockIndex + 1),
    ];

    onAddImage({
      mode,
      segmentIndex: blockIndex,
      before: split.before,
      after: split.after,
      bodyBefore: serializeEmailBodyBlocks(beforeBlocks),
      bodyAfter: serializeEmailBodyBlocks(afterBlocks),
    }, files);
  }

  function formattingToolbar(floating: boolean) {
    const toolbarButton = cn(
      'inline-flex shrink-0 items-center justify-center rounded-md text-ink-700 transition hover:bg-ink-100 hover:text-ink-950 disabled:pointer-events-none disabled:text-ink-300',
      floating ? 'h-9 w-9' : 'h-8 w-8'
    );
    const divider = floating
      ? 'mx-auto my-0.5 h-px w-5 bg-ink-200'
      : 'mx-0.5 h-5 w-px bg-ink-200';

    return (
      <div
        aria-label={`${ariaLabel} formatting`}
        className={cn(
          'no-scrollbar flex items-center gap-1 bg-white/95 p-1.5 backdrop-blur-md',
          floating
            ? 'flex-col rounded-xl border border-ink-200 shadow-xl shadow-black/10'
            : 'flex-wrap rounded-t-xl border-b border-ink-200 bg-ink-50/95 sm:flex-nowrap sm:overflow-x-auto'
        )}
        role="toolbar"
      >
        <button
          aria-label="Undo"
          className={toolbarButton}
          disabled={!historyAvailability.canUndo}
          onClick={() => restoreHistory('undo')}
          onMouseDown={(event) => event.preventDefault()}
          title="Undo (Ctrl/⌘ Z)"
          type="button"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          aria-label="Redo"
          className={toolbarButton}
          disabled={!historyAvailability.canRedo}
          onClick={() => restoreHistory('redo')}
          onMouseDown={(event) => event.preventDefault()}
          title="Redo (Ctrl/⌘ Shift Z)"
          type="button"
        >
          <Redo2 className="h-4 w-4" />
        </button>
        <span aria-hidden="true" className={divider} />
        <ToolbarDropdown
          ariaLabel="Text style"
          compact={floating}
          label="Text style"
          menuAlign={floating ? 'right' : 'left'}
          onDismiss={() => activeEditor()?.discardRememberedSelection()}
          onOpen={() => activeEditor()?.rememberSelection()}
          onSelect={(format) => applyFormat(format)}
          options={[
            { value: 'paragraph', label: 'Paragraph', previewClassName: 'text-sm font-normal' },
            { value: 'heading1', label: 'Title', previewClassName: 'text-lg font-semibold' },
            { value: 'heading2', label: 'Heading', previewClassName: 'text-base font-semibold' },
            { value: 'heading3', label: 'Subheading', previewClassName: 'text-sm font-semibold' },
            { value: 'heading4', label: 'Heading 4', previewClassName: 'text-sm font-semibold' },
            { value: 'heading5', label: 'Heading 5', previewClassName: 'text-xs font-semibold' },
            { value: 'heading6', label: 'Heading 6', previewClassName: 'text-xs font-semibold' },
          ] satisfies Array<{ label: string; previewClassName: string; value: EmailFormatCommand }>}
        />
        <span aria-hidden="true" className={divider} />
        <button aria-label="Bold" className={toolbarButton} onClick={() => applyFormat('bold')} onMouseDown={(event) => event.preventDefault()} title="Bold" type="button">
          <Bold className="h-4 w-4" />
        </button>
        <button aria-label="Italic" className={toolbarButton} onClick={() => applyFormat('italic')} onMouseDown={(event) => event.preventDefault()} title="Italic" type="button">
          <Italic className="h-4 w-4" />
        </button>
        <button aria-label="Quote" className={toolbarButton} onClick={() => applyFormat('quote')} onMouseDown={(event) => event.preventDefault()} title="Quote" type="button">
          <Quote className="h-4 w-4" />
        </button>
        <button aria-label="Bulleted list" className={toolbarButton} onClick={() => applyFormat('unorderedList')} onMouseDown={(event) => event.preventDefault()} title="Bulleted list" type="button">
          <List className="h-4 w-4" />
        </button>
        <button aria-label="Dashed list" className={toolbarButton} onClick={() => applyFormat('dashedList')} onMouseDown={(event) => event.preventDefault()} title="Dashed list" type="button">
          <ListMinus className="h-4 w-4" />
        </button>
        <button aria-label="Numbered list" className={toolbarButton} onClick={() => applyFormat('orderedList')} onMouseDown={(event) => event.preventDefault()} title="Numbered list" type="button">
          <ListOrdered className="h-4 w-4" />
        </button>
        <button aria-label="Divider" className={toolbarButton} onClick={() => applyFormat('divider')} onMouseDown={(event) => event.preventDefault()} title="Divider" type="button">
          <Minus className="h-4 w-4" />
        </button>
        <span aria-hidden="true" className={divider} />
        <button
          aria-label="Insert content block"
          className={cn(toolbarButton, !floating && 'w-auto px-2')}
          onClick={() => activeEditor()?.openCommandMenu()}
          onMouseDown={(event) => event.preventDefault()}
          title="Insert a block: headings, quotes, sections, columns, contents, media, and embeds"
          type="button"
        >
          <Plus className="h-4 w-4" />
          {!floating && <span className="ml-1.5 text-xs font-medium">Blocks</span>}
        </button>
        <button aria-label="Insert name variable" className={cn(toolbarButton, 'w-auto px-2 text-[11px] font-semibold')} onClick={() => activeEditor()?.insertVariable('{name}')} onMouseDown={(event) => event.preventDefault()} title="Insert name variable" type="button">
          Name
        </button>
        <button aria-label="Add link" className={toolbarButton} onClick={() => activeEditor()?.openLinkEditor()} onMouseDown={(event) => event.preventDefault()} title="Add link" type="button">
          <Link2 className="h-4 w-4" />
        </button>
        <button
          aria-label={isUploadingImage ? 'Uploading image' : 'Add image'}
          className={cn(toolbarButton, 'disabled:pointer-events-none disabled:opacity-50', !floating && 'w-auto px-2')}
          disabled={isUploadingImage}
          onClick={() => insertAtCaret('single')}
          onMouseDown={(event) => {
            activeEditor()?.rememberInsertionPoint();
            event.preventDefault();
          }}
          title={isUploadingImage ? 'Uploading image' : 'Add image'}
          type="button"
        >
          {isUploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
          {!floating && <span className="ml-1.5 text-xs font-medium">{isUploadingImage ? 'Uploading' : 'Image'}</span>}
        </button>
        <button
          aria-label="Embed YouTube video"
          className={cn(toolbarButton, !floating && 'w-auto px-2')}
          onClick={() => applyFormat('youtube')}
          onMouseDown={(event) => event.preventDefault()}
          title="Embed a YouTube video"
          type="button"
        >
          <Video className="h-4 w-4" />
          {!floating && <span className="ml-1.5 text-xs font-medium">YouTube</span>}
        </button>
      </div>
    );
  }

  const finalBlockIndex = blocks.length - 1;
  const finalBlock = blocks[finalBlockIndex];
  const finalTextLine = finalBlock?.kind === 'text'
    ? finalBlock.raw.trim().split('\n').at(-1)?.trim() || ''
    : '';
  const endsWithYouTubeVideo = /^:::youtube\s+\S+$/i.test(finalTextLine);

  return (
    <div
      className="relative xl:flex xl:items-start xl:gap-3"
      onKeyDownCapture={(event) => {
        if ((!event.metaKey && !event.ctrlKey) || event.altKey) return;
        const target = event.target as HTMLElement;
        if (target.closest('input, textarea, select')) return;

        const key = event.key.toLowerCase();
        const redo = key === 'y' || (key === 'z' && event.shiftKey);
        if (key !== 'z' && key !== 'y') return;
        event.preventDefault();
        event.stopPropagation();
        restoreHistory(redo ? 'redo' : 'undo');
      }}
    >
      <div className="min-w-0 flex-1 rounded-xl border border-ink-200 bg-white transition focus-within:border-ink-400 focus-within:ring-1 focus-within:ring-ink-200">
        <div className="sticky top-16 z-40 xl:hidden">
          {formattingToolbar(false)}
        </div>
        <div className="min-h-64 px-10 py-4 sm:px-12 sm:py-5">
          {blocks.map((block, index) => {
            if (block.kind === 'image' || block.kind === 'image-row') {
              const images = block.kind === 'image'
                ? [{ alt: block.alt, border: block.border, caption: block.caption, url: block.url }]
                : block.images;
              const imageBorder = normaliseEmailImageBorder(
                images.find((image) => image.border)?.border
              );
              const hasImageBorder = images.every((image) => image.border);
              const isDraggedImageBlock = draggedImageBlockIndex === index;
              const canAcceptDraggedImages = draggedImageBlockIndex !== null
                && canMergeImageBlocks(draggedImageBlockIndex, index);
              const activeDropTarget = imageBlockDropTarget?.index === index
                ? imageBlockDropTarget
                : null;
              return (
                <Fragment key={block.editorId}>
                  <div
                    className={cn(
                      'group/email-block group/email-image relative -mx-1 rounded-lg bg-white py-3 pl-14 pr-3 transition hover:bg-ink-50/40 focus-within:bg-ink-50/40 sm:-mx-3 sm:px-16 sm:py-3',
                      draggedContentBlockIndex === index && 'scale-[0.99] opacity-40',
                      isDraggedImageBlock && 'scale-[0.99] opacity-40',
                      canAcceptDraggedImages && 'border-dashed border-ink-400 bg-ink-50/70',
                      activeDropTarget && 'border-ink-950 bg-white ring-2 ring-ink-950 ring-offset-2'
                    )}
                    onDragOver={(event) => {
                      const draggedImageIndex = draggedImageBlockIndexRef.current;
                      if (
                        draggedImageIndex !== null
                        && canMergeImageBlocks(draggedImageIndex, index)
                      ) {
                        dragImageBlockOver(event, index);
                        return;
                      }
                      dragContentBlockOver(event, index);
                    }}
                    onDragEnter={(event) => {
                      const draggedImageIndex = draggedImageBlockIndexRef.current;
                      if (
                        draggedImageIndex !== null
                        && canMergeImageBlocks(draggedImageIndex, index)
                      ) {
                        dragImageBlockOver(event, index);
                        return;
                      }
                      dragContentBlockOver(event, index);
                    }}
                    onDrop={(event) => {
                      const draggedImageIndex = draggedImageBlockIndexRef.current;
                      if (
                        draggedImageIndex !== null
                        && canMergeImageBlocks(draggedImageIndex, index)
                      ) {
                        dropImageBlock(event, index);
                        return;
                      }
                      dropContentBlock(event, index);
                    }}
                  >
                    <EmailBlockRail
                      blockNumber={index + 1}
                      onDragEnd={finishDraggingContentBlock}
                      onDragStart={(event) => startDraggingContentBlock(event, index)}
                      onInsert={() => insertTextBlockAfter(index)}
                      onMove={(direction) => moveContentBlock(index, direction)}
                    />
                    <EmailBlockDropIndicator target={contentBlockDropTarget?.index === index ? contentBlockDropTarget : null} />
                    <div className={cn(
                      'grid gap-2 overflow-visible rounded-lg',
                      images.length === 3 ? 'grid-cols-3' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-1 place-items-center'
                    )}>
                      {images.map((image, imageIndex) => {
                        const border = normaliseEmailImageBorder(image.border);
                        return (
                          <figure
                            className={cn(
                              'flex max-w-full flex-col items-center',
                              images.length === 1 ? 'w-auto' : 'h-full w-full'
                            )}
                            key={image.url}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              alt={image.alt}
                              className={cn(
                                'box-border max-h-[22rem] object-contain',
                                images.length === 1 ? 'h-auto w-auto max-w-full sm:max-w-[27.5rem]' : 'h-full w-full'
                              )}
                              draggable={false}
                              src={image.url}
                              style={{
                                border: border ? `${border.width}px ${border.style} #${border.color}` : '0',
                                borderRadius: `${border?.radius ?? 12}px`,
                                boxSizing: 'border-box',
                              }}
                            />
                            <figcaption className="mt-1.5 w-full max-w-[27.5rem] text-center">
                              <input
                                aria-label={images.length > 1 ? `Caption for image ${imageIndex + 1}` : 'Image caption'}
                                className={cn(
                                  'w-full bg-transparent px-2 text-center text-xs italic leading-5 text-ink-500 outline-none transition placeholder:italic placeholder:text-ink-400',
                                  image.caption
                                    ? 'opacity-100'
                                    : 'opacity-0 group-hover/email-image:opacity-100 group-focus-within/email-image:opacity-100'
                                )}
                                maxLength={240}
                                onChange={(event) => setImageCaption(index, imageIndex, event.target.value)}
                                onClick={(event) => event.stopPropagation()}
                                placeholder="Add a caption…"
                                title="Click to add or edit the image caption"
                                type="text"
                                value={image.caption || ''}
                              />
                            </figcaption>
                          </figure>
                        );
                      })}
                    </div>
                    {activeDropTarget && (
                      <div className={cn(
                        'pointer-events-none absolute inset-y-3 z-20 flex w-1/2 items-center justify-center rounded-lg border-2 border-dashed border-ink-950 bg-white/85 text-xs font-semibold text-ink-950 backdrop-blur-sm',
                        activeDropTarget.placement === 'before' ? 'left-3' : 'right-3'
                      )}>
                        Drop {activeDropTarget.placement === 'before' ? 'to the left' : 'to the right'}
                      </div>
                    )}
                    <div className="absolute right-2 top-2 flex items-center gap-1 rounded-lg border border-ink-200 bg-white/95 p-1 shadow-sm backdrop-blur transition sm:pointer-events-none sm:opacity-0 sm:group-hover/email-image:pointer-events-auto sm:group-hover/email-image:opacity-100 sm:group-focus-within/email-image:pointer-events-auto sm:group-focus-within/email-image:opacity-100">
                      {images.length > 1 && (
                        <button
                          aria-label="Separate side-by-side images"
                          className="inline-flex h-8 items-center rounded-md px-2 text-xs font-medium text-ink-700 transition hover:bg-ink-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            separateImageRow(index);
                          }}
                          title="Put these images back into separate blocks"
                          type="button"
                        >
                          Separate
                        </button>
                      )}
                      {images.length < 3 && (
                        <button
                          aria-label="Add an image beside this one"
                          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-ink-700 transition hover:bg-ink-100"
                          disabled={isUploadingImage}
                          onClick={(event) => {
                            event.stopPropagation();
                            onAddImage({
                              mode: 'beside',
                              segmentIndex: index,
                              targetMedia: block.raw,
                              bodyBefore: serializeEmailBodyBlocks(blocks.slice(0, index)),
                              bodyAfter: serializeEmailBodyBlocks(blocks.slice(index + 1)),
                            });
                          }}
                          title="Add beside"
                          type="button"
                        >
                          <Columns2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Add beside</span>
                        </button>
                      )}
                      <button
                        aria-label={imageBorder ? 'Edit image border' : 'Add image border'}
                        aria-pressed={hasImageBorder}
                        className={cn(
                          'inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-ink-700 transition hover:bg-ink-100',
                          hasImageBorder && 'bg-ink-100 text-ink-950'
                        )}
                        onClick={(event) => {
                          event.stopPropagation();
                          setImageBorderEditorIndex((current) => current === index ? null : index);
                        }}
                        title={imageBorder ? 'Edit border' : 'Add border'}
                        type="button"
                      >
                        <Frame className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Border</span>
                      </button>
                      <button
                        aria-label="Remove image"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-red-600 transition hover:bg-red-50"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeBlock(index);
                        }}
                        title="Remove image"
                        type="button"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {imageBorderEditorIndex === index && (
                      <EmailImageBorderPanel
                        border={imageBorder}
                        onAdd={() => setImageBlockBorder(index, { ...DEFAULT_EMAIL_IMAGE_BORDER })}
                        onChange={(nextBorder) => setImageBlockBorder(index, nextBorder, 'typing')}
                        onClose={() => setImageBorderEditorIndex(null)}
                        onRemove={() => setImageBlockBorder(index, undefined)}
                      />
                    )}
                  </div>
                </Fragment>
              );
            }

            const trimmedText = block.raw.trim();
            const visibleLines = trimmedText
              ? Math.max(1, Math.min(8, trimmedText.split('\n').length))
              : 1;
            return (
              <Fragment key={block.editorId}>
                <div
                  className={cn(
                    'group/email-block relative -mx-1 rounded-md bg-transparent py-1 pl-14 pr-3 transition hover:bg-ink-50/60 focus-within:bg-ink-50/60 sm:-mx-3 sm:px-16',
                    draggedContentBlockIndex === index && 'scale-[0.99] opacity-40'
                  )}
                  onDragEnter={(event) => dragContentBlockOver(event, index)}
                  onDragOver={(event) => dragContentBlockOver(event, index)}
                  onDrop={(event) => dropContentBlock(event, index)}
                >
                  <EmailBlockRail
                    blockNumber={index + 1}
                    onDragEnd={finishDraggingContentBlock}
                    onDragStart={(event) => startDraggingContentBlock(event, index)}
                    onInsert={() => insertTextBlockAfter(index)}
                    onMove={(direction) => moveContentBlock(index, direction)}
                  />
                  <EmailBlockDropIndicator target={contentBlockDropTarget?.index === index ? contentBlockDropTarget : null} />
                  <EmailTextSegmentEditor
                    ariaLabel={blocks.length === 1 ? ariaLabel : `${ariaLabel}, block ${index + 1}`}
                    onFocus={() => {
                      activeTextSegmentRef.current = index;
                    }}
                    onChange={(nextText, mode) => updateTextBlock(index, nextText, mode)}
                    onInsertImage={(split) => requestImage(index, 'single', split)}
                    onInsertImageRow={(split) => requestImage(index, 'row', split)}
                    onPasteImages={(split, files) => requestImage(
                      index,
                      files.length > 1 ? 'row' : 'single',
                      split,
                      files
                    )}
                    onMergeWithPrevious={() => mergeTextBlockWithPrevious(index)}
                    onSplit={(split) => splitTextBlock(index, split)}
                    placeholder={index === 0
                      ? 'Start writing, or press / for blocks. Use {name} for the recipient.'
                      : 'Start writing, or press / for blocks'}
                    ref={(editor) => {
                      if (editor) textSegmentRefs.current.set(index, editor);
                      else textSegmentRefs.current.delete(index);
                    }}
                    rows={visibleLines}
                    value={block.raw}
                  />
                  <button
                    aria-label={`Delete text block ${index + 1}`}
                    className="absolute right-1 top-1 z-20 inline-flex h-7 w-7 items-center justify-center rounded-md border border-ink-200 bg-white/95 text-ink-400 opacity-100 shadow-sm backdrop-blur transition hover:bg-red-50 hover:text-red-600 focus-visible:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 sm:pointer-events-none sm:opacity-0 sm:group-hover/email-block:pointer-events-auto sm:group-hover/email-block:opacity-100 sm:group-focus-within/email-block:pointer-events-auto sm:group-focus-within/email-block:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeBlock(index);
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    title="Delete block"
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Fragment>
            );
          })}

          {endsWithYouTubeVideo && (
            <div className="-mx-1 mt-1 pl-14 pr-3 sm:-mx-3 sm:px-3">
              <button
                aria-label="Add a content block after the YouTube video"
                className="group flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-ink-200 bg-white text-xs font-medium text-ink-500 transition hover:border-ink-400 hover:bg-ink-50 hover:text-ink-950 focus-visible:border-ink-400 focus-visible:bg-ink-50 focus-visible:text-ink-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-200"
                onClick={() => insertTextBlockAfter(finalBlockIndex)}
                type="button"
              >
                <Plus className="h-4 w-4 transition group-hover:scale-110" />
                Add a block below the video
              </button>
            </div>
          )}

          {pendingImage && (
            <span className="sr-only" role="status">
              Uploading image{pendingImage.progress > 0 ? ` ${pendingImage.progress}%` : ''}
            </span>
          )}
        </div>
      </div>
      <div className="sticky top-20 z-40 hidden self-start xl:block">
        <div className="pointer-events-auto">
          {formattingToolbar(true)}
        </div>
      </div>
    </div>
  );
}

function EmailBlockRail({
  blockNumber,
  onDragEnd,
  onDragStart,
  onInsert,
  onMove,
}: {
  blockNumber: number;
  onDragEnd: () => void;
  onDragStart: (event: ReactDragEvent<HTMLElement>) => void;
  onInsert: () => void;
  onMove: (direction: 'down' | 'up') => void;
}) {
  return (
    <div className="absolute left-0 top-2 z-20 flex items-center text-ink-400 opacity-100 transition sm:left-0 sm:opacity-0 sm:group-hover/email-block:opacity-100 sm:group-focus-within/email-block:opacity-100">
      <button
        aria-label={`Add a content block after block ${blockNumber}`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-ink-100 hover:text-ink-950 focus-visible:bg-ink-100 focus-visible:text-ink-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-300"
        onClick={onInsert}
        onMouseDown={(event) => event.preventDefault()}
        title="Add a block below"
        type="button"
      >
        <Plus className="h-4 w-4" />
      </button>
      <span
        aria-label={`Drag content block ${blockNumber}`}
        className="inline-flex h-8 w-7 touch-none select-none cursor-grab items-center justify-center rounded-md transition hover:bg-ink-100 hover:text-ink-950 focus-visible:bg-ink-100 focus-visible:text-ink-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-300 active:cursor-grabbing"
        draggable
        onDragEnd={onDragEnd}
        onDragStart={onDragStart}
        onKeyDown={(event) => {
          if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
          event.preventDefault();
          onMove(event.key === 'ArrowUp' ? 'up' : 'down');
        }}
        role="button"
        tabIndex={0}
        title="Drag to move this block. Alt + arrow keys also move it."
      >
        <GripVertical className="h-4 w-4" />
      </span>
    </div>
  );
}

function EmailBlockDropIndicator({
  target,
}: {
  target: ContentBlockDropTarget | null;
}) {
  if (!target) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute left-0 right-0 z-30 h-0.5 rounded-full bg-ink-950',
        target.placement === 'before' ? '-top-1' : '-bottom-1'
      )}
    />
  );
}

type EmailLinkDraft = {
  error: string;
  label: string;
  url: string;
};

type YouTubeDraft = {
  error: string;
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

  if (/^H[1-6]$/.test(node.tagName)) {
    const content = serializeEmailEditorInline(node).trim();
    if (!content) return '';
    const level = Number(node.tagName.slice(1));
    return `${'#'.repeat(level)} ${content}\n\n`;
  }
  if (node.tagName === 'BLOCKQUOTE') {
    const content = serializeEmailEditorInline(node).trim();
    const quoteMarker = node.dataset.emailQuoteStyle === 'center'
      ? '>>>'
      : node.dataset.emailQuoteStyle === 'side'
        ? '>>'
        : '>';
    const lines = content
      .replace(/^[“"]|[”"]$/g, '')
      .split('\n')
      .map((line) => `${quoteMarker} ${line.trim()}`)
      .filter((line) => line !== `${quoteMarker} `);
    return lines.length ? `${lines.join('\n')}\n\n` : '';
  }
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
    if (node.hasAttribute('data-email-toc')) return '[[toc]]\n\n';
    if (node.hasAttribute('data-email-youtube')) {
      const video = parseYouTubeVideoUrl(node.dataset.emailYoutubeUrl || '');
      return video ? `:::youtube ${video.url}\n\n` : '';
    }
    if (node.hasAttribute('data-email-footnote')) {
      const content = node.querySelector<HTMLElement>('[data-email-footnote-content]');
      const label = content ? serializeEmailEditorInline(content).trim() : 'Footnote';
      return `:::footnote ${label || 'Footnote'}\n\n`;
    }
    if (node.hasAttribute('data-email-section')) {
      const label = serializeEmailEditorInline(node).trim() || 'Section';
      return `:::section ${label}\n\n`;
    }
    if (node.hasAttribute('data-email-columns')) {
      const columns = Array.from(node.children)
        .filter((child) => child.hasAttribute('data-email-column'))
        .map((child) => serializeEmailEditorInline(child).replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      return columns.length >= 2
        ? `:::columns ${columns[0]} ||| ${columns[1]}\n\n`
        : '';
    }
    const containsBlock = Array.from(node.children).some((child) =>
      ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'HR', 'UL', 'OL', 'P', 'DIV'].includes(child.tagName)
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

const PASTED_EMAIL_BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'OL', 'LI']);
const PASTED_EMAIL_INLINE_TAGS = new Map([
  ['B', 'strong'],
  ['STRONG', 'strong'],
  ['I', 'em'],
  ['EM', 'em'],
]);
const DISCARDED_PASTED_EMAIL_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'SVG',
  'MATH',
  'IMG',
]);

function sanitisePastedEmailHtml(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');

  function sanitiseNode(node: Node): DocumentFragment {
    const fragment = document.createDocumentFragment();
    if (node.nodeType === Node.TEXT_NODE) {
      fragment.append(document.createTextNode(node.textContent || ''));
      return fragment;
    }
    if (!(node instanceof HTMLElement) || DISCARDED_PASTED_EMAIL_TAGS.has(node.tagName)) {
      return fragment;
    }

    if (node.tagName === 'BR' || node.tagName === 'HR') {
      fragment.append(document.createElement(node.tagName.toLowerCase()));
      return fragment;
    }

    const content = document.createDocumentFragment();
    node.childNodes.forEach((child) => content.append(sanitiseNode(child)));

    const fontWeight = node.style.fontWeight.toLowerCase();
    const styleIsBold = fontWeight === 'bold'
      || fontWeight === 'bolder'
      || (/^[6-9]00$/.test(fontWeight));
    const styleIsItalic = node.style.fontStyle.toLowerCase() === 'italic'
      || node.style.fontStyle.toLowerCase() === 'oblique';
    let styledContent: DocumentFragment | HTMLElement = content;

    if (styleIsItalic && node.tagName !== 'I' && node.tagName !== 'EM') {
      const emphasis = document.createElement('em');
      emphasis.append(styledContent);
      styledContent = emphasis;
    }
    if (styleIsBold && node.tagName !== 'B' && node.tagName !== 'STRONG') {
      const strong = document.createElement('strong');
      strong.append(styledContent);
      styledContent = strong;
    }

    if (node.tagName === 'A') {
      const href = normaliseEmailLinkUrl(node.getAttribute('href') || '');
      if (!href) {
        fragment.append(styledContent);
        return fragment;
      }
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.style.color = 'inherit';
      anchor.style.textDecoration = 'underline';
      anchor.style.textUnderlineOffset = '2px';
      anchor.append(styledContent);
      fragment.append(anchor);
      return fragment;
    }

    const inlineTag = PASTED_EMAIL_INLINE_TAGS.get(node.tagName);
    const outputTag = inlineTag || (PASTED_EMAIL_BLOCK_TAGS.has(node.tagName)
      ? node.tagName.toLowerCase()
      : null);
    if (!outputTag) {
      fragment.append(styledContent);
      return fragment;
    }

    const output = document.createElement(outputTag);
    output.append(styledContent);
    fragment.append(output);
    return fragment;
  }

  const result = document.createDocumentFragment();
  parsed.body.childNodes.forEach((node) => result.append(sanitiseNode(node)));
  return result;
}

function EmailImageBorderPanel({
  border,
  onAdd,
  onChange,
  onClose,
  onRemove,
}: {
  border: EmailImageBorder | null;
  onAdd: () => void;
  onChange: (border: EmailImageBorder) => void;
  onClose: () => void;
  onRemove: () => void;
}) {
  const fieldLabel = 'mb-2 flex items-center justify-between text-xs font-semibold text-ink-700';

  return (
    <div
      aria-label="Image border settings"
      className="absolute right-2 top-14 z-50 w-[18rem] space-y-4 rounded-xl border border-ink-200 bg-white p-4 shadow-2xl shadow-black/15"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onClose();
      }}
      role="dialog"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-950">Image border</p>
          <p className="mt-0.5 text-[11px] text-ink-500">The preview and sent email use these exact settings.</p>
        </div>
        <button
          aria-label="Close image border settings"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-500 transition hover:bg-ink-100 hover:text-ink-950"
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!border ? (
        <button
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-ink-950 px-3 text-xs font-semibold text-white transition hover:bg-ink-800"
          onClick={onAdd}
          type="button"
        >
          <span aria-hidden="true" className="h-3.5 w-3.5 rounded-[3px] border border-current" />
          Add border
        </button>
      ) : (
        <>
          <label className="block">
            <span className={fieldLabel}>
              <span>Radius</span>
              <span className="rounded-md bg-ink-100 px-2 py-1 font-mono text-[11px] text-ink-700">{border.radius}px</span>
            </span>
            <input
              aria-label="Image border radius"
              className="h-1.5 w-full cursor-pointer accent-ink-950"
              max={32}
              min={0}
              onChange={(event) => onChange({ ...border, radius: Number(event.target.value) })}
              step={1}
              type="range"
              value={border.radius}
            />
          </label>

          <label className="block">
            <span className={fieldLabel}>
              <span>Thickness</span>
              <span className="rounded-md bg-ink-100 px-2 py-1 font-mono text-[11px] text-ink-700">{border.width}px</span>
            </span>
            <input
              aria-label="Image border thickness"
              className="h-1.5 w-full cursor-pointer accent-ink-950"
              max={8}
              min={1}
              onChange={(event) => onChange({ ...border, width: Number(event.target.value) })}
              step={1}
              type="range"
              value={border.width}
            />
          </label>

          <div>
            <p className={fieldLabel}>Style</p>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-ink-100 p-1">
              {(['solid', 'dashed', 'dotted'] as const).map((style) => (
                <button
                  aria-pressed={border.style === style}
                  className={cn(
                    'h-8 rounded-md px-2 text-xs font-medium capitalize text-ink-600 transition hover:text-ink-950',
                    border.style === style && 'bg-white text-ink-950 shadow-sm'
                  )}
                  key={style}
                  onClick={() => onChange({ ...border, style })}
                  type="button"
                >
                  {style}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between rounded-lg border border-ink-200 p-2.5">
            <span className="text-xs font-semibold text-ink-700">Border colour</span>
            <span className="flex items-center gap-2 font-mono text-[11px] text-ink-500">
              #{border.color}
              <input
                aria-label="Image border colour"
                className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
                onChange={(event) => onChange({ ...border, color: event.target.value.slice(1) })}
                type="color"
                value={`#${border.color}`}
              />
            </span>
          </label>

          <div className="flex items-center justify-between border-t border-ink-200 pt-3">
            <button
              className="h-8 rounded-md px-2 text-xs font-medium text-ink-600 transition hover:bg-ink-100 hover:text-ink-950"
              onClick={() => onChange({ ...DEFAULT_EMAIL_IMAGE_BORDER })}
              type="button"
            >
              Reset
            </button>
            <button
              className="h-8 rounded-md px-2 text-xs font-medium text-red-600 transition hover:bg-red-50"
              onClick={onRemove}
              type="button"
            >
              Remove border
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function pastedImageFiles(clipboardData: DataTransfer) {
  const itemFiles = Array.from(clipboardData.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  const files = itemFiles.length > 0
    ? itemFiles
    : Array.from(clipboardData.files).filter((file) => file.type.startsWith('image/'));
  return files.slice(0, 3);
}

const EmailTextSegmentEditor = forwardRef<EmailTextSegmentEditorHandle, {
  ariaLabel: string;
  onChange: (value: string, mode: EmailHistoryMode) => void;
  onFocus: () => void;
  onInsertImage: (split: { after: string; before: string }) => void;
  onInsertImageRow: (split: { after: string; before: string }) => void;
  onPasteImages: (split: { after: string; before: string }, files: File[]) => void;
  onMergeWithPrevious: () => boolean;
  onSplit: (split: { after: string; before: string }) => void;
  placeholder: string;
  rows: number;
  value: string;
}>(function EmailTextSegmentEditor({
  ariaLabel,
  onChange,
  onFocus,
  onInsertImage,
  onInsertImageRow,
  onPasteImages,
  onMergeWithPrevious,
  onSplit,
  placeholder,
  rows,
  value,
}, ref) {
  const segmentRootRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const youtubeInputRef = useRef<HTMLInputElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const formattingRangeRef = useRef<Range | null>(null);
  const insertionRangeRef = useRef<Range | null>(null);
  const lastEmittedRef = useRef('');
  const initialHtmlRef = useRef(renderEmailEditorHtml(value));
  const initialValueRef = useRef(value);
  const didInitialiseEditorRef = useRef(false);
  const [linkDraft, setLinkDraft] = useState<EmailLinkDraft | null>(null);
  const [youtubeDraft, setYoutubeDraft] = useState<YouTubeDraft | null>(null);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashMenuPosition, setSlashMenuPosition] = useState<{
    left: number;
    maxHeight: number;
    openAbove: boolean;
    top: number;
    width: number;
  } | null>(null);
  const [selectionToolbar, setSelectionToolbar] = useState<{ left: number; top: number } | null>(null);

  const attachEditorRef = useCallback((node: HTMLDivElement | null) => {
    editorRef.current = node;
    if (!node || didInitialiseEditorRef.current) return;
    node.innerHTML = initialHtmlRef.current;
    lastEmittedRef.current = initialValueRef.current;
    didInitialiseEditorRef.current = true;
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor || value === lastEmittedRef.current) return;
    editor.innerHTML = renderEmailEditorHtml(value);
    lastEmittedRef.current = value;
  }, [value]);

  useLayoutEffect(() => {
    if (!slashMenuOpen) {
      setSlashMenuPosition(null);
      return;
    }

    function positionMenu() {
      const root = segmentRootRef.current;
      if (!root) return;
      const bounds = root.getBoundingClientRect();
      const viewportPadding = 12;
      const desiredHeight = 480;
      const width = Math.min(480, window.innerWidth - (viewportPadding * 2));
      const spaceAbove = Math.max(0, bounds.top - viewportPadding);
      const spaceBelow = Math.max(0, window.innerHeight - bounds.bottom - viewportPadding);
      const openAbove = spaceBelow < 320 && spaceAbove > spaceBelow;
      const availableHeight = openAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(180, Math.min(desiredHeight, availableHeight - 8));
      const idealLeft = bounds.left + (bounds.width / 2);
      const left = Math.max(
        viewportPadding + (width / 2),
        Math.min(window.innerWidth - viewportPadding - (width / 2), idealLeft)
      );

      setSlashMenuPosition({
        left,
        maxHeight,
        openAbove,
        top: openAbove ? bounds.top - 8 : bounds.bottom + 8,
        width,
      });
    }

    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [slashMenuOpen]);

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

  function rememberInsertionPoint() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;

    const range = selection.getRangeAt(0);
    if (range.commonAncestorContainer !== editor && !editor.contains(range.commonAncestorContainer)) return;
    insertionRangeRef.current = range.cloneRange();
  }

  function selectRange(range: Range) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function updateSelectionToolbar() {
    const editor = editorRef.current;
    const root = segmentRootRef.current;
    const selection = window.getSelection();
    if (!editor || !root || !selection?.rangeCount) {
      setSelectionToolbar(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const insideEditor = range.commonAncestorContainer === editor
      || editor.contains(range.commonAncestorContainer);
    if (!insideEditor || range.collapsed || !range.toString().trim()) {
      setSelectionToolbar(null);
      return;
    }

    const rangeRect = range.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const left = Math.max(
      58,
      Math.min(rootRect.width - 58, rangeRect.left - rootRect.left + (rangeRect.width / 2))
    );
    formattingRangeRef.current = range.cloneRange();
    setSlashMenuOpen(false);
    setSelectionToolbar({
      left,
      top: rangeRect.top - rootRect.top - 42,
    });
  }

  function focusAt(position: 'start' | 'end') {
    const editor = editorRef.current;
    if (!editor) return;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(position === 'start');
    selectRange(range);
    onFocus();
    rememberInsertionPoint();
  }

  function caretIsAtEditorStart() {
    const editor = editorRef.current;
    const range = currentEditorRange();
    if (!editor || !range?.collapsed) return false;
    const before = document.createRange();
    before.selectNodeContents(editor);
    before.setEnd(range.startContainer, range.startOffset);
    return before.toString().length === 0;
  }

  function caretIsInsideList() {
    const editor = editorRef.current;
    const range = currentEditorRange();
    if (!editor || !range) return false;
    const element = range.startContainer instanceof HTMLElement
      ? range.startContainer
      : range.startContainer.parentElement;
    const listItem = element?.closest('li');
    return Boolean(listItem && editor.contains(listItem));
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

  function emitChange(mode: EmailHistoryMode = 'typing') {
    const editor = editorRef.current;
    if (!editor) return;
    const nextValue = extractEmailEditorValue(editor);
    lastEmittedRef.current = nextValue;
    onChange(nextValue, mode);
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
    emitChange('structural');
  }

  function insertFragmentAtRange(range: Range, fragment: DocumentFragment) {
    const lastNode = fragment.lastChild;
    if (!lastNode) return false;
    range.deleteContents();
    range.insertNode(fragment);
    const nextRange = document.createRange();
    nextRange.setStartAfter(lastNode);
    nextRange.collapse(true);
    selectRange(nextRange);
    emitChange('structural');
    return true;
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

  function splitAtCaret() {
    const editor = editorRef.current;
    const activeRange = editor && document.activeElement === editor
      ? currentEditorRange()
      : null;
    const range = activeRange || insertionRangeRef.current?.cloneRange() || currentEditorRange();
    insertionRangeRef.current = null;
    if (!editor || !range) return { before: value, after: '' };

    const caretElement = range.startContainer instanceof HTMLElement
      ? range.startContainer
      : range.startContainer.parentElement;
    const activeHeading = caretElement?.closest<HTMLElement>('h1, h2, h3, h4, h5, h6');
    const headingMarker = activeHeading && editor.contains(activeHeading)
      ? '#'.repeat(Number(activeHeading.tagName.slice(1)))
      : '';
    let caretAtHeadingEnd = false;
    if (activeHeading && headingMarker) {
      const headingTail = document.createRange();
      headingTail.selectNodeContents(activeHeading);
      headingTail.setStart(range.startContainer, range.startOffset);
      caretAtHeadingEnd = !headingTail.toString().trim();
    }

    // Split the DOM itself instead of inserting a text marker into the current
    // inline element and slicing its serialized Markdown. A marker inserted at
    // the end of <strong>Bold</strong> serializes as **BoldMARKER**, which used
    // to leave an opening ** in the previous block and a closing ** in the new
    // one. Range.cloneContents() creates balanced partial trees on both sides,
    // so bold, italic, links, headings, and quotes always serialize cleanly.
    range.deleteContents();
    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(editor);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const afterRange = document.createRange();
    afterRange.selectNodeContents(editor);
    afterRange.setStart(range.startContainer, range.startOffset);

    const beforeContainer = document.createElement('div');
    beforeContainer.append(beforeRange.cloneContents());
    const afterContainer = document.createElement('div');
    afterContainer.append(afterRange.cloneContents());

    const before = extractEmailEditorValue(beforeContainer).replace(/\n+$/, '');
    let after = extractEmailEditorValue(afterContainer).replace(/^\n+/, '');

    // Chromium can preserve an empty heading as a marker-only Markdown line
    // even though the cloned H1-H6 has no visible text. Enter at the end of a
    // heading always starts a paragraph, so discard only that leading empty
    // heading marker while preserving any real content that follows it.
    if (caretAtHeadingEnd && headingMarker) {
      const afterLines = after.split('\n');
      if (afterLines[0]?.trim() === headingMarker) {
        afterLines.shift();
        while (afterLines[0] === '') afterLines.shift();
        after = afterLines.join('\n');
      }
    }

    // The parent immediately turns this one text editor into
    // text -> image -> text. Because the active contenteditable deliberately
    // ignores prop-driven HTML updates while focused, update its visible DOM
    // now as well; otherwise it continues showing the whole original body and
    // makes the correctly inserted image look as though it was appended.
    editor.innerHTML = renderEmailEditorHtml(before);
    lastEmittedRef.current = before;

    return { before, after };
  }

  function rememberSelection() {
    const range = currentEditorRange();
    formattingRangeRef.current = range?.cloneRange() || null;
  }

  function discardRememberedSelection() {
    formattingRangeRef.current = null;
  }

  function currentBlockquote() {
    const editor = editorRef.current;
    const range = currentEditorRange();
    if (!editor || !range) return null;
    const element = range.startContainer instanceof HTMLElement
      ? range.startContainer
      : range.startContainer.parentElement;
    const quote = element?.closest('blockquote');
    return quote && editor.contains(quote) ? quote as HTMLQuoteElement : null;
  }

  function replaceWithStructuredBlock(markup: string, focusSelector?: string) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = renderEmailEditorHtml(markup);
    lastEmittedRef.current = markup;
    emitChange('structural');

    const focusTarget = focusSelector
      ? editor.querySelector<HTMLElement>(focusSelector)
      : null;
    if (!focusTarget) return;
    const range = document.createRange();
    range.selectNodeContents(focusTarget);
    selectRange(range);
  }

  function applyFormat(format: EmailFormatCommand) {
    const range = formattingRangeRef.current || currentEditorRange();
    formattingRangeRef.current = null;
    if (!range) return;
    selectRange(range);

    if (format === 'paragraph') document.execCommand('formatBlock', false, 'p');
    if (format === 'heading1') document.execCommand('formatBlock', false, 'h1');
    if (format === 'heading2') document.execCommand('formatBlock', false, 'h2');
    if (format === 'heading3') document.execCommand('formatBlock', false, 'h3');
    if (format === 'heading4') document.execCommand('formatBlock', false, 'h4');
    if (format === 'heading5') document.execCommand('formatBlock', false, 'h5');
    if (format === 'heading6') document.execCommand('formatBlock', false, 'h6');
    if (format === 'bold') document.execCommand('bold');
    if (format === 'italic') document.execCommand('italic');
    if (format === 'quote' || format === 'sideQuote' || format === 'centeredQuote') {
      document.execCommand('formatBlock', false, 'blockquote');
      const quote = currentBlockquote();
      if (quote) {
        if (format === 'sideQuote') quote.dataset.emailQuoteStyle = 'side';
        else if (format === 'centeredQuote') quote.dataset.emailQuoteStyle = 'center';
        else delete quote.dataset.emailQuoteStyle;
      }
    }
    if (
      format === 'unorderedList'
      || format === 'dashedList'
      || format === 'orderedList'
    ) applyListFormat(format);
    if (format === 'divider') document.execCommand('insertHorizontalRule');
    if (format === 'section') {
      replaceWithStructuredBlock(':::section Section heading', '[data-email-section]');
      setSelectionToolbar(null);
      return;
    }
    if (format === 'columns') {
      replaceWithStructuredBlock(':::columns Left column ||| Right column', '[data-email-column]');
      setSelectionToolbar(null);
      return;
    }
    if (format === 'tableOfContents') {
      replaceWithStructuredBlock('[[toc]]');
      setSelectionToolbar(null);
      return;
    }
    if (format === 'footnote') {
      replaceWithStructuredBlock(':::footnote Footnote text', '[data-email-footnote-content]');
      setSelectionToolbar(null);
      return;
    }
    if (format === 'youtube') {
      setYoutubeDraft({ error: '', url: '' });
      setSelectionToolbar(null);
      requestAnimationFrame(() => youtubeInputRef.current?.focus());
      return;
    }

    emitChange('structural');
    setSelectionToolbar(null);
  }

  function openCommandMenu() {
    focusAt('start');
    setSelectionToolbar(null);
    setSlashMenuOpen(true);
  }

  useImperativeHandle(ref, () => ({
    applyFormat,
    discardRememberedSelection,
    focusAt,
    insertVariable,
    openCommandMenu,
    openLinkEditor,
    rememberInsertionPoint,
    rememberSelection,
    splitAtCaret,
  }));

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

  function addYouTubeEmbed() {
    if (!youtubeDraft) return;
    const video = parseYouTubeVideoUrl(youtubeDraft.url);
    if (!video) {
      setYoutubeDraft((current) => current
        ? { ...current, error: 'Paste a valid YouTube video, Short, Live, or youtu.be link.' }
        : current);
      return;
    }

    replaceWithStructuredBlock(`:::youtube ${video.url}`);
    setYoutubeDraft(null);
  }

  return (
    <div className="relative" ref={segmentRootRef}>
      {selectionToolbar && (
        <div
          aria-label="Text selection formatting"
          className="absolute z-[60] flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-black/10 bg-ink-950 p-1 text-white shadow-xl shadow-black/20"
          role="toolbar"
          style={{ left: selectionToolbar.left, top: selectionToolbar.top }}
        >
          <button
            aria-label="Bold selected text"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-white/15"
            onClick={() => applyFormat('bold')}
            onMouseDown={(event) => event.preventDefault()}
            title="Bold"
            type="button"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            aria-label="Italicize selected text"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-white/15"
            onClick={() => applyFormat('italic')}
            onMouseDown={(event) => event.preventDefault()}
            title="Italic"
            type="button"
          >
            <Italic className="h-4 w-4" />
          </button>
          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-white/20" />
          <button
            aria-label="Link selected text"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-white/15"
            onClick={() => {
              setSelectionToolbar(null);
              openLinkEditor();
            }}
            onMouseDown={(event) => event.preventDefault()}
            title="Add link"
            type="button"
          >
            <Link2 className="h-4 w-4" />
          </button>
        </div>
      )}
      <div
        aria-label={ariaLabel}
        aria-multiline="true"
        className="email-rich-editor relative w-full whitespace-pre-wrap break-words py-1.5 text-base leading-6 text-ink-900 outline-none sm:text-sm"
        contentEditable
        data-empty={!value || undefined}
        data-placeholder={placeholder}
        onBeforeInput={(event) => {
          unlinkForMutation((event.nativeEvent as InputEvent).inputType || '');
        }}
        onBlur={() => {
          emitChange();
          setSlashMenuOpen(false);
          setSelectionToolbar(null);
        }}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) event.preventDefault();
        }}
        onFocus={() => {
          onFocus();
          requestAnimationFrame(rememberInsertionPoint);
        }}
        onInput={() => {
          setSelectionToolbar(null);
          emitChange();
          rememberInsertionPoint();
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape' && slashMenuOpen) {
            event.preventDefault();
            setSlashMenuOpen(false);
            return;
          }
          if (
            event.key === '/'
            && caretIsAtEditorStart()
            && !(editorRef.current && extractEmailEditorValue(editorRef.current).trim())
          ) {
            event.preventDefault();
            setSlashMenuOpen(true);
            return;
          }
          if (event.key === 'Enter' && !event.shiftKey && !caretIsInsideList()) {
            event.preventDefault();
            setSlashMenuOpen(false);
            onSplit(splitAtCaret());
            return;
          }
          if (event.key === 'Backspace' && caretIsAtEditorStart() && onMergeWithPrevious()) {
            event.preventDefault();
            setSlashMenuOpen(false);
          }
        }}
        onKeyUp={() => {
          rememberInsertionPoint();
          requestAnimationFrame(updateSelectionToolbar);
        }}
        onPointerDown={() => {
          setSelectionToolbar(null);
          onFocus();
        }}
        onPointerUp={() => {
          rememberInsertionPoint();
          requestAnimationFrame(updateSelectionToolbar);
        }}
        onPaste={(event) => {
          event.preventDefault();
          unlinkForMutation('insertFromPaste');
          const images = pastedImageFiles(event.clipboardData);
          if (images.length > 0) {
            onPasteImages(splitAtCaret(), images);
            return;
          }

          const pastedText = event.clipboardData.getData('text/plain');
          const pastedHtml = event.clipboardData.getData('text/html');
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

          if (pastedHtml) {
            const fragment = sanitisePastedEmailHtml(pastedHtml);
            if (insertFragmentAtRange(range, fragment)) return;
          }

          insertAtRange(range, document.createTextNode(pastedText));
        }}
        ref={attachEditorRef}
        role="textbox"
        style={{ minHeight: `${Math.max(rows, 1) * 1.5}rem` }}
        suppressContentEditableWarning
      />

      {slashMenuOpen && slashMenuPosition && createPortal(
        <div
          aria-label="Insert a block"
          className="fixed z-[100] overflow-y-auto rounded-xl border border-ink-200 bg-white p-2 shadow-2xl"
          role="menu"
          style={{
            left: slashMenuPosition.left,
            maxHeight: slashMenuPosition.maxHeight,
            top: slashMenuPosition.top,
            transform: slashMenuPosition.openAbove
              ? 'translate(-50%, -100%)'
              : 'translateX(-50%)',
            width: slashMenuPosition.width,
          }}
        >
          <p className="px-2 pb-1.5 pt-1 text-xs font-medium text-ink-500">Page structure</p>
          <div className="grid grid-cols-2 gap-1">
            <EmailCommandMenuItem icon={<span className="relative h-4 w-4"><span className="absolute left-0 top-0 h-3 w-3 rounded-sm border border-current" /><span className="absolute bottom-0 right-0 h-3 w-3 rounded-sm border border-current bg-white" /></span>} label="Section" onSelect={() => { setSlashMenuOpen(false); applyFormat('section'); }} />
            <EmailCommandMenuItem icon={<Columns2 className="h-4 w-4" />} label="Columns" onSelect={() => { setSlashMenuOpen(false); applyFormat('columns'); }} />
            <EmailCommandMenuItem icon={<Minus className="h-4 w-4" />} label="Content break" onSelect={() => { setSlashMenuOpen(false); applyFormat('divider'); }} />
            <EmailCommandMenuItem icon={<ListChecks className="h-4 w-4" />} label="Table of contents" onSelect={() => { setSlashMenuOpen(false); applyFormat('tableOfContents'); }} />
            <EmailCommandMenuItem icon={<span className="font-serif text-base">T<sup className="text-[9px]">*</sup></span>} label="Footnote" onSelect={() => { setSlashMenuOpen(false); applyFormat('footnote'); }} />
          </div>

          <div className="my-2 border-t border-ink-200" />
          <p className="px-2 pb-1.5 text-xs font-medium text-ink-500">Media</p>
          <div className="grid grid-cols-2 gap-1">
            <EmailCommandMenuItem icon={<ImageIcon className="h-4 w-4" />} label="Image" onSelect={() => { setSlashMenuOpen(false); onInsertImage(splitAtCaret()); }} />
            <EmailCommandMenuItem icon={<Columns2 className="h-4 w-4" />} label="Image row" onSelect={() => { setSlashMenuOpen(false); onInsertImageRow(splitAtCaret()); }} />
          </div>

          <div className="my-2 border-t border-ink-200" />
          <p className="px-2 pb-1.5 text-xs font-medium text-ink-500">Embeds</p>
          <div className="grid grid-cols-2 gap-1">
            <EmailCommandMenuItem icon={<Video className="h-4 w-4" />} label="YouTube" onSelect={() => { setSlashMenuOpen(false); applyFormat('youtube'); }} />
          </div>
        </div>,
        document.body
      )}

      {youtubeDraft && (
        <div className="my-2 space-y-2 rounded-md border border-ink-200 bg-ink-50 p-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-ink-600">YouTube link</span>
            <AceternityInput
              inputMode="url"
              onChange={(event) => setYoutubeDraft((current) => current
                ? { ...current, error: '', url: event.target.value }
                : current)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addYouTubeEmbed();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setYoutubeDraft(null);
                  requestAnimationFrame(() => focusAt('end'));
                }
              }}
              placeholder="https://www.youtube.com/watch?v=..."
              ref={youtubeInputRef}
              value={youtubeDraft.url}
            />
          </label>
          {youtubeDraft.error && (
            <p className="text-xs text-red-600" role="alert">{youtubeDraft.error}</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              className="h-8 rounded-md px-2.5 text-xs font-medium text-ink-600 transition hover:bg-white"
              onClick={() => {
                setYoutubeDraft(null);
                requestAnimationFrame(() => focusAt('end'));
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-ink-950 px-3 text-xs font-semibold text-white transition hover:bg-ink-800"
              onClick={addYouTubeEmbed}
              type="button"
            >
              <Video className="h-3.5 w-3.5" />
              Add video
            </button>
          </div>
        </div>
      )}

      {linkDraft && (
        <div className="my-2 space-y-2 rounded-md border border-ink-200 bg-ink-50 p-3">
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

function EmailCommandMenuItem({
  disabled = false,
  icon,
  label,
  onSelect,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      aria-disabled={disabled || undefined}
      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink-800 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:text-ink-300"
      disabled={disabled}
      onClick={onSelect}
      onMouseDown={(event) => event.preventDefault()}
      role="menuitem"
      type="button"
    >
      <span className="flex h-6 w-7 shrink-0 items-center justify-center text-current">
        {icon}
      </span>
      <span className="truncate font-medium">{label}</span>
    </button>
  );
}

function EmailPreviewDialog({
  body,
  kind,
  onClose,
  previewText,
  subject,
}: {
  body: string;
  kind: 'delivery' | 'follow-up';
  onClose: () => void;
  previewText: string;
  subject: string;
}) {
  useModalAccessibility(onClose);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const documentHtml = useMemo(() => {
    const sampleBody = body.replace(/{name}/g, 'Alex').replace(/{download_link}/g, '#');
    const rendered = kind === 'follow-up'
      ? renderFollowUpEmailHtml(sampleBody, previewText, '#')
      : renderDeliveryEmailHtml(sampleBody, previewText);
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"></head><body style="margin:0;background:#ffffff">${rendered}</body></html>`;
  }, [body, kind, previewText]);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black/55 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label="Email preview">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-ink-200 bg-white shadow-2xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-200 px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink-950">{subject || 'Untitled email'}</p>
            <p className="truncate text-xs text-ink-500">{previewText || 'No preview text yet'}</p>
          </div>
          <div className="flex rounded-lg border border-ink-200 bg-ink-50 p-1">
            {([
              ['desktop', Monitor, 'Desktop'],
              ['mobile', Smartphone, 'Mobile'],
            ] as const).map(([value, Icon, label]) => (
              <button
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition',
                  device === value ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-500 hover:text-ink-900'
                )}
                key={value}
                onClick={() => setDevice(value)}
                type="button"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          <button
            className="inline-flex h-9 items-center justify-center rounded-md border border-ink-200 px-3 text-sm font-medium text-ink-700 transition hover:bg-ink-50"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-[#e8e6e1] p-3 sm:p-6">
          <iframe
            className="h-full min-h-[640px] bg-white shadow-xl transition-[width] duration-200"
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            srcDoc={documentHtml}
            style={{ width: device === 'mobile' ? 390 : '100%', maxWidth: device === 'mobile' ? 390 : 920 }}
            title={`${subject || 'Email'} preview`}
          />
        </div>
      </div>
    </div>
  );
}

function MagnetsEmailFooterBlock({ edgeToEdge = false }: { edgeToEdge?: boolean }) {
  return (
    <div
      className={cn(
        'mt-7 rounded-xl bg-[#080d18] px-5 py-8 text-center sm:px-8',
        edgeToEdge && '-mx-6 -mb-7 rounded-b-lg'
      )}
      aria-label="Email footer"
    >
      <a
        className="inline-flex items-center gap-2 rounded-md border border-ink-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 shadow-sm transition hover:bg-ink-50 focus:outline-none focus:ring-2 focus:ring-white/60"
        href="https://magnets.so"
        rel="noopener noreferrer"
        target="_blank"
      >
        <MagnetsLogoMark className="h-5 w-5" tile />
        Powered by Magnets
      </a>
    </div>
  );
}

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
  onAddImage: (insertion: EmailImageInsertion, files?: File[]) => void;
  onPatch: (updates: Partial<LeadMagnet>) => void;
  pendingImage: PendingEmailImage | null;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="bg-ink-50 px-4 py-8 sm:px-8 sm:py-10">
      {previewOpen && (
        <EmailPreviewDialog
          body={leadMagnet.emailBody}
          kind="delivery"
          onClose={() => setPreviewOpen(false)}
          previewText={leadMagnet.emailPreview}
          subject={leadMagnet.emailSubject}
        />
      )}
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="rounded-lg border border-ink-200 bg-white">
          <div className="flex items-center gap-2 border-b border-ink-200 bg-ink-50 px-5 py-3 text-xs text-ink-500">
            <Mail className="h-4 w-4 text-ink-700" />
            <span className="font-medium">Delivery email</span>
            <span className="ml-auto hidden font-mono text-[10px] sm:block">{account.resendFromEmail || 'Magnets <hello@mail.magnets.so>'}</span>
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-xs font-semibold text-ink-800 transition hover:bg-ink-50 disabled:cursor-wait disabled:opacity-50"
              disabled={isUploadingEmailImage}
              onClick={() => setPreviewOpen(true)}
              type="button"
            >
              {isUploadingEmailImage
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Eye className="h-3.5 w-3.5" />}
              {isUploadingEmailImage ? 'Uploading' : 'Preview'}
            </button>
          </div>

          <div className="px-6 py-7">
            <div className="mb-7 space-y-5 border-b border-ink-100 pb-6">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-ink-500">Subject</span>
                <InlineText
                  ariaLabel="Email subject"
                  as="div"
                  className="block text-2xl font-semibold leading-tight text-ink-950"
                  emptyPlaceholder="What people see in the inbox"
                  maxLength={140}
                  onChange={(value) => onPatch({ emailSubject: value })}
                  value={leadMagnet.emailSubject}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-ink-500">Preview text</span>
                <InlineText
                  ariaLabel="Email preview text"
                  as="div"
                  className="block text-sm leading-6 text-ink-600"
                  emptyPlaceholder="A short teaser shown after the subject"
                  maxLength={160}
                  onChange={(value) => onPatch({ emailPreview: value })}
                  value={leadMagnet.emailPreview}
                />
              </label>
            </div>
            <p className="mb-3 text-xs font-medium text-ink-700">Body</p>
            <EmailBodyEditor
              ariaLabel="Email body"
              isUploadingImage={isUploadingEmailImage}
              onAddImage={onAddImage}
              onChange={(value) => onPatch({ emailBody: value })}
              pendingImage={pendingImage}
              value={leadMagnet.emailBody}
            />
            <MagnetsEmailFooterBlock edgeToEdge />
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
  onAddImage: (emailId: string, insertion: EmailImageInsertion, files?: File[]) => void;
  onPatch: (updates: Partial<LeadMagnet>) => void;
  onUpdateEmail: (
    emailId: string,
    updates: Partial<LeadMagnet['followUpEmails'][number]>
  ) => void;
  pendingImage: PendingEmailImage | null;
}) {
  const [delayDrafts, setDelayDrafts] = useState<Record<string, string>>({});
  const [activeEmailId, setActiveEmailId] = useState(leadMagnet.followUpEmails[0]?.id || '');
  const [previewOpen, setPreviewOpen] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
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
    const email = newFollowUpEmail();
    onPatch({
      followUpEmails: [
        ...leadMagnet.followUpEmails,
        email,
      ],
    });
    setActiveEmailId(email.id);
  }

  useEffect(() => {
    if (leadMagnet.followUpEmails.some((email) => email.id === activeEmailId)) return;
    setActiveEmailId(leadMagnet.followUpEmails[0]?.id || '');
  }, [activeEmailId, leadMagnet.followUpEmails]);

  const activeIndex = Math.max(0, leadMagnet.followUpEmails.findIndex((email) => email.id === activeEmailId));
  const activeEmail = leadMagnet.followUpEmails[activeIndex];

  function selectRelativeEmail(direction: -1 | 1) {
    if (leadMagnet.followUpEmails.length === 0) return;
    const nextIndex = Math.max(0, Math.min(leadMagnet.followUpEmails.length - 1, activeIndex + direction));
    setActiveEmailId(leadMagnet.followUpEmails[nextIndex].id);
  }

  function removeActiveEmail() {
    if (!activeEmail) return;
    const remaining = leadMagnet.followUpEmails.filter((email) => email.id !== activeEmail.id);
    setActiveEmailId(remaining[Math.min(activeIndex, remaining.length - 1)]?.id || '');
    onPatch({ followUpEmails: remaining });
  }

  return (
    <div className="bg-ink-50 px-4 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-4">
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

        {activeEmail && previewOpen && (
          <EmailPreviewDialog
            body={activeEmail.body}
            kind="follow-up"
            onClose={() => setPreviewOpen(false)}
            previewText={activeEmail.preview}
            subject={activeEmail.subject}
          />
        )}

        {leadMagnet.followUpEmails.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-300 bg-white p-8 text-center">
            <p className="text-sm font-semibold text-ink-950">No follow-up emails yet</p>
            <p className="mt-1 text-xs text-ink-500">Add up to 10 emails to build this magnet&apos;s sequence.</p>
            <AceternityButton className="mt-4" disabled={!leadMagnet.followUpEnabled} onClick={addEmail} variant="secondary">
              <Plus className="h-4 w-4" />
              Add first email
            </AceternityButton>
          </div>
        ) : activeEmail ? (
          <div className="overflow-clip rounded-lg border border-ink-200 bg-white lg:grid lg:grid-cols-[230px_minmax(0,1fr)]">
            <aside className="border-b border-ink-200 bg-ink-50 lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Sequence</p>
                <button
                  aria-label="Add email"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-600 hover:bg-white"
                  disabled={!leadMagnet.followUpEnabled || leadMagnet.followUpEmails.length >= 10}
                  onClick={addEmail}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:overflow-visible">
                {leadMagnet.followUpEmails.map((email, index) => {
                  const delay = followUpDelayMinutes(email);
                  return (
                    <button
                      className={cn(
                        'min-w-[180px] rounded-lg border p-3 text-left transition lg:block lg:w-full lg:min-w-0',
                        email.id === activeEmail.id
                          ? 'border-ink-950 bg-ink-950 text-white'
                          : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300'
                      )}
                      key={email.id}
                      onClick={() => setActiveEmailId(email.id)}
                      type="button"
                    >
                      <span className="flex items-center justify-between gap-2 text-xs font-semibold">
                        Email {followUpEmailNumber(index)}
                        <span className={email.id === activeEmail.id ? 'text-white/60' : 'text-ink-400'}>
                          {delay >= 1440 ? `${Math.round(delay / 1440)}d` : delay >= 60 ? `${Math.round(delay / 60)}h` : `${delay}m`}
                        </span>
                      </span>
                      <span className={cn('mt-1 block truncate text-[11px]', email.id === activeEmail.id ? 'text-white/70' : 'text-ink-500')}>
                        {email.subject || 'Untitled email'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section
              onTouchEnd={(event) => {
                const start = touchStartXRef.current;
                touchStartXRef.current = null;
                if (start === null) return;
                const distance = event.changedTouches[0]?.clientX - start;
                if (Math.abs(distance) < 70) return;
                selectRelativeEmail(distance < 0 ? 1 : -1);
              }}
              onTouchStart={(event) => {
                touchStartXRef.current = event.touches[0]?.clientX ?? null;
              }}
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 bg-white px-4 py-3 sm:px-5">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-ink-700" />
                  <p className="truncate text-sm font-semibold text-ink-950">Email {followUpEmailNumber(activeIndex)}</p>
                </div>
                <button
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-200 px-2.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 disabled:cursor-wait disabled:opacity-50"
                  disabled={Boolean(emailImageUploadTarget)}
                  onClick={() => setPreviewOpen(true)}
                  type="button"
                >
                  {emailImageUploadTarget
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Eye className="h-3.5 w-3.5" />}
                  {emailImageUploadTarget ? 'Uploading' : 'Preview'}
                </button>
                <button
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-red-600 hover:bg-red-50"
                  onClick={removeActiveEmail}
                  type="button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              </div>

              {(() => {
                const delayMinutes = followUpDelayMinutes(activeEmail);
                const delayUnit = followUpDelayUnit(delayMinutes);
                const delayValue = delayUnit === 'hours' ? delayMinutes / 60 : delayMinutes;
                const delayInputValue = delayDrafts[activeEmail.id] ?? String(delayValue);
                return (
                  <div className="space-y-4 p-4 sm:p-5">
                    <label className="block">
                      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-700">
                        <Clock className="h-3.5 w-3.5" />
                        Delay from previous email
                      </span>
                      <div className="flex max-w-sm items-center gap-2">
                        <AceternityInput
                          inputMode="numeric"
                          onBlur={() => clearDelayDraft(activeEmail.id)}
                          onChange={(event) => {
                            const rawValue = event.target.value.trim();
                            if (!/^\d*$/.test(rawValue)) return;
                            updateDelayDraft(activeEmail.id, rawValue);
                            const value = rawValue === '' ? 0 : Number(rawValue);
                            updateEmail(activeIndex, delayPatchFromMinutes(delayUnit === 'hours' ? value * 60 : value));
                          }}
                          pattern="[0-9]*"
                          type="text"
                          value={delayInputValue}
                        />
                        <select
                          aria-label={`Delay unit for email ${followUpEmailNumber(activeIndex)}`}
                          className="h-11 rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-800 outline-none transition focus:border-ink-500 focus:ring-2 focus:ring-ink-100"
                          onChange={(event) => {
                            const nextUnit = event.target.value === 'minutes' ? 'minutes' : 'hours';
                            const value = delayInputValue === '' ? 0 : Number(delayInputValue);
                            clearDelayDraft(activeEmail.id);
                            updateEmail(activeIndex, delayPatchFromMinutes(nextUnit === 'hours' ? value * 60 : value));
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
                      <AceternityInput onChange={(event) => updateEmail(activeIndex, { subject: event.target.value })} placeholder="Quick follow-up" value={activeEmail.subject} />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-ink-700">Preview text</span>
                      <AceternityInput onChange={(event) => updateEmail(activeIndex, { preview: event.target.value })} placeholder="Short inbox teaser" value={activeEmail.preview} />
                    </label>
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-ink-700">Body</p>
                      <EmailBodyEditor
                        ariaLabel={`Body for email ${followUpEmailNumber(activeIndex)}`}
                        isUploadingImage={Boolean(emailImageUploadTarget)}
                        onAddImage={(insertion, files) => onAddImage(activeEmail.id, insertion, files)}
                        onChange={(value) => onUpdateEmail(activeEmail.id, { body: value })}
                        pendingImage={pendingImage?.target.kind === 'follow-up' && pendingImage.target.emailId === activeEmail.id ? pendingImage : null}
                        value={activeEmail.body}
                      />
                      <MagnetsEmailFooterBlock />
                    </div>

                    <div className="flex items-center justify-between border-t border-ink-100 pt-4">
                      <button className="inline-flex h-8 items-center gap-1 text-xs font-medium text-ink-600 disabled:opacity-30" disabled={activeIndex === 0} onClick={() => selectRelativeEmail(-1)} type="button">
                        <ChevronLeft className="h-4 w-4" /> Previous
                      </button>
                      <span className="text-[11px] font-medium text-ink-400">
                        Swipe on mobile · Email {followUpEmailNumber(activeIndex)} of {leadMagnet.followUpEmails.length + 1}
                      </span>
                      <button className="inline-flex h-8 items-center gap-1 text-xs font-medium text-ink-600 disabled:opacity-30" disabled={activeIndex === leadMagnet.followUpEmails.length - 1} onClick={() => selectRelativeEmail(1)} type="button">
                        Next <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })()}
            </section>
          </div>
        ) : null}
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
                    ? 'border-ink-950 bg-ink-950 text-white'
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
                    ? 'text-white/70'
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
