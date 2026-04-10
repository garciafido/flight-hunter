import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const search = await prisma.search.findUnique({ where: { id } });
    if (!search) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const combos = await (prisma as any).flightCombo.findMany({
      where: { searchId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json(combos);
  } catch (err) {
    console.error('GET /api/searches/[id]/combos error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
