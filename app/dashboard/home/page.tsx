import { sampleWorkspace } from '@/lib/sample-workspace';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Download, FileText, Pencil, Users } from 'lucide-react';
import { requireDashboardBase } from '@/lib/auth';
import { assistantOrigin } from '@/lib/assistant-auth';
import { listAssistantGrants } from '@/lib/platform-store';
import { PageHeader } from '@/components/dashboard/app-shell';
import { AssistantEntry } from '@/components/dashboard/assistant-entry';
import styles from '@/components/dashboard/home.module.css';

export default async function HomePage({ searchParams }: { searchParams: Promise<{ assistant?: string }> }) {
  const preview = process.env.MAGNETS_STAGING_PREVIEW === '1';
  if (!preview && process.env.MAGNETS_CREATION_ENABLED !== '1') redirect('/dashboard/pages');
  const { account } = preview ? sampleWorkspace : await requireDashboardBase();
  const { assistant } = await searchParams;
  const connections = preview ? [] : (await listAssistantGrants(account.id))
    .filter(connection => connection.access === 'workspace');
  const selectedConnection = connections.find(connection => connection.provider === assistant)
    || connections.find(connection => connection.provider !== null);
  const provider = selectedConnection?.provider || undefined;
  return <>
    <PageHeader helpTopic="start" title="Home" subtitle="Create in your chat. Manage everything here." />
    <div className={styles.home}>
    <AssistantEntry connectionOrigin={preview ? "https://magnets.so" : assistantOrigin()} provider={provider} resumeSavedIdea={Boolean(provider && assistant === provider)} />
    <section className={styles.shortcuts} aria-label="Your workspace">
      <Link data-dashboard-tour="library" href="/dashboard/pages" className={styles.card}><FileText size={25}/><h2>My lead magnets</h2><p>Open your drafts, edit your pages and share your live links.</p><span>See my lead magnets <ArrowRight size={17}/></span></Link>
      <Link data-dashboard-tour="audience" href="/dashboard/signups" className={styles.card}><Users size={25}/><h2>My signups</h2><p>See who signed up. Download your audience as a CSV whenever you need it.</p><span>See my signups <ArrowRight size={17}/></span></Link>
    </section>
    <section className={styles.bottom}>
      <div><Download size={20}/><div><h2>Your ideas are yours to keep.</h2><p>Find your downloads in Hosted resources. Use Edit on a lead magnet to view or change its page and emails.</p></div></div>
      <Link data-dashboard-tour="manual" href="/dashboard/pages?new=1"><Pencil size={17}/> Create manually <ArrowRight size={16}/></Link>
    </section>
  </div></>;
}
