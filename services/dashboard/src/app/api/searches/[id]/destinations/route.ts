import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@flight-hunter/shared/db';

interface DestinationRow {
  iata: string;
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

    const rows = await prisma.$queryRaw<DestinationRow[]>(
      Prisma.sql`
        SELECT
          outbound->'arrival'->>'airport' AS iata,
          MIN(price_per_person) AS min_price,
          COUNT(*) AS result_count,
          (ARRAY_AGG(currency ORDER BY price_per_person ASC))[1] AS currency,
          (ARRAY_AGG(id::text ORDER BY price_per_person ASC))[1] AS top_result_id
        FROM flight_results
        WHERE search_id = ${id}::uuid
          AND suspicious = false
        GROUP BY outbound->'arrival'->>'airport'
        ORDER BY MIN(price_per_person) ASC
      `,
    );

    const destinations = rows.map((r) => ({
      iata: r.iata,
      minPrice: Number(r.min_price),
      currency: r.currency,
      resultCount: Number(r.result_count),
      topResultId: r.top_result_id,
    }));

    return NextResponse.json({ destinations });
  } catch (err) {
    console.error('GET /api/searches/[id]/destinations error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
