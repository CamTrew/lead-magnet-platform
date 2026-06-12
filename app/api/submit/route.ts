import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { addToBeehiiv } from '@/lib/beehiiv';
import { findLeadMagnet, recordSubmission } from '@/lib/platform-store';
import { sendLeadMagnetEmail } from '@/lib/resend';

const schema = z.object({
  accountId: z.string().min(1),
  leadMagnetId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, leadMagnetId, slug, name, email } = schema.parse(body);
    const result = await findLeadMagnet(accountId, leadMagnetId);

    if (!result || result.leadMagnet.slug !== slug || !result.leadMagnet.published) {
      return NextResponse.json({ error: 'Lead magnet not found' }, { status: 404 });
    }

    await sendLeadMagnetEmail({
      account: result.account,
      magnet: result.leadMagnet,
      to: email,
      name,
    });

    try {
      await addToBeehiiv(result.account, email, name);
    } catch (beehiivError) {
      console.error('Beehiiv error (non-fatal):', beehiivError);
    }

    await recordSubmission({
      accountId,
      leadMagnetId,
      name,
      email,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Submission error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Please enter a valid name and email address' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to process submission' },
      { status: 500 }
    );
  }
}

