import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { requireDashboardBase } from '@/lib/auth';
import { isSetupComplete } from '@/lib/setup';
import { DashboardLayoutShell } from '@/components/dashboard/app-shell';
import { OnboardingGate } from '@/components/dashboard/onboarding-gate';

export const metadata: Metadata = {
  title: { absolute: 'Magnets' },
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const payload = await requireDashboardBase();
  const setupComplete = isSetupComplete(payload.account);

  return (
    <DashboardLayoutShell
      setupComplete={setupComplete}
      userEmail={payload.user.email}
      userName={payload.user.name}
    >
      {children}
      {!payload.account.onboardingCompletedAt && (
        <OnboardingGate userName={payload.user.name} />
      )}
    </DashboardLayoutShell>
  );
}
