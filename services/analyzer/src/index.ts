/* v8 ignore file */
import { Worker, Queue } from 'bullmq';
import { PrismaClient } from '@flight-hunter/shared/db';
import { createLogger } from '@flight-hunter/shared/logger';
import { Redis } from 'ioredis';
import { QUEUE_NAMES, RawResultJobSchema, startRuntimeConfigPoller } from '@flight-hunter/shared';
import type { RawResultJob } from '@flight-hunter/shared';
import { AnalyzerWorker } from './worker.js';
import { FilterEngine } from './filters/filter-engine.js';
import { DealDetector } from './detection/deal-detector.js';
import { HistoryService } from './detection/history.js';
import { OutlierDetector } from './detection/outlier-detector.js';
import { Publisher } from './publisher.js';
import { RetentionJob } from './retention/retention-job.js';

const logger = createLogger('analyzer');

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  maxRetriesPerRequest: null,
});

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

// Refresh baggage policies, AR taxes, and other tunables from system_settings
// every 30s. Helpers like estimateCarryOnUSD() will reflect changes live.
startRuntimeConfigPoller(prisma, {
  intervalMs: 30_000,
  onError: (err) => logger.error({ err }, 'Failed to refresh runtime config'),
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
    await analyzerWorker.process(data);
  },
  { connection: redis },
);

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Analyzer job failed');
});

worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Analyzer job completed');
});

// Daily retention job: runs at midnight, deletes old records
const retentionQueue = new Queue('retention', { connection: redis });
await retentionQueue.add(
  'daily-retention',
  {},
  { repeat: { pattern: '0 0 * * *' } },
);

const retentionWorker = new Worker(
  'retention',
  async () => {
    const retentionJob = new RetentionJob(prisma);
    const result = await retentionJob.run();
    logger.info(
      { deletedFlightResults: result.deletedFlightResults, deletedSourceMetrics: result.deletedSourceMetrics },
      'Retention job completed',
    );
  },
  { connection: redis },
);

retentionWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Retention job failed');
});

logger.info('Analyzer service started');
