import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { requireDashboardPayload } from '@/lib/auth';
import { isSetupComplete } from '@/lib/setup';
import { DashboardLayoutShell } from '@/components/dashboard/app-shell';

export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const payload = await requireDashboardPayload();
  const setupComplete = isSetupComplete(payload.account);

  return (
    <DashboardLayoutShell
      setupComplete={setupComplete}
      userEmail={payload.user.email}
      userName={payload.user.name}
    >
      {children}
    </DashboardLayoutShell>
  );
}
