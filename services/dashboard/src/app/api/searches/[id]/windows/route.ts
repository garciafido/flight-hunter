import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@flight-hunter/shared';

interface WindowRow {
  window_start: Date | string;
  window_end: Date | string;
  min_price: string | number;
  result_count: bigint | number;
  currency: string;
  top_result_id: string;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const search = await prisma.search.findUnique({ where: { id } });
    if (!search) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Group by (outbound departure date, inbound arrival date) to define windows
    const rows = await prisma.$queryRaw<WindowRow[]>(
      Prisma.sql`
        SELECT
          (outbound->'departure'->>'time')::date AS window_start,
          (inbound->'arrival'->>'time')::date AS window_end,
          MIN(price_per_person) AS min_price,
          COUNT(*) AS result_count,
          (ARRAY_AGG(currency ORDER BY price_per_person ASC))[1] AS currency,
          (ARRAY_AGG(id::text ORDER BY price_per_person ASC))[1] AS top_result_id
        FROM flight_results
        WHERE search_id = ${id}::uuid
          AND suspicious = false
        GROUP BY
          (outbound->'departure'->>'time')::date,
          (inbound->'arrival'->>'time')::date
        ORDER BY MIN(price_per_person) ASC
      `,
    );

    const windows = rows.map((r) => {
      const startStr = r.window_start instanceof Date
        ? r.window_start.toISOString().slice(0, 10)
        : String(r.window_start).slice(0, 10);
      const endStr = r.window_end instanceof Date
        ? r.window_end.toISOString().slice(0, 10)
        : String(r.window_end).slice(0, 10);

      const startDate = new Date(startStr);
      const endDate = new Date(endStr);
      const duration = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      return {
        start: startStr,
        end: endStr,
        duration,
        minPrice: Number(r.min_price),
        currency: r.currency,
        resultCount: Number(r.result_count),
        topResultId: r.top_result_id,
      };
    });

    return NextResponse.json({ windows });
  } catch (err) {
    console.error('GET /api/searches/[id]/windows error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
