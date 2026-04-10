import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

export async function GET() {
  try {
    // Postgres check
    let postgres = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      postgres = 'error';
    }

    // Redis check
    let redis = 'ok';
    const redisClient = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    try {
      await redisClient.connect();
      await redisClient.ping();
    } catch {
      redis = 'error';
    } finally {
      redisClient.disconnect();
    }

    // Queue stats
    let queues: Record<string, any> = {};
    try {
      const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });
      await connection.connect();
      const queueNames = ['scraper', 'analyzer', 'notifier'];
      for (const name of queueNames) {
        const q = new Queue(name, { connection });
        const counts = await q.getJobCounts('waiting', 'active', 'completed', 'failed');
        queues[name] = counts;
        await q.close();
      }
      connection.disconnect();
    } catch {
      queues = { error: 'Could not connect to queues' };
    }

    return NextResponse.json({ postgres, redis, queues });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
