import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import { deleteLeadMagnet, updateLeadMagnet } from '@/lib/platform-store';

const schema = z.object({
  slug: z.string().trim().min(1).regex(/^[a-z0-9-]+$/),
  title: z.string().trim().min(1),
  subtitle: z.string(),
  description: z.string(),
  bullets: z.array(z.string()),
  bulletsHeading: z.string(),
  ctaText: z.string().trim().min(1),
  formHeading: z.string(),
  formSubtext: z.string(),
  imageUrl: z.string(),
  downloadLink: z.string(),
  emailSubject: z.string(),
  emailBody: z.string(),
  emailPreview: z.string(),
  published: z.boolean(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requireDashboardPayload();
  const { id } = await params;
  const body = await request.json();
  const updates = schema.parse(body);
  const leadMagnet = await updateLeadMagnet(payload.account.id, id, updates);

  if (!leadMagnet) {
    return NextResponse.json({ error: 'Lead magnet not found' }, { status: 404 });
  }

  return NextResponse.json({ leadMagnet });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requireDashboardPayload();
  const { id } = await params;
  const deleted = await deleteLeadMagnet(payload.account.id, id);

  if (!deleted) {
    return NextResponse.json({ error: 'Lead magnet not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

