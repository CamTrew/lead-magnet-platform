import { requireDashboardPayload } from '@/lib/auth';
import { AccountSettingsClient } from '@/components/dashboard/account-settings-client';

export default async function AccountSettingsPage() {
  const payload = await requireDashboardPayload();
  return (
    <AccountSettingsClient
      userEmail={payload.user.email}
      userName={payload.user.name}
    />
  );
}
