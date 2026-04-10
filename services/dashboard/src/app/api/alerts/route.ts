import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const searchId = url.searchParams.get('searchId');
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

    const alerts = await prisma.alert.findMany({
      where: searchId ? { searchId } : undefined,
      orderBy: { sentAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        flightResult: true,
      },
    });

    return NextResponse.json(alerts);
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
