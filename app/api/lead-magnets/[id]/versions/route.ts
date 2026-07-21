import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import { listLeadMagnetVersions } from '@/lib/platform-store';

const idSchema = z.string().uuid();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requireDashboardPayload();
  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) {
    return NextResponse.json({ error: 'Invalid page id' }, { status: 400 });
  }

  const versions = await listLeadMagnetVersions(payload.account.id, parsedId.data);
  return NextResponse.json(
    { versions },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
