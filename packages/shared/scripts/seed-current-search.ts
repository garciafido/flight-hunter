/**
 * One-shot seed script: recreates the user's BUE → CUZ Jul-Ago 2026 search
 * with the new waypoint-based model.
 *
 * Run with: pnpm --filter @flight-hunter/shared seed:current
 */
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function main() {
  const search = await prisma.search.create({
    data: {
      name: 'Buenos Aires → Cusco Jul-Ago 2026',
      origin: 'BUE',
      passengers: 2,
      departureFrom: new Date('2026-07-25T00:00:00.000Z'),
      departureTo: new Date('2026-07-31T00:00:00.000Z'),
      maxConnectionHours: 6,
      waypoints: [
        { airport: 'CUZ', gap: { type: 'stay', minDays: 7, maxDays: 10 }, checkedBags: 0 },
        { airport: 'LIM', gap: { type: 'stay', minDays: 3, maxDays: 4 }, checkedBags: 0 },
      ],
      // Voy sin valija despachada en los tramos de ida; vuelvo con una al regreso a BUE.
      returnCheckedBags: 1,
      proxyRegions: ['CL', 'AR'],
      scanIntervalMin: 5,
      active: true,
      filters: {
        airlineBlacklist: [],
        airlinePreferred: [],
        airportPreferred: {},
        airportBlacklist: {},
        maxUnplannedStops: 1,
        requireCarryOn: true,
        maxTotalTravelTime: 0, // 0 = unlimited
      },
      alertConfig: {
        scoreThresholds: { info: 60, good: 75, urgent: 90 },
        maxPricePerPerson: 2000,
        currency: 'USD',
      },
    },
  });
  console.log(`Created search ${search.id}: ${search.name}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
