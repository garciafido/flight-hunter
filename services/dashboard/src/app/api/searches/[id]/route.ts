import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const search = await prisma.search.findUnique({ where: { id } });
    if (!search) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(search);
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.origin !== undefined) data.origin = body.origin;
    if (body.departureFrom !== undefined) data.departureFrom = new Date(body.departureFrom);
    if (body.departureTo !== undefined) data.departureTo = new Date(body.departureTo);
    if (body.departureDates !== undefined) data.departureDates = Array.isArray(body.departureDates) ? body.departureDates.map((d: string) => new Date(d)) : [];
    if (body.passengers !== undefined) data.passengers = body.passengers;
    if (body.waypoints !== undefined) data.waypoints = body.waypoints;
    if (body.maxConnectionHours !== undefined) data.maxConnectionHours = body.maxConnectionHours;
    if (body.returnCheckedBags !== undefined) data.returnCheckedBags = body.returnCheckedBags;
    if (body.returnPassengers !== undefined) data.returnPassengers = body.returnPassengers;
    if (body.returnBy !== undefined) data.returnBy = body.returnBy ? new Date(body.returnBy) : null;
    if (body.filters !== undefined) data.filters = body.filters;
    if (body.alertConfig !== undefined) data.alertConfig = body.alertConfig;
    if (body.proxyRegions !== undefined) data.proxyRegions = body.proxyRegions;
    if (body.scanIntervalMin !== undefined) data.scanIntervalMin = body.scanIntervalMin;
    if (body.active !== undefined) data.active = body.active;
    if (body.destinationMode !== undefined) data.destinationMode = body.destinationMode;
    if (body.destinationCandidates !== undefined) data.destinationCandidates = body.destinationCandidates;
    if (body.windowMode !== undefined) data.windowMode = body.windowMode;
    if (body.windowDuration !== undefined) data.windowDuration = body.windowDuration;
    if (body.windowFlexibility !== undefined) data.windowFlexibility = body.windowFlexibility;
    if (body.maxCombos !== undefined) data.maxCombos = body.maxCombos;
    const search = await prisma.search.update({ where: { id }, data });
    return NextResponse.json(search);
  } catch (err) {
    console.error('PUT /api/searches/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.search.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
