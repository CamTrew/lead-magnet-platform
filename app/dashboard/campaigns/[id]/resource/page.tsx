import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ArrowLeft, Download } from 'lucide-react';
import { requireDashboardBase } from '@/lib/auth';
import { getCampaign, resolveCampaignHostedResource } from '@/lib/platform-store';
import styles from '@/components/creation/resource-reader.module.css';

export default async function ResourcePage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.MAGNETS_CREATION_ENABLED !== '1') notFound();
  const { account } = await requireDashboardBase();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const campaign = await getCampaign(account.id, id);
  if (!campaign) notFound();
  const { content } = campaign;
  if ('hostedResource' in content.resource) {
    const file = await resolveCampaignHostedResource(account.id, content.resource.hostedResource).catch(() => null);
    return <div className={styles.reader}>
      <nav><Link data-dashboard-tour="resource-back" href={`/create?campaign=${id}`}><ArrowLeft size={17}/> Back to my lead magnet</Link>{file && <a data-dashboard-tour="resource-download" href={`/api/campaigns/${id}/resource`}><Download size={17}/> Download original file</a>}</nav>
      <article><span className={styles.format}>Original file</span><h1 data-dashboard-tour="resource-title">{content.title}</h1><p className={styles.intro}>{file ? file.originalFilename : 'This file is no longer available.'}</p><p>{file ? 'This is the original file selected for your lead magnet. Its contents and format have been kept unchanged.' : 'Open Hosted resources to upload it again, then update the download link in your page editor.'}</p><Link href="/dashboard/resources">Open Hosted resources</Link></article>
    </div>;
  }
  return <div className={styles.reader}>
    <nav><Link data-dashboard-tour="resource-back" href={`/create?campaign=${id}`}><ArrowLeft size={17}/> Back to my lead magnet</Link><a data-dashboard-tour="resource-download" href={`/api/campaigns/${id}/resource`}><Download size={17}/> Download PDF</a></nav>
    <article>
      <span className={styles.format}>{content.format.replaceAll('_', ' ')}</span>
      <h1 data-dashboard-tour="resource-title">{content.title}</h1><p className={styles.intro}>{content.resource.introduction}</p>
      {content.resource.sections.map((section, index) => <section key={index}><h2>{section.heading}</h2><p>{section.body}</p>{section.items.length > 0 && <ul>{section.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>}</section>)}
      <p className={styles.closing}>{content.resource.closing}</p>
    </article>
  </div>;
}
