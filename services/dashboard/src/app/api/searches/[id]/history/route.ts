import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') ?? '30', 10);

    const search = await prisma.search.findUnique({ where: { id } });
    if (!search) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get price history rows
    const priceHistory = await (prisma.priceHistory.findMany as any)({
      where: {
        searchId: id,
        date: { gte: cutoff },
      },
      orderBy: { date: 'asc' },
    });

    // Get alerts in the same range
    const alerts = await prisma.alert.findMany({
      where: {
        searchId: id,
        sentAt: { gte: cutoff },
      },
      orderBy: { sentAt: 'asc' },
    });

    const history = priceHistory.map((h: any) => ({
      date: h.date.toISOString().slice(0, 10),
      minPrice: Number(h.minPrice),
      avgPrice: Number(h.avgPrice),
      maxPrice: Number(h.maxPrice),
      bestScore: Number(h.bestScore),
    }));

    const alertDots = alerts.map((a: any) => ({
      date: a.sentAt.toISOString().slice(0, 10),
      level: a.level,
    }));

    return NextResponse.json({ history, alerts: alertDots });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
