/* v8 ignore file */
import { Queue } from 'bullmq';
import { PrismaClient } from '@flight-hunter/shared';
import Redis from 'ioredis';
import { QUEUE_NAMES } from '@flight-hunter/shared';
import { KiwiSource } from './sources/kiwi.js';
import { SkyscannerSource } from './sources/skyscanner.js';
import { GoogleFlightsSource } from './sources/google-flights.js';
import { AmadeusSource } from './sources/amadeus.js';
import { VpnRouter } from './proxy/vpn-router.js';
import { SearchJobProcessor } from './jobs/search-job.js';
import { Scheduler } from './scheduler.js';

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

const vpnRouter = new VpnRouter(prisma);

const jobProcessor = new SearchJobProcessor(
  [amadeusSource, kiwiSource, skyscannerSource, googleFlightsSource],
  vpnRouter,
  rawResultsQueue,
);

const scheduler = new Scheduler(prisma, jobProcessor);

const intervalMs = parseInt(process.env.SCAN_INTERVAL_MS ?? '300000', 10);
scheduler.start(intervalMs);

console.log('Scraper service started');
