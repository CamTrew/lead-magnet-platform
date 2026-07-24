import { z } from 'zod';
import type { AccountSignupCursor } from '@/lib/platform-store';

export const SIGNUPS_PAGE_SIZE = 50;

const cursorSchema = z.object({
  latestSignupAt: z.string().max(64).regex(
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/
  ),
  email: z.string().trim().email().max(254),
}).strict();

export function encodeSignupCursor(cursor: AccountSignupCursor) {
  return Buffer.from(
    JSON.stringify({
      latestSignupAt: cursor.latestSignupAt,
      email: cursor.email.toLowerCase(),
    }),
    'utf8'
  ).toString('base64url');
}

export function decodeSignupCursor(value: string): AccountSignupCursor | null {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    const parsed = cursorSchema.safeParse(decoded);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
