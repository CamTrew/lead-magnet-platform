import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentDashboardBase } from '@/lib/auth';
import { preferredLeadMagnetUrl } from '@/lib/lead-magnet-metadata';
import {
  findLeadMagnetForAccount,
  getLeadMagnetAnalytics,
} from '@/lib/platform-store';

const idSchema = z.string().uuid();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getCurrentDashboardBase();
  if (!payload) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id: rawId } = await params;
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) {
    return NextResponse.json({ error: 'Invalid page id' }, { status: 400 });
  }

  const leadMagnet = await findLeadMagnetForAccount(payload.account.id, parsedId.data);
  if (!leadMagnet) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

  const analytics = await getLeadMagnetAnalytics(payload.account.id, leadMagnet.id);
  return NextResponse.json({
    analytics,
    leadMagnet: {
      id: leadMagnet.id,
      title: leadMagnet.title,
      published: leadMagnet.published,
      postSignupMode: leadMagnet.postSignupMode,
      postSignupVideoUrl: leadMagnet.postSignupVideoUrl,
      postSignupQuizEnabled: leadMagnet.postSignupQuizEnabled,
      postSignupQuizQuestions: leadMagnet.postSignupQuizQuestions,
      abTestEnabled: leadMagnet.abTestEnabled,
      abTestStartedAt: leadMagnet.abTestStartedAt,
      abTestCompletedAt: leadMagnet.abTestCompletedAt,
      abTestWinnerId: leadMagnet.abTestWinnerId,
    },
    pageUrl: preferredLeadMagnetUrl(
      payload.account,
      leadMagnet,
      process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so'
    ),
  });
}
