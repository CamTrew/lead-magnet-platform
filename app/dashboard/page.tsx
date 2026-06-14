import { redirect } from 'next/navigation';
import { requireDashboardPayload } from '@/lib/auth';
import { isSetupComplete, setupChecklist } from '@/lib/setup';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const payload = await requireDashboardPayload();
  const params = await searchParams;
  const showRedirectNotice = params?.setup === 'incomplete';
  const fromLogin = params?.entry === 'login';

  if (fromLogin && !showRedirectNotice && isSetupComplete(payload.account)) {
    redirect('/dashboard/pages');
  }

  const checklist = setupChecklist(payload.account);

  return (
    <DashboardClient
      initialData={payload}
      setupChecklist={checklist}
      showRedirectNotice={showRedirectNotice}
    />
  );
}
