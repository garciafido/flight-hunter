import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const sort = url.searchParams.get('sort') ?? 'date';
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

    const orderBy =
      sort === 'price' ? { pricePerPerson: 'asc' as const } :
      sort === 'score' ? { score: 'desc' as const } :
      { scrapedAt: 'desc' as const };

    const results = await prisma.flightResult.findMany({
      where: { searchId: id },
      orderBy,
      take: limit,
      skip: offset,
    });

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
