import { NextResponse } from 'next/server';
import { requireDashboardPayload } from '@/lib/auth';
import { createLeadMagnet } from '@/lib/platform-store';

export async function POST() {
  const payload = await requireDashboardPayload();
  const leadMagnet = await createLeadMagnet(payload.account.id);

  return NextResponse.json({ leadMagnet });
}

