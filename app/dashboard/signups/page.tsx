import { redirect } from 'next/navigation';
import { requireDashboardPayload } from '@/lib/auth';
import { listAccountSignups } from '@/lib/platform-store';
import { isSetupComplete } from '@/lib/setup';
import { SignupsClient } from '@/components/dashboard/signups-client';

export const dynamic = 'force-dynamic';

export default async function SignupsPage() {
  const payload = await requireDashboardPayload();
  if (!isSetupComplete(payload.account)) {
    redirect('/dashboard?setup=incomplete');
  }

  const signups = await listAccountSignups(payload.account.id);

  return (
    <SignupsClient
      initialSignups={signups}
      leadMagnets={payload.leadMagnets.map((magnet) => ({
        id: magnet.id,
        title: magnet.title,
        slug: magnet.slug,
      }))}
    />
  );
}
