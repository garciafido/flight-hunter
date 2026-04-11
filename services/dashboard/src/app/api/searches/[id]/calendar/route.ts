import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@flight-hunter/shared/db';

interface DayRow {
  date: Date;
  min_price: string | number;
  result_count: bigint | number;
  currency: string;
}

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

    const monthLabel = monthParam ?? `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;

    if (rangeStart > rangeEnd) {
      return NextResponse.json({ month: monthLabel, days: [] });
    }

    // SQL aggregation: group by departure day, return min price per day.
    // outbound is JSONB; departure.time is an ISO timestamp string we cast to date.
    const startDate = rangeStart.toISOString().slice(0, 10);
    const endDate = rangeEnd.toISOString().slice(0, 10);

    const rows = await prisma.$queryRaw<DayRow[]>(
      Prisma.sql`
        SELECT
          (outbound->'departure'->>'time')::date AS date,
          MIN(price_per_person) AS min_price,
          COUNT(*) AS result_count,
          (ARRAY_AGG(currency))[1] AS currency
        FROM flight_results
        WHERE search_id = ${id}::uuid
          AND suspicious = false
          AND (outbound->'departure'->>'time')::date BETWEEN ${startDate}::date AND ${endDate}::date
        GROUP BY (outbound->'departure'->>'time')::date
        ORDER BY date
      `,
    );

    const days = rows.map((r) => {
      const dateStr = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
      return {
        date: dateStr,
        minPrice: Number(r.min_price),
        currency: r.currency,
        resultCount: Number(r.result_count),
      };
    });

    return NextResponse.json({ month: monthLabel, days });
  } catch (err) {
    console.error('GET /api/searches/[id]/calendar error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
