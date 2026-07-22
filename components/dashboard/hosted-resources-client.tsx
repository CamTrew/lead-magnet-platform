'use client';

import { uploadPresigned } from '@vercel/blob/client';
import {
  Check,
  Copy,
  Download,
  FileArchive,
  FileImage,
  FileText,
  Loader2,
  LockKeyhole,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { PageHeader } from '@/components/dashboard/app-shell';
import { ConfirmDialog } from '@/components/dashboard/confirm-dialog';
import { AceternityButton, AceternityCard } from '@/components/ui/aceternity';
import { blobUploadErrorMessage } from '@/lib/blob-upload-error';
import {
  formatHostedResourceBytes,
  HOSTED_RESOURCE_ACCEPT,
  hostedResourceContentType,
  hostedResourcePathname,
  hostedResourceTypeLabel,
  validateHostedResourceFile,
} from '@/lib/hosted-resources';
import {
  MAX_HOSTED_RESOURCE_STORAGE_BYTES,
  MAX_HOSTED_RESOURCES_PER_ACCOUNT,
} from '@/lib/limits';
import type { HostedResource } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useModalAccessibility } from '@/components/ui/use-modal-accessibility';

type PendingUpload = {
  id: string;
  filename: string;
  progress: number;
  sizeBytes: number;
};

type NamedUpload = {
  file: File;
  name: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function resourceDisplayName(filename: string) {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Hosted resource';
}

function resourceIcon(resource: Pick<HostedResource, 'contentType' | 'originalFilename'>) {
  if (resource.contentType.startsWith('image/')) return FileImage;
  if (resource.contentType.includes('zip')) return FileArchive;
  return FileText;
}

function NameUploadsDialog({
  onCancel,
  onChange,
  onConfirm,
  uploads,
}: {
  onCancel: () => void;
  onChange: (id: number, name: string) => void;
  onConfirm: () => void;
  uploads: NamedUpload[];
}) {
  useModalAccessibility(onCancel);
  const canUpload = uploads.length > 0 && uploads.every((upload) => upload.name.trim());

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/40 p-4 backdrop-blur-sm">
      <button aria-label="Close" className="absolute inset-0" onClick={onCancel} type="button" />
      <div
        aria-modal="true"
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-lg border border-ink-200 bg-white shadow-xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink-950">
              {uploads.length === 1 ? 'Name your resource' : 'Name your resources'}
            </h2>
            <p className="mt-1 text-xs text-ink-500">This is the name people will see in your resource library.</p>
          </div>
          <button
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
            onClick={onCancel}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[55vh] space-y-4 overflow-y-auto px-5 py-4">
          {uploads.map((upload, index) => (
            <label className="block" key={`${upload.file.name}-${upload.file.lastModified}-${index}`}>
              <span className="text-sm font-medium text-ink-900">Resource name</span>
              <input
                autoFocus={index === 0}
                className="mt-1.5 w-full rounded-md border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-950 outline-none transition placeholder:text-ink-400 focus:border-ink-500 focus:ring-2 focus:ring-ink-950/10"
                maxLength={240}
                onChange={(event) => onChange(index, event.target.value)}
                placeholder="e.g. LinkedIn content guide"
                value={upload.name}
              />
              <span className="mt-1 block truncate text-xs text-ink-400">File: {upload.file.name}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-200 px-5 py-3">
          <AceternityButton onClick={onCancel} type="button" variant="secondary">Cancel</AceternityButton>
          <AceternityButton disabled={!canUpload} onClick={onConfirm} type="button">
            <UploadCloud className="h-4 w-4" />
            {uploads.length === 1 ? 'Upload resource' : `Upload ${uploads.length} resources`}
          </AceternityButton>
        </div>
      </div>
    </div>
  );
}

function absoluteResourceUrl(path: string) {
  return new URL(path, window.location.origin).toString();
}

async function responseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof data?.error === 'string' ? data.error : fallback;
}

export function HostedResourcesClient({
  accountId,
  initialResources,
}: {
  accountId: string;
  initialResources: HostedResource[];
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [resources, setResources] = useState(initialResources);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<HostedResource | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [namedUploads, setNamedUploads] = useState<NamedUpload[] | null>(null);

  const isUploading = pendingUploads.length > 0;
  const usedStorageBytes = resources.reduce((total, resource) => total + resource.sizeBytes, 0);
  const pendingStorageBytes = pendingUploads.reduce((total, upload) => total + upload.sizeBytes, 0);
  const storageLimitReached = usedStorageBytes >= MAX_HOSTED_RESOURCE_STORAGE_BYTES;

  function prepareFiles(files: File[]) {
    if (files.length === 0) return;
    setError('');

    if (resources.length + pendingUploads.length + files.length > MAX_HOSTED_RESOURCES_PER_ACCOUNT) {
      setError(`You can host up to ${MAX_HOSTED_RESOURCES_PER_ACCOUNT} resources.`);
      return;
    }
    const selectedBytes = files.reduce((total, file) => total + file.size, 0);
    if (usedStorageBytes + pendingStorageBytes + selectedBytes > MAX_HOSTED_RESOURCE_STORAGE_BYTES) {
      setError('These files would exceed your 1 GB hosted-resource storage limit. Delete an unused resource or upload fewer files.');
      return;
    }

    for (const file of files) {
      const validationError = validateHostedResourceFile({
        name: file.name,
        size: file.size,
        type: hostedResourceContentType(file.name, file.type),
      });
      if (validationError) {
        setError(`${file.name}: ${validationError}`);
        return;
      }
    }

    setNamedUploads(files.map((file) => ({ file, name: resourceDisplayName(file.name) })));
  }

  async function uploadFiles(uploads: NamedUpload[]) {
    if (uploads.length === 0) return;

    for (const upload of uploads) {
      const { file } = upload;
      const contentType = hostedResourceContentType(file.name, file.type);
      const validationError = validateHostedResourceFile({
        name: file.name,
        size: file.size,
        type: contentType,
      });
      if (validationError) {
        setError(`${file.name}: ${validationError}`);
        continue;
      }

      const resourceId = crypto.randomUUID();
      const pending = { id: resourceId, filename: file.name, progress: 0, sizeBytes: file.size };
      setPendingUploads((current) => [...current, pending]);

      try {
        const normalizedFile = file.type === contentType
          ? file
          : new File([file], file.name, { type: contentType, lastModified: file.lastModified });
        const blob = await uploadPresigned(
          hostedResourcePathname(accountId, resourceId, file.name),
          normalizedFile,
          {
            access: 'private',
            contentType,
            handleUploadUrl: `/api/hosted-resources/${resourceId}`,
            multipart: file.size > 8_000_000,
            onUploadProgress: ({ percentage }) => {
              setPendingUploads((current) => current.map((item) => (
                item.id === resourceId ? { ...item, progress: Math.round(percentage) } : item
              )));
            },
          }
        );

        const response = await fetch(`/api/hosted-resources/${resourceId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blobUrl: blob.url,
            name: upload.name.trim(),
            originalFilename: file.name,
          }),
        });
        if (!response.ok) throw new Error(await responseError(response, 'The resource could not be saved.'));
        const data = await response.json() as { resource: HostedResource };
        setResources((current) => [data.resource, ...current]);
      } catch (uploadError) {
        setError(blobUploadErrorMessage(
          uploadError,
          `${file.name} could not be uploaded.`,
          'Resource storage'
        ));
      } finally {
        setPendingUploads((current) => current.filter((item) => item.id !== resourceId));
      }
    }
  }

  async function copyLink(resource: HostedResource) {
    try {
      await navigator.clipboard.writeText(absoluteResourceUrl(resource.publicUrl));
      setCopiedId(resource.id);
      window.setTimeout(() => setCopiedId((current) => current === resource.id ? '' : current), 1800);
    } catch {
      setError('The link could not be copied. Open the resource and copy its address instead.');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    setError('');
    try {
      const response = await fetch(`/api/hosted-resources/${deleteTarget.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await responseError(response, 'The resource could not be deleted.'));
      setResources((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'The resource could not be deleted.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Hosted resource"
        subtitle="Upload files once, then copy their links into any lead magnet."
        actions={(
          <AceternityButton
            disabled={isUploading || storageLimitReached || resources.length >= MAX_HOSTED_RESOURCES_PER_ACCOUNT}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Upload resource
          </AceternityButton>
        )}
      />

      <div className="mx-auto max-w-6xl space-y-5">
        <input
          ref={inputRef}
          accept={HOSTED_RESOURCE_ACCEPT}
          className="sr-only"
          multiple
          onChange={(event) => {
            prepareFiles(Array.from(event.target.files || []));
            event.target.value = '';
          }}
          type="file"
        />

        <AceternityCard
          className={cn(
            'border-dashed transition',
            isDragging && 'border-brand-orange bg-[#fff8f4] ring-2 ring-brand-orange/15'
          )}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            prepareFiles(Array.from(event.dataTransfer.files));
          }}
        >
          <button
            className="flex w-full flex-col items-center justify-center px-5 py-8 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange sm:py-10"
            disabled={isUploading || storageLimitReached || resources.length >= MAX_HOSTED_RESOURCES_PER_ACCOUNT}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-ink-200 bg-ink-50 text-ink-800">
              <UploadCloud className="h-5 w-5" />
            </span>
            <span className="mt-3 text-sm font-semibold text-ink-950">
              Drop resources here, or click to browse
            </span>
            <span className="mt-1 max-w-xl text-xs leading-5 text-ink-500">
              PDF, ZIP, Office documents, text files and images · 50 MB per file · 1 GB total
            </span>
          </button>
        </AceternityCard>

        <div className="flex items-start gap-2 rounded-md border border-ink-200 bg-ink-50 px-3 py-2.5 text-xs leading-5 text-ink-600">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-ink-800" />
          <p>
            Files are private in storage and only you can manage them. Anyone you give a unique resource link to can download that file.
          </p>
        </div>

        {error && (
          <div aria-live="polite" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        {pendingUploads.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {pendingUploads.map((upload) => (
              <AceternityCard className="p-4" key={upload.id}>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ink-100 text-ink-700">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{upload.filename}</p>
                    <p className="mt-0.5 text-xs text-ink-500">Uploading · {upload.progress}%</p>
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full rounded-full bg-brand-orange transition-all" style={{ width: `${upload.progress}%` }} />
                </div>
              </AceternityCard>
            ))}
          </div>
        )}

        {resources.length > 0 ? (
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink-950">Your resources</h2>
              <span className="text-xs text-ink-500">
                {resources.length} of {MAX_HOSTED_RESOURCES_PER_ACCOUNT} files · {formatHostedResourceBytes(usedStorageBytes)} of {formatHostedResourceBytes(MAX_HOSTED_RESOURCE_STORAGE_BYTES)}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {resources.map((resource) => {
                const Icon = resourceIcon(resource);
                return (
                  <AceternityCard className="group flex min-h-52 flex-col" key={resource.id}>
                    {resource.contentType.startsWith('image/') ? (
                      <div className="relative h-44 overflow-hidden border-b border-ink-100 bg-ink-50">
                        {/* This authenticated, no-store route is intentionally not sent through Next's image optimizer. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt={resource.name}
                          className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                          src={`${resource.publicUrl}?preview=1`}
                        />
                        <span className="absolute right-3 top-3 rounded border border-white/70 bg-white/90 px-2 py-1 text-[10px] font-semibold tracking-wide text-ink-700 shadow-sm backdrop-blur">
                          {hostedResourceTypeLabel(resource.contentType, resource.originalFilename)}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-1 items-center justify-center border-b border-ink-100 bg-gradient-to-br from-ink-50 to-white py-7">
                        <span className="relative flex h-16 w-14 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-800 shadow-sm">
                          <Icon className="h-6 w-6" />
                          <span className="absolute -bottom-2 rounded border border-ink-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-ink-600">
                            {hostedResourceTypeLabel(resource.contentType, resource.originalFilename)}
                          </span>
                        </span>
                      </div>
                    )}
                    <div className="p-4">
                      <h3 className="truncate text-sm font-semibold text-ink-950" title={resource.name}>{resource.name}</h3>
                      <p className="mt-1 truncate text-xs text-ink-500" title={resource.originalFilename}>{resource.originalFilename}</p>
                      <p className="mt-2 text-[11px] text-ink-400">
                        {formatHostedResourceBytes(resource.sizeBytes)} · Added {formatDate(resource.createdAt)}
                      </p>
                      <div className="mt-4 flex items-center gap-2 border-t border-ink-100 pt-3">
                        <AceternityButton
                          className="flex-1"
                          onClick={() => void copyLink(resource)}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          {copiedId === resource.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedId === resource.id ? 'Copied' : 'Copy link'}
                        </AceternityButton>
                        <a
                          aria-label={`Download ${resource.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-600 transition hover:bg-ink-50 hover:text-ink-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                          href={resource.publicUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        <button
                          aria-label={`Delete ${resource.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                          onClick={() => setDeleteTarget(resource)}
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </AceternityCard>
                );
              })}
            </div>
          </div>
        ) : pendingUploads.length === 0 ? (
          <div className="rounded-lg border border-ink-200 bg-white px-6 py-12 text-center">
            <FileText className="mx-auto h-6 w-6 text-ink-400" />
            <h2 className="mt-3 text-sm font-semibold text-ink-950">No hosted resources yet</h2>
            <p className="mt-1 text-sm text-ink-500">Upload your first file to get a reusable download link.</p>
          </div>
        ) : null}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          confirmLabel={isDeleting ? 'Deleting…' : 'Delete resource'}
          description={(
            <>
              Delete <strong>{deleteTarget.name}</strong>? Its copied link will stop working immediately. This cannot be undone.
            </>
          )}
          onCancel={() => {
            if (!isDeleting) setDeleteTarget(null);
          }}
          onConfirm={() => void confirmDelete()}
          pending={isDeleting}
          title="Delete hosted resource?"
        />
      )}

      {namedUploads && (
        <NameUploadsDialog
          onCancel={() => setNamedUploads(null)}
          onChange={(index, name) => setNamedUploads((current) => current?.map((upload, uploadIndex) => (
            uploadIndex === index ? { ...upload, name } : upload
          )) || null)}
          onConfirm={() => {
            const uploads = namedUploads;
            setNamedUploads(null);
            void uploadFiles(uploads);
          }}
          uploads={namedUploads}
        />
      )}
    </>
  );
}
