import { redirect } from 'next/navigation';
import { requireDashboardBase } from '@/lib/auth';
import { listAccountSignupsPage, listLeadMagnetOptions } from '@/lib/platform-store';
import { isSetupComplete } from '@/lib/setup';
import { encodeSignupCursor, SIGNUPS_PAGE_SIZE } from '@/lib/signup-pagination';
import { SignupsClient } from '@/components/dashboard/signups-client';

export const dynamic = 'force-dynamic';

export default async function SignupsPage() {
  const payload = await requireDashboardBase();
  if (!isSetupComplete(payload.account)) {
    redirect('/dashboard?setup=incomplete');
  }

  const [signupPage, leadMagnets] = await Promise.all([
    listAccountSignupsPage(payload.account.id, { limit: SIGNUPS_PAGE_SIZE }),
    listLeadMagnetOptions(payload.account.id),
  ]);

  return (
    <SignupsClient
      initialNextCursor={
        signupPage.nextCursor ? encodeSignupCursor(signupPage.nextCursor) : null
      }
      initialSignups={signupPage.signups}
      initialTotalCount={signupPage.totalCount}
      leadMagnets={leadMagnets}
    />
  );
}
