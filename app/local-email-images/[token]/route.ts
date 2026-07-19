import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

const tokenPattern = /^[a-f0-9-]+\.(png|jpg|webp|gif)$/;
const contentTypes: Record<string, string> = {
  gif: 'image/gif',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function isLocalHostname(hostname: string) {
  const value = hostname.toLowerCase();
  return value === 'localhost' || value === '::1' || value === '[::1]' || value.startsWith('127.');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  if (process.env.NODE_ENV !== 'development' || !isLocalHostname(request.nextUrl.hostname)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const { token } = await params;
  const match = token.match(tokenPattern);
  if (!match) return new NextResponse('Not found', { status: 404 });

  try {
    const bytes = await readFile(path.join(process.cwd(), '.data', 'email-images', token));
    return new NextResponse(bytes, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Length': String(bytes.length),
        'Content-Type': contentTypes[match[1]],
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
