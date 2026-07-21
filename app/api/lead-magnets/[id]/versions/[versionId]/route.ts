import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import { getLeadMagnetVersion } from '@/lib/platform-store';

const idSchema = z.string().uuid();
const versionIdSchema = z.string().regex(/^\d+$/);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const payload = await requireDashboardPayload();
  const routeParams = await params;
  const parsedId = idSchema.safeParse(routeParams.id);
  const parsedVersionId = versionIdSchema.safeParse(routeParams.versionId);
  if (!parsedId.success || !parsedVersionId.success) {
    return NextResponse.json({ error: 'Invalid version' }, { status: 400 });
  }

  const snapshot = await getLeadMagnetVersion(
    payload.account.id,
    parsedId.data,
    parsedVersionId.data
  );
  if (!snapshot) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  return NextResponse.json(
    { snapshot },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
