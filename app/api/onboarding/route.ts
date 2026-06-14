import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import { completeOnboarding } from '@/lib/platform-store';
import {
  enforceRateLimits,
  rateLimitResponse,
  RateLimitError,
  requestIp,
} from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import {
  logoValidationMessage,
  MAX_LOGO_DATA_URL_LENGTH,
  validateLogoDataUrl,
} from '@/lib/upload';

const ROUTE = '/api/onboarding';

const BUSINESS_TYPES = [
  'Solo creator',
  'Newsletter',
  'Small business',
  'Agency',
  'Consultancy',
  'Coach',
  'Other',
] as const;
const MAGNET_TYPES = [
  'Guide / ebook',
  'Checklist',
  'Template',
  'Webinar replay',
  'Course preview',
  'Discount code',
  'Audit / scorecard',
  'Other',
] as const;
const CADENCES = ['Weekly', 'Bi-weekly', 'Monthly', 'Quarterly', 'Ad-hoc'] as const;

const logoSchema = z
  .string()
  .min(1, 'Upload your logo')
  .max(MAX_LOGO_DATA_URL_LENGTH, 'Logo is too large')
  .superRefine((value, ctx) => {
    const result = validateLogoDataUrl(value);
    if (!result.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: logoValidationMessage(result.reason) });
    }
  });

const schema = z.object({
  businessName: z.string().trim().min(1).max(80),
  logoUrl: logoSchema,
  businessType: z.enum(BUSINESS_TYPES),
  magnetType: z.enum(MAGNET_TYPES),
  cadence: z.enum(CADENCES),
}).strict();

export async function POST(request: NextRequest) {
  let userId: string | undefined;
  let accountId: string | undefined;
  try {
    const payload = await requireDashboardPayload();
    userId = payload.user.id;
    accountId = payload.account.id;

    await enforceRateLimits([
      {
        identifier: payload.user.id,
        limit: 10,
        scope: 'onboarding:user',
        windowSeconds: 60 * 10,
      },
      {
        identifier: requestIp(request),
        limit: 20,
        scope: 'onboarding:ip',
        windowSeconds: 60 * 10,
      },
    ]);

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || 'Pick an option for every question.';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const account = await completeOnboarding(accountId, parsed.data);
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    log.info('Onboarding completed', {
      route: ROUTE,
      method: 'POST',
      status: 200,
      userId,
      accountId,
      extra: {
        businessType: parsed.data.businessType,
        magnetType: parsed.data.magnetType,
        cadence: parsed.data.cadence,
      },
    });

    return NextResponse.json({ account });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    log.error('Onboarding failed', {
      route: ROUTE,
      method: 'POST',
      status: 500,
      userId,
      accountId,
      extra: { error: err },
    });
    return NextResponse.json({ error: 'Could not save onboarding answers' }, { status: 500 });
  }
}

export function GET() {
  // Surface the option lists so the client and server stay in lockstep.
  return NextResponse.json({
    businessTypes: BUSINESS_TYPES,
    magnetTypes: MAGNET_TYPES,
    cadences: CADENCES,
  });
}
