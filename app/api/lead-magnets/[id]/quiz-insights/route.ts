import { createDeepSeek } from '@ai-sdk/deepseek';
import { generateText, Output } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDashboardPayload } from '@/lib/auth';
import {
  aiUsageLimitResponse,
  enforceAiUsageLimit,
  isAiUsageLimitError,
} from '@/lib/ai-usage';
import { findLeadMagnetForAccount, getQuizInsightsData } from '@/lib/platform-store';
import { enforceRateLimits, rateLimitResponse, RateLimitError, requestIp } from '@/lib/rate-limit';
import { log } from '@/lib/logger';

const idSchema = z.string().uuid();
const insightSchema = z.object({
  summary: z.string().max(1200),
  patterns: z.array(z.string().max(300)).max(5),
  recommendations: z.array(z.string().max(300)).max(5),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const payload = await requireDashboardPayload();
    const parsedId = idSchema.safeParse((await params).id);
    if (!parsedId.success) return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
    const magnet = await findLeadMagnetForAccount(payload.account.id, parsedId.data);
    if (!magnet) return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
    if (!magnet.postSignupQuizEnabled || magnet.postSignupQuizQuestions.length === 0) {
      return NextResponse.json({ error: 'Add and publish a quiz before analysing results.' }, { status: 400 });
    }
    await enforceRateLimits([
      { identifier: payload.user.id, limit: 20, scope: 'quiz-insights:user', windowSeconds: 60 * 60 },
      { identifier: requestIp(request as Parameters<typeof requestIp>[0]), limit: 40, scope: 'quiz-insights:ip', windowSeconds: 60 * 60 },
    ]);
    const data = await getQuizInsightsData(payload.account.id, magnet.id);
    if (data.responseCount === 0) {
      return NextResponse.json({ data, insight: null });
    }
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: 'AI analysis is not configured yet.' }, { status: 503 });
    await enforceAiUsageLimit(payload.account.id, 'quizInsights');
    const deepseek = createDeepSeek({ apiKey });
    const { output } = await generateText({
      model: deepseek(process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat'),
      instructions: [
        'You are a senior conversion researcher analysing aggregate quiz results.',
        'Never invent certainty, respondents, causation, or segments not present in the data.',
        'Call out small sample sizes explicitly. Use plain natural English with no AI clichés.',
        'Recommendations must be specific actions for the landing page, offer, messaging, or follow-up.',
      ].join(' '),
      prompt: `Lead magnet: ${magnet.title}\nAggregate anonymous quiz data (no personal data):\n${JSON.stringify(data)}`,
      output: Output.object({ schema: insightSchema }),
      maxOutputTokens: 1200,
      temperature: 0.2,
      abortSignal: AbortSignal.timeout(35_000),
    });
    return NextResponse.json({ data, insight: output || null });
  } catch (error) {
    if (isAiUsageLimitError(error)) return aiUsageLimitResponse(error);
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    log.error('Quiz insight generation failed', { route: '/api/lead-magnets/[id]/quiz-insights', method: 'POST', status: 500, extra: { error } });
    return NextResponse.json({ error: 'Quiz insights could not be generated. Try again.' }, { status: 500 });
  }
}
