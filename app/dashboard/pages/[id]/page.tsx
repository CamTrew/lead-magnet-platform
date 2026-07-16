import { notFound } from 'next/navigation';
import { PageEditorClient } from '@/components/dashboard/page-editor-client';
import { requireDashboardBase } from '@/lib/auth';
import { findLeadMagnetForAccount } from '@/lib/platform-store';

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const payload = await requireDashboardBase();
  const leadMagnet = await findLeadMagnetForAccount(payload.account.id, id);

  if (!leadMagnet) notFound();

  return <PageEditorClient initialData={payload} initialLeadMagnet={leadMagnet} />;
}
