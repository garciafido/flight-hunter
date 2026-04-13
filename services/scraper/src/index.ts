/* v8 ignore file */
import { Queue } from 'bullmq';
import { PrismaClient } from '@flight-hunter/shared/db';
import { Redis } from 'ioredis';
import { QUEUE_NAMES, startRuntimeConfigPoller } from '@flight-hunter/shared';
import { GoogleFlightsSource } from './sources/google-flights.js';
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

// Refresh runtime config (scraperMaxDatesPerPair, etc.) every 30s.
startRuntimeConfigPoller(prisma, {
  intervalMs: 30_000,
  onError: (err) => console.error('Failed to refresh runtime config:', err),
});

const rawResultsQueue = new Queue(QUEUE_NAMES.RAW_RESULTS, { connection: redis });

const googleFlightsSource = new GoogleFlightsSource();

const vpnRouter = new VpnRouter(prisma);

const resilienceLayer = new DefaultResilienceLayer(
  prisma,
  parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD ?? '5', 10),
  parseInt(process.env.CIRCUIT_BREAKER_COOLDOWN_MS ?? String(5 * 60_000), 10),
);

const jobProcessor = new SearchJobProcessor(
  [googleFlightsSource],
  vpnRouter,
  rawResultsQueue,
  resilienceLayer,
);

const scheduler = new Scheduler(prisma, jobProcessor);

const intervalMs = parseInt(process.env.SCAN_INTERVAL_MS ?? '300000', 10);

// Seed sources on boot (no-op if already seeded), then start scheduler
seedSources(prisma).then(async () => {
  await scheduler.start(intervalMs);
  console.log('Scraper service started');
}).catch(async (err) => {
  console.error('Seed failed, starting anyway:', err);
  await scheduler.start(intervalMs);
  console.log('Scraper service started');
});
