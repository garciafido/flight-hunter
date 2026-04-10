/* v8 ignore file */
import { Worker, Queue } from 'bullmq';
import { PrismaClient, createLogger } from '@flight-hunter/shared';
import Redis from 'ioredis';
import { WebSocketServer } from 'ws';
import { QUEUE_NAMES, AlertJobSchema } from '@flight-hunter/shared';
import type { AlertJob } from '@flight-hunter/shared';
import { createTelegramChannel } from './channels/telegram.js';
import { createEmailChannel } from './channels/email.js';
import { createWebSocketBroadcaster } from './channels/websocket.js';
import { createThrottle } from './throttle.js';
import { NotifierWorker } from './worker.js';
import { DailyDigest } from './digest/daily-digest.js';

const logger = createLogger('notifier');

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  maxRetriesPerRequest: null,
});

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

const telegram = createTelegramChannel(
  process.env.TELEGRAM_BOT_TOKEN ?? '',
  process.env.TELEGRAM_CHAT_ID ?? '',
);

const email = createEmailChannel({
  host: process.env.SMTP_HOST ?? 'localhost',
  port: parseInt(process.env.SMTP_PORT ?? '587', 10),
  user: process.env.SMTP_USER ?? '',
  pass: process.env.SMTP_PASS ?? '',
  from: process.env.SMTP_FROM ?? '',
  to: process.env.SMTP_TO ?? process.env.ALERT_EMAIL ?? '',
});

const wsBroadcaster = createWebSocketBroadcaster();

const throttle = createThrottle({ cooldownMs: 2 * 60 * 60 * 1000 });

const notifierWorker = new NotifierWorker({
  telegram,
  email,
  wsBroadcaster,
  throttle,
  prisma,
});

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  wsBroadcaster.addClient(ws);
  ws.on('close', () => wsBroadcaster.removeClient(ws));
});

const worker = new Worker<AlertJob>(
  QUEUE_NAMES.ALERTS,
  async (job) => {
    const data = AlertJobSchema.parse(job.data);
    await notifierWorker.process(data);
  },
  { connection: redis },
);

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Alert job failed');
});

worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Alert job completed');
});

// Daily digest: BullMQ repeat job at 9 AM daily
const digestQueue = new Queue('digest', { connection: redis });
await digestQueue.add(
  'daily-digest',
  {},
  { repeat: { pattern: '0 9 * * *' } },
);

const digestWorker = new Worker(
  'digest',
  async () => {
    const digest = new DailyDigest({ prisma, email });
    await digest.run();
  },
  { connection: redis },
);

digestWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Digest job failed');
});

digestWorker.on('completed', () => {
  logger.info('Daily digest sent');
});

logger.info('Notifier service started');
