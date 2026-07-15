'use client';

import type { CSSProperties, ChangeEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadPresigned } from '@vercel/blob/client';
import {
  ArrowLeft,
  CalendarCheck,
  Check,
  Clock,
  ExternalLink,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  Mail,
  Plus,
  Save,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { brandHighlightOpacity } from '@/lib/brand-highlight';
import {
  appendEmailImage,
  parseEmailBodySegments,
  removeEmailBodySegment,
  replaceEmailBodySegment,
} from '@/lib/email-body-images';
import type { DashboardPayload, LeadMagnet } from '@/lib/types';
import { PageHeader } from '@/components/dashboard/app-shell';
import {
  AceternityButton,
  AceternityCard,
  AceternityInput,
  AceternityTextarea,
} from '@/components/ui/aceternity';
import { ConfirmDialog } from '@/components/dashboard/confirm-dialog';
import { EditableHotspot, InlineParagraphs, InlineText } from '@/components/dashboard/inline-edit';

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

export function PageEditorClient({
  initialData,
  initialLeadMagnet,
}: {
  initialData: DashboardPayload;
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
      setError(err instanceof Error ? err.message : 'Image could not be uploaded.');
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
      setError(err instanceof Error ? err.message : 'Email image could not be uploaded.');
    } finally {
      setIsUploadingEmailImage(false);
      setEmailImageUploadTarget(null);
      setPendingEmailImage(null);
      window.setTimeout(() => URL.revokeObjectURL(previewUrl), 0);
      event.target.value = '';
    }
  }

  const brand = account.brand;
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

        <AceternityCard className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-[#dfd8cf] bg-white p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
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

              <div className="flex min-h-10 w-full items-center overflow-x-auto overflow-y-hidden rounded-md border border-ink-200 bg-ink-50 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-auto">
                {(['page', 'email', 'sequence', 'after'] as const).map((item) => (
                  <button
                    key={item}
                    className={cn(
                      'h-7 shrink-0 rounded-sm px-2.5 text-xs font-medium capitalize transition',
                      mode === item
                        ? 'bg-ink-950 text-white'
                        : 'text-ink-500 hover:text-ink-900'
                    )}
                    onClick={() => setMode(item)}
                    type="button"
                  >
                    {item === 'after' ? 'After signup' : item}
                  </button>
                ))}
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
            Tip: in the email body, use <code className="rounded bg-ink-100 px-1 font-mono text-[10px] text-ink-800">{'{name}'}</code> for the recipient name. Use Add image to insert hosted images.
          </p>
        )}
      </div>
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
  account: DashboardPayload['account'];
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
    <div className={`magnet-page relative ${isDark ? 'magnet-page--dark' : 'bg-white text-zinc-900'}`} style={previewStyle}>
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
        <div className="magnet-page-muted mx-auto flex max-w-[1280px] items-center justify-center px-4 text-center text-sm text-gray-500 sm:px-6 lg:px-8">
          <span>All rights reserved {new Date().getFullYear()}</span>
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
  account: DashboardPayload['account'];
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

function EmailBodyEditor({
  ariaLabel,
  onChange,
  pendingImage,
  value,
}: {
  ariaLabel: string;
  onChange: (value: string) => void;
  pendingImage: PendingEmailImage | null;
  value: string;
}) {
  const segments = parseEmailBodySegments(value);

  return (
    <div className="space-y-3 rounded-lg border border-ink-200 bg-white p-3">
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
            <AceternityTextarea
              aria-label={segments.length === 1 ? ariaLabel : `${ariaLabel}, text section ${index + 1}`}
              className="min-h-0 resize-y border-0 px-2 py-1 shadow-none focus:ring-0"
              onChange={(event) => onChange(replaceEmailBodySegment(value, index, event.target.value))}
              placeholder={index === 0
                ? 'Write the email. Use {name} for the recipient.'
                : 'Continue writing below the image...'}
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

function EmailCanvas({
  account,
  isUploadingEmailImage,
  leadMagnet,
  onAddImage,
  onPatch,
  pendingImage,
}: {
  account: DashboardPayload['account'];
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
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-ink-700">Body</span>
              <button
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-xs font-medium text-ink-700 transition hover:bg-ink-50 disabled:pointer-events-none disabled:opacity-60"
                disabled={isUploadingEmailImage}
                onClick={onAddImage}
                type="button"
              >
                {isUploadingEmailImage ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ImageIcon className="h-3.5 w-3.5" />
                )}
                {isUploadingEmailImage ? 'Uploading' : 'Add image'}
              </button>
            </div>
            <EmailBodyEditor
              ariaLabel="Email body"
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
  account: DashboardPayload['account'];
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
    if (leadMagnet.followUpEmails.length >= 10) return;
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
              onClick={() => onPatch({ followUpEnabled: !leadMagnet.followUpEnabled })}
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
              aria-pressed={leadMagnet.followUpStopOnBooking}
              className={cn(
                'flex min-h-16 items-start gap-3 rounded-lg border p-3 text-left transition',
                leadMagnet.followUpStopOnBooking
                  ? 'border-ink-950 bg-ink-950 text-white'
                  : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
              )}
              onClick={() => onPatch({ followUpStopOnBooking: !leadMagnet.followUpStopOnBooking })}
              type="button"
            >
              <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="block text-sm font-semibold">Stop when a call is booked</span>
                <span className={cn('mt-1 block text-xs leading-5', leadMagnet.followUpStopOnBooking ? 'text-white/70' : 'text-ink-500')}>
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

                  <label className="block">
                    <span className="mb-1.5 flex items-center justify-between gap-3 text-xs font-medium text-ink-700">
                      Body
                      <button
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-xs font-medium text-ink-700 transition hover:bg-ink-50 disabled:pointer-events-none disabled:opacity-60"
                        disabled={Boolean(emailImageUploadTarget)}
                        onClick={(event) => {
                          event.preventDefault();
                          onAddImage(email.id);
                        }}
                        type="button"
                      >
                        {emailImageUploadTarget?.kind === 'follow-up' && emailImageUploadTarget.emailId === email.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ImageIcon className="h-3.5 w-3.5" />
                        )}
                        {emailImageUploadTarget?.kind === 'follow-up' && emailImageUploadTarget.emailId === email.id
                          ? 'Uploading'
                          : 'Add image'}
                      </button>
                    </span>
                    <EmailBodyEditor
                      ariaLabel={`Body for email ${index + 1}`}
                      onChange={(value) => onUpdateEmail(email.id, { body: value })}
                      pendingImage={pendingImage?.target.kind === 'follow-up' && pendingImage.target.emailId === email.id
                        ? pendingImage
                        : null}
                      value={email.body}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <AceternityButton
            disabled={leadMagnet.followUpEmails.length >= 10}
            onClick={addEmail}
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
                  ...(mode === 'message' ? { postSignupQuizEnabled: false } : {}),
                })}
                type="button"
              >
                <span className="block text-sm font-semibold">{title}</span>
                <span className={cn('mt-1 block text-xs leading-5', leadMagnet.postSignupMode === mode ? 'text-white/70' : 'text-ink-500')}>
                  {description}
                </span>
              </button>
            ))}
          </div>

          {leadMagnet.postSignupMode === 'message' && (
            <p className="mt-3 text-xs leading-5 text-ink-500">
              Quick qualifier is available with Send them elsewhere or Custom next step.
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

        {leadMagnet.postSignupMode !== 'message' && (
          <div className="rounded-lg border border-ink-200 bg-white p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-ink-50 text-ink-800">
                  <ListChecks className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-ink-950">Add a quick qualifier</h2>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-600">
                    Ask a simple question after signup. Answers are saved with the signup, then you can optionally route people after the final answer.
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
                <div className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2.5 text-xs leading-5 text-ink-600">
                  <span className="font-medium text-ink-900">All questions are always completed first.</span>{' '}
                  Add an optional route below when a particular combination of answers should see a tailored next step. Otherwise, people continue to the confirmation you chose above.
                </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-ink-700">Small heading</span>
                  <AceternityInput
                    onChange={(event) => onPatch({ postSignupQuizTitle: event.target.value })}
                    placeholder="One quick question"
                    value={leadMagnet.postSignupQuizTitle}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-ink-700">Supporting text</span>
                  <AceternityInput
                    onChange={(event) => onPatch({ postSignupQuizDescription: event.target.value })}
                    placeholder="Help us point you in the right direction."
                    value={leadMagnet.postSignupQuizDescription}
                  />
                </label>
              </div>

              {quizQuestions.map((question, questionIndex) => (
                <div className="rounded-lg border border-ink-200 bg-ink-50 p-4" key={question.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-ink-500">Question {questionIndex + 1}</p>
                    <button
                      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-red-600 transition hover:bg-red-50"
                      onClick={() => onPatch({
                        postSignupQuizQuestions: quizQuestions.filter((_, index) => index !== questionIndex),
                        postSignupQuizRoutes: quizRoutes.map((route) => ({
                          ...route,
                          conditions: route.conditions.filter((condition) => condition.questionId !== question.id),
                        })),
                      })}
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                  <label className="mt-3 block">
                    <span className="mb-1.5 block text-xs font-medium text-ink-700">Question</span>
                    <AceternityInput
                      onChange={(event) => patchQuestion(questionIndex, { prompt: event.target.value })}
                      value={question.prompt}
                    />
                  </label>
                  <div className="mt-3 space-y-3">
                    {question.options.map((option, optionIndex) => (
                      <div className="rounded-md border border-ink-200 bg-white p-3" key={option.id}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-medium text-ink-700">Answer {optionIndex + 1}</span>
                          <button
                            aria-label={`Remove answer ${optionIndex + 1}`}
                            className="inline-flex h-7 items-center justify-center rounded-md px-1.5 text-red-600 transition hover:bg-red-50 disabled:opacity-40"
                            disabled={question.options.length <= 2}
                          onClick={() => onPatch({
                            postSignupQuizQuestions: quizQuestions.map((currentQuestion, index) => index === questionIndex
                              ? { ...currentQuestion, options: question.options.filter((_, currentOptionIndex) => currentOptionIndex !== optionIndex) }
                              : currentQuestion),
                            postSignupQuizRoutes: quizRoutes.map((route) => ({
                              ...route,
                              conditions: route.conditions.filter((condition) => condition.optionId !== option.id),
                            })),
                          })}
                            type="button"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="ml-1 text-xs">Remove</span>
                          </button>
                        </div>
                        <div className="mt-2">
                          <label className="block">
                            <span className="mb-1 block text-xs text-ink-500">Answer text</span>
                            <AceternityInput
                              aria-label={`Answer ${optionIndex + 1}`}
                              onChange={(event) => patchOption(questionIndex, optionIndex, { label: event.target.value })}
                              placeholder="For example: I am just getting started"
                              value={option.label}
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                  {question.options.length < 6 && (
                    <button
                      className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-ink-300 bg-white px-2.5 text-xs font-medium text-ink-700 transition hover:bg-ink-100"
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
              ))}

              {quizQuestions.length < 5 && (
                <AceternityButton onClick={() => onPatch({ postSignupQuizQuestions: [...quizQuestions, newQuizQuestion()] })} type="button" variant="secondary">
                  <Plus className="h-4 w-4" />
                  Add question
                </AceternityButton>
              )}

              <div className="rounded-lg border border-ink-200 bg-white p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-ink-950">Route after the final answer</h3>
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-600">
                      Optional. Use this only when a combination of answers should go to a specific URL. The first complete match wins.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
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
                </div>

                {quizRoutes.length < 20 && (
                  <button
                    className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-ink-300 bg-white px-2.5 text-xs font-medium text-ink-700 transition hover:bg-ink-100"
                    onClick={() => onPatch({ postSignupQuizRoutes: [...quizRoutes, newQuizRoute()] })}
                    type="button"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add route
                  </button>
                )}
              </div>
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
