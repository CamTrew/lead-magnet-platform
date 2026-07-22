import { NextResponse } from 'next/server';
import { getCurrentDashboardBase } from '@/lib/auth';
import {
  getHostedResourceStorageUsage,
  listHostedResources,
} from '@/lib/platform-store';

export async function GET() {
  const payload = await getCurrentDashboardBase();
  if (!payload) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const [resources, usage] = await Promise.all([
    listHostedResources(payload.account.id),
    getHostedResourceStorageUsage(payload.account.id),
  ]);
  return NextResponse.json({ resources, usage });
}
