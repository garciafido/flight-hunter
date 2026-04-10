import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const monthParam = url.searchParams.get('month'); // "YYYY-MM"

    const search = await prisma.search.findUnique({ where: { id } });
    if (!search) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Determine month boundaries
    let monthStart: Date;
    let monthEnd: Date;

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [year, month] = monthParam.split('-').map(Number);
      monthStart = new Date(year, month - 1, 1);
      monthEnd = new Date(year, month, 0); // last day of month
    } else {
      const now = new Date();
      monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    // Clamp to search departure range
    const rangeStart = new Date(Math.max(monthStart.getTime(), search.departureFrom.getTime()));
    const rangeEnd = new Date(Math.min(monthEnd.getTime(), search.departureTo.getTime()));

    if (rangeStart > rangeEnd) {
      const month = monthParam ?? `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;
      return NextResponse.json({ month, days: [] });
    }

    // Aggregate min price per departure day
    const results = await prisma.flightResult.findMany({
      where: {
        searchId: id,
        suspicious: false,
        outbound: {
          path: ['departure', 'time'],
          gte: rangeStart.toISOString(),
          lte: new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString(),
        },
      } as any,
      select: {
        outbound: true,
        pricePerPerson: true,
        currency: true,
      },
    });

    // Group by date
    const dayMap: Record<string, { prices: number[]; currency: string }> = {};

    for (const r of results) {
      const outbound = r.outbound as any;
      const departureTime = outbound?.departure?.time;
      if (!departureTime) continue;
      const date = departureTime.slice(0, 10);
      if (!dayMap[date]) dayMap[date] = { prices: [], currency: r.currency };
      dayMap[date].prices.push(Number(r.pricePerPerson));
    }

    const days = Object.entries(dayMap)
      .filter(([date]) => {
        const d = new Date(date);
        return d >= rangeStart && d <= rangeEnd;
      })
      .map(([date, { prices, currency }]) => ({
        date,
        minPrice: Math.min(...prices),
        currency,
        resultCount: prices.length,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const month = monthParam ?? `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;

    return NextResponse.json({ month, days });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
