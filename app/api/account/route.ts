import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import { updateAccount } from '@/lib/platform-store';

const schema = z.object({
  name: z.string().trim().min(1),
  subdomain: z.string().trim().min(1).regex(/^[a-z0-9-]+$/),
  domain: z.string().trim().min(1),
  logoUrl: z.string(),
  brand: z.object({
    primary: z.string().trim().min(4),
    accent: z.string().trim().min(4),
    success: z.string().trim().min(4),
  }),
  resendApiKey: z.string(),
  resendFromEmail: z.string().trim(),
  beehiivApiKey: z.string(),
  beehiivPublicationId: z.string(),
});

export async function PUT(request: NextRequest) {
  const payload = await requireDashboardPayload();
  const body = await request.json();
  const updates = schema.parse(body);
  const account = await updateAccount(payload.account.id, updates);

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  return NextResponse.json({ account });
}

