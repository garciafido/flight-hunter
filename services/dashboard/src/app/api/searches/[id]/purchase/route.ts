import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const search = await prisma.search.findUnique({ where: { id } });
    if (!search) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await request.json();
    const { pricePaid, currency, bookingUrl, travelDate, notes } = body;

    const record = await (prisma.purchaseRecord as any).create({
      data: {
        searchId: id,
        pricePaid: pricePaid ?? null,
        currency: currency ?? null,
        bookingUrl: bookingUrl ?? null,
        travelDate: travelDate ? new Date(travelDate) : null,
        notes: notes ?? null,
      },
    });

    const updated = await (prisma.search.update as any)({
      where: { id },
      data: { status: 'purchased' },
    });

    return NextResponse.json({ search: updated, purchaseRecord: record });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
