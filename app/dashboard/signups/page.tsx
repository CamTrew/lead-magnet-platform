import { redirect } from 'next/navigation';
import { requireDashboardBase } from '@/lib/auth';
import { listAccountSignups, listLeadMagnetOptions } from '@/lib/platform-store';
import { isSetupComplete } from '@/lib/setup';
import { SignupsClient } from '@/components/dashboard/signups-client';

export const dynamic = 'force-dynamic';

export default async function SignupsPage() {
  const payload = await requireDashboardBase();
  if (!isSetupComplete(payload.account)) {
    redirect('/dashboard?setup=incomplete');
  }

  const [signups, leadMagnets] = await Promise.all([
    listAccountSignups(payload.account.id),
    listLeadMagnetOptions(payload.account.id),
  ]);

  return (
    <SignupsClient
      initialSignups={signups}
      leadMagnets={leadMagnets}
    />
  );
}
