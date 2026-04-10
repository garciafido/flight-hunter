/* v8 ignore file */
import { Queue } from 'bullmq';
import { PrismaClient } from '@flight-hunter/shared';
import Redis from 'ioredis';
import { QUEUE_NAMES } from '@flight-hunter/shared';
import { KiwiSource } from './sources/kiwi.js';
import { SkyscannerSource } from './sources/skyscanner.js';
import { GoogleFlightsSource } from './sources/google-flights.js';
import { AmadeusSource } from './sources/amadeus.js';
import { TravelpayoutsSource } from './sources/travelpayouts.js';
import { DuffelSource } from './sources/duffel.js';
import { VpnRouter } from './proxy/vpn-router.js';
import { SearchJobProcessor } from './jobs/search-job.js';
import { Scheduler } from './scheduler.js';
import { seedSources } from './resilience/seed-sources.js';
import { DefaultResilienceLayer } from './resilience/resilience-layer.js';

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  maxRetriesPerRequest: null,
});

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

const rawResultsQueue = new Queue(QUEUE_NAMES.RAW_RESULTS, { connection: redis });

const kiwiSource = new KiwiSource(process.env.KIWI_API_KEY ?? '');
const skyscannerSource = new SkyscannerSource(process.env.RAPIDAPI_KEY ?? '');
const googleFlightsSource = new GoogleFlightsSource();
const amadeusSource = new AmadeusSource(
  process.env.AMADEUS_API_KEY ?? '',
  process.env.AMADEUS_API_SECRET ?? '',
);
const travelpayoutsSource = new TravelpayoutsSource(process.env.TRAVELPAYOUTS_TOKEN ?? '');
const duffelSource = new DuffelSource(process.env.DUFFEL_API_TOKEN ?? '');

const vpnRouter = new VpnRouter(prisma);

const resilienceLayer = new DefaultResilienceLayer(
  prisma,
  parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD ?? '5', 10),
  parseInt(process.env.CIRCUIT_BREAKER_COOLDOWN_MS ?? String(5 * 60_000), 10),
);

const jobProcessor = new SearchJobProcessor(
  [amadeusSource, kiwiSource, skyscannerSource, googleFlightsSource, travelpayoutsSource, duffelSource],
  vpnRouter,
  rawResultsQueue,
  resilienceLayer,
);

const scheduler = new Scheduler(prisma, jobProcessor);

const intervalMs = parseInt(process.env.SCAN_INTERVAL_MS ?? '300000', 10);

// Seed sources on boot (no-op if already seeded)
seedSources(prisma).then(() => {
  scheduler.start(intervalMs);
  console.log('Scraper service started');
}).catch((err) => {
  console.error('Seed failed, starting anyway:', err);
  scheduler.start(intervalMs);
  console.log('Scraper service started');
});
