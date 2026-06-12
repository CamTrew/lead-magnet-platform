import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createStubSession } from '@/lib/auth';

const schema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().optional(),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, name } = schema.parse(body);
  const user = await createStubSession(email, name);

  return NextResponse.json({ user });
}

