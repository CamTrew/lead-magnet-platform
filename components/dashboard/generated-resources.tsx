'use client';

import Link from 'next/link';
import { platformLeadMagnetPath } from '@/lib/platform-username';
import { ArrowUpRight, Download, FileText, Pencil } from 'lucide-react';
import { AceternityCard, aceternityButtonClassName } from '@/components/ui/aceternity';
import type { listGeneratedHostedResources } from '@/lib/platform-store';

type GeneratedResource = Awaited<ReturnType<typeof listGeneratedHostedResources>>[number];

export function GeneratedResources({ resources }: { resources: GeneratedResource[] }) {
  if (!resources.length) return null;
  return <section aria-labelledby="generated-resources-title">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold text-ink-950" data-dashboard-tour="generated-resources" id="generated-resources-title">Created with your assistant</h2>
        <p className="mt-1 text-sm text-ink-500">Open your resource or jump to its lead magnet.</p>
      </div>
      <span className="text-sm text-ink-500">{resources.length} {resources.length === 1 ? 'resource' : 'resources'}</span>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {resources.map((resource) => <AceternityCard className="group flex min-w-0 flex-col overflow-hidden" key={resource.id}>
        {resource.hasCover && <a target="_blank" rel="noreferrer" aria-label={`Open resource: ${resource.title}`} className="relative block aspect-[16/10] overflow-hidden border-b border-ink-200 bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange" href={resource.published && resource.downloadUrl ? resource.downloadUrl : `/api/campaigns/${resource.id}/resource`}>
          {/* Private artwork stays on the authenticated, no-store endpoint. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" className="h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]" loading="lazy" src={`/api/campaigns/${resource.id}/resource?cover=1&revision=${resource.revision}`} />
          <span className="absolute right-3 top-3 rounded-md border border-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-ink-800">{resource.published ? 'Published' : 'Draft'}</span>
        </a>}
        <div className="flex flex-1 flex-col p-5">
          {!resource.hasCover && <span className="mb-3 text-xs font-medium text-ink-500">{resource.published ? 'Published' : 'Draft'}</span>}
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{resource.uploadedFile ? 'Original file' : `${resource.format.replaceAll('_', ' ')} · PDF`}</p>
          <h3 className="mt-2 break-words text-lg font-semibold leading-snug text-ink-950">{resource.title}</h3>
          <div className="mt-5 flex flex-wrap gap-2">
            <a target="_blank" rel="noreferrer" className={aceternityButtonClassName({ variant: 'secondary' })} href={resource.published && resource.downloadUrl ? resource.downloadUrl : `/api/campaigns/${resource.id}/resource`}><FileText className="h-4 w-4"/> Open resource</a>
            <a aria-label={`Download ${resource.uploadedFile ? "original file" : "PDF"}: ${resource.title}`} className={aceternityButtonClassName({ variant: 'secondary' })} href={`/api/campaigns/${resource.id}/resource`}><Download className="h-4 w-4"/> {resource.uploadedFile ? "File" : "PDF"}</a>
          </div>
          <div className="mt-5 flex flex-1 flex-col justify-end">
            <div className="border-t border-ink-200 pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">Linked lead magnet</p>
              <Link className="flex min-h-11 items-center gap-2 text-sm font-medium text-ink-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange" href={`/dashboard/pages/${resource.leadMagnetId}`}><Pencil className="h-4 w-4 shrink-0"/> Edit lead magnet</Link>
              {resource.published
                ? <a className="flex min-h-11 items-center gap-2 text-sm font-medium text-ink-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange" href={platformLeadMagnetPath(resource.username, resource.slug, resource.leadMagnetId)} target="_blank" rel="noreferrer"><ArrowUpRight className="h-4 w-4 shrink-0"/> View live lead magnet</a>
                : <p className="mt-1 text-sm leading-relaxed text-ink-500">Publish your lead magnet to share its signup page.</p>}
            </div>
          </div>
        </div>
      </AceternityCard>)}
    </div>
  </section>;
}
