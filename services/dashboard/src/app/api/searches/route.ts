import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const WaypointGapSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stay'),
    minDays: z.number().int().min(0),
    maxDays: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('connection'),
    maxHours: z.number().min(0),
  }),
]);

const WaypointSchema = z.object({
  airport: z.string().length(3),
  gap: WaypointGapSchema,
  pin: z.enum(['first', 'last']).optional(),
  checkedBags: z.number().int().min(0).max(5).optional(),
  passengers: z.number().int().positive().max(9).optional(),
});

const CreateSearchSchema = z.object({
  name: z.string().min(1),
  origin: z.string().length(3),
  passengers: z.number().int().positive(),
  departureFrom: z.string(),
  departureTo: z.string(),
  waypoints: z.array(WaypointSchema).min(1).max(6),
  maxConnectionHours: z.number().int().positive().default(6),
  returnCheckedBags: z.number().int().min(0).max(5).optional(),
  returnPassengers: z.number().int().positive().max(9).optional(),
  filters: z.any(),
  alertConfig: z.any(),
  proxyRegions: z.array(z.enum(['CL', 'AR'])).default([]),
  scanIntervalMin: z.number().int().positive().default(30),
  active: z.boolean().default(true),
  // Orthogonal features preserved from prior phases
  destinationMode: z.enum(['single', 'flexible']).optional(),
  destinationCandidates: z.array(z.string()).optional(),
  windowMode: z.boolean().optional(),
  windowDuration: z.number().int().positive().optional(),
  windowFlexibility: z.number().int().min(0).optional(),
  maxCombos: z.number().int().positive().optional(),
});

function validatePins(waypoints: z.infer<typeof WaypointSchema>[]): string | null {
  const firsts = waypoints.filter((w) => w.pin === 'first').length;
  const lasts = waypoints.filter((w) => w.pin === 'last').length;
  if (firsts > 1) return 'Only one waypoint may be pinned as first';
  if (lasts > 1) return 'Only one waypoint may be pinned as last';
  return null;
}

export async function GET() {
  try {
    const searches = await prisma.search.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(searches);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateSearchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const data = parsed.data;
    const pinError = validatePins(data.waypoints);
    if (pinError) {
      return NextResponse.json({ error: pinError }, { status: 400 });
    }

    const search = await prisma.search.create({
      data: {
        name: data.name,
        origin: data.origin,
        departureFrom: new Date(data.departureFrom),
        departureTo: new Date(data.departureTo),
        passengers: data.passengers,
        waypoints: data.waypoints as object,
        maxConnectionHours: data.maxConnectionHours,
        ...(data.returnCheckedBags !== undefined ? { returnCheckedBags: data.returnCheckedBags } : {}),
        ...(data.returnPassengers !== undefined ? { returnPassengers: data.returnPassengers } : {}),
        filters: data.filters,
        alertConfig: data.alertConfig,
        proxyRegions: data.proxyRegions,
        scanIntervalMin: data.scanIntervalMin,
        active: data.active,
        ...(data.destinationMode ? { destinationMode: data.destinationMode } : {}),
        ...(data.destinationCandidates ? { destinationCandidates: data.destinationCandidates } : {}),
        ...(data.windowMode !== undefined ? { windowMode: data.windowMode } : {}),
        ...(data.windowDuration !== undefined ? { windowDuration: data.windowDuration } : {}),
        ...(data.windowFlexibility !== undefined ? { windowFlexibility: data.windowFlexibility } : {}),
        ...(data.maxCombos !== undefined ? { maxCombos: data.maxCombos } : {}),
      },
    });
    return NextResponse.json(search, { status: 201 });
  } catch (err) {
    console.error('POST /api/searches error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
