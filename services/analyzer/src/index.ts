/* v8 ignore file */
import { Worker, Queue } from 'bullmq';
import { PrismaClient } from '@flight-hunter/shared';
import Redis from 'ioredis';
import { QUEUE_NAMES, RawResultJobSchema } from '@flight-hunter/shared';
import type { RawResultJob } from '@flight-hunter/shared';
import { AnalyzerWorker } from './worker.js';
import { FilterEngine } from './filters/filter-engine.js';
import { DealDetector } from './detection/deal-detector.js';
import { HistoryService } from './detection/history.js';
import { OutlierDetector } from './detection/outlier-detector.js';
import { Publisher } from './publisher.js';

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  maxRetriesPerRequest: null,
});

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

const alertQueue = new Queue(QUEUE_NAMES.ALERTS, { connection: redis });

const filterEngine = new FilterEngine();
const dealDetector = new DealDetector();
const historyService = new HistoryService(prisma);
const outlierDetector = new OutlierDetector(prisma);
const publisher = new Publisher(alertQueue, prisma);

const analyzerWorker = new AnalyzerWorker({
  prisma,
  historyService,
  filterEngine,
  dealDetector,
  outlierDetector,
  publisher,
});

const worker = new Worker<RawResultJob>(
  QUEUE_NAMES.RAW_RESULTS,
  async (job) => {
    const data = RawResultJobSchema.parse(job.data);
    await analyzerWorker.process({ ...job, data });
  },
  { connection: redis },
);

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

console.log('Analyzer service started');
