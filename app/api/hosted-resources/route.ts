import { NextResponse } from 'next/server';
import { getCurrentDashboardBase } from '@/lib/auth';
import { listHostedResources } from '@/lib/platform-store';

export async function GET() {
  const payload = await getCurrentDashboardBase();
  if (!payload) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return NextResponse.json({
    resources: await listHostedResources(payload.account.id),
  });
}
