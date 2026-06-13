import { notFound } from 'next/navigation';
import { PageEditorClient } from '@/components/dashboard/page-editor-client';
import { requireDashboardPayload } from '@/lib/auth';

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const payload = await requireDashboardPayload();
  const leadMagnet = payload.leadMagnets.find((item) => item.id === id);

  if (!leadMagnet) notFound();

  return <PageEditorClient initialData={payload} initialLeadMagnet={leadMagnet} />;
}
