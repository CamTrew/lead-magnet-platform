import { sampleWorkspace } from '@/lib/sample-workspace';
import { redirect } from 'next/navigation';
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
  const payload = process.env.MAGNETS_STAGING_PREVIEW === '1' ? sampleWorkspace : await requireDashboardBase();
  const setupComplete = isSetupComplete(payload.account);
  const assistantCreationEnabled = process.env.MAGNETS_CREATION_ENABLED === '1';
  // Existing configured accounts must never repeat onboarding to access their work.
  if (assistantCreationEnabled && !setupComplete && !payload.account.onboardingCompletedAt) redirect('/create');

  return (
    <DashboardLayoutShell
      setupComplete={setupComplete}
      assistantCreationEnabled={assistantCreationEnabled}
      brandLogoUrl={payload.account.logoUrl}
      userEmail={payload.user.email}
      userName={payload.user.name}
    >
      {children}
      {!assistantCreationEnabled && !payload.account.onboardingCompletedAt && (
        <OnboardingGate userName={payload.user.name} />
      )}
    </DashboardLayoutShell>
  );
}
