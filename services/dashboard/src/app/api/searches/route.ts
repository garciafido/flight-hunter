import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const searches = await prisma.search.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(searches);
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const search = await prisma.search.create({
      data: {
        name: body.name,
        origin: body.origin,
        destination: body.destination,
        stopover: body.stopover ?? null,
        departureFrom: new Date(body.departureFrom),
        departureTo: new Date(body.departureTo),
        returnMinDays: body.returnMinDays,
        returnMaxDays: body.returnMaxDays,
        passengers: body.passengers,
        filters: body.filters,
        alertConfig: body.alertConfig,
        proxyRegions: body.proxyRegions ?? [],
        scanIntervalMin: body.scanIntervalMin ?? 30,
        active: true,
        mode: body.mode ?? 'roundtrip',
        legs: body.legs ?? null,
      },
    });
    return NextResponse.json(search, { status: 201 });
  } catch (err) {
    console.error('POST /api/searches error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
