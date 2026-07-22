import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { z } from 'zod';
import { requireDashboardBase } from '@/lib/auth';
import { preferredLeadMagnetUrl } from '@/lib/lead-magnet-metadata';
import { findLeadMagnetForAccount } from '@/lib/platform-store';

const idSchema = z.string().uuid();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requireDashboardBase();
  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) return NextResponse.json({ error: 'Invalid page id' }, { status: 400 });
  const magnet = await findLeadMagnetForAccount(payload.account.id, parsedId.data);
  if (!magnet) return NextResponse.json({ error: 'Lead magnet not found' }, { status: 404 });

  const target = preferredLeadMagnetUrl(
    payload.account,
    magnet,
    process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin
  );
  const format = request.nextUrl.searchParams.get('format') === 'svg' ? 'svg' : 'png';
  const filename = `${magnet.slug || 'lead-magnet'}-qr.${format}`;
  if (format === 'svg') {
    const svg = await QRCode.toString(target, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, width: 1024 });
    return new NextResponse(svg, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'image/svg+xml; charset=utf-8',
      },
    });
  }
  const png = await QRCode.toBuffer(target, { errorCorrectionLevel: 'M', margin: 2, width: 1200, color: { dark: '#111111', light: '#ffffff' } });
  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'image/png',
    },
  });
}
