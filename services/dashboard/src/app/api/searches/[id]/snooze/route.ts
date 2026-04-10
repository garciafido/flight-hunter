import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { until } = body;

    let snoozedUntil: Date | null;

    if (until === 'indefinite') {
      snoozedUntil = null;
    } else if (until === '1day') {
      snoozedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    } else if (until === '1week') {
      snoozedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    } else if (until) {
      snoozedUntil = new Date(until);
      if (isNaN(snoozedUntil.getTime())) {
        return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: 'Missing "until" field' }, { status: 400 });
    }

    const search = await prisma.search.findUnique({ where: { id } });
    if (!search) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updated = await (prisma.search.update as any)({
      where: { id },
      data: {
        status: 'snoozed',
        snoozedUntil,
      },
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
