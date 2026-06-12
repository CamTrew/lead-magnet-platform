import { NextResponse } from 'next/server';
import { clearStubSession } from '@/lib/auth';

export async function POST() {
  await clearStubSession();
  return NextResponse.json({ success: true });
}

