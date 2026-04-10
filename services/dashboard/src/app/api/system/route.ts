import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

async function getSourcesWithMetrics() {
  try {
    const sources = await (prisma as any).source.findMany({
      orderBy: { name: 'asc' },
    });

    const now = new Date();
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const result = await Promise.all(
      sources.map(async (src: any) => {
        const metrics = await (prisma as any).sourceMetric.findMany({
          where: {
            sourceId: src.id,
            timestamp: { gte: cutoff24h },
          },
          orderBy: { timestamp: 'desc' },
        });

        const totalRuns = metrics.length;
        const successCount = metrics.filter((m: any) => m.success).length;
        const successRate = totalRuns > 0 ? successCount / totalRuns : 0;
        const avgLatencyMs =
          totalRuns > 0
            ? Math.round(metrics.reduce((s: number, m: any) => s + m.durationMs, 0) / totalRuns)
            : 0;
        const avgResultCount =
          totalRuns > 0
            ? Math.round(
                (metrics.reduce((s: number, m: any) => s + m.resultCount, 0) / totalRuns) * 10,
              ) / 10
            : 0;

        // Build hourly breakdown for last 24h
        const hourlyMap: Record<string, { success: number; failure: number }> = {};
        for (const m of metrics) {
          const hour = new Date(m.timestamp);
          hour.setMinutes(0, 0, 0);
          const key = `${String(hour.getHours()).padStart(2, '0')}:00`;
          if (!hourlyMap[key]) hourlyMap[key] = { success: 0, failure: 0 };
          if (m.success) hourlyMap[key].success += 1;
          else hourlyMap[key].failure += 1;
        }
        const hourlyBreakdown = Object.entries(hourlyMap)
          .map(([hour, counts]) => ({ hour, ...counts }))
          .sort((a, b) => b.hour.localeCompare(a.hour));

        return {
          name: src.name,
          enabled: src.enabled,
          hasApiKey: src.hasApiKey,
          circuitState: src.circuitState,
          lastSuccessAt: src.lastSuccessAt,
          lastFailureAt: src.lastFailureAt,
          metrics24h: {
            successRate,
            avgLatencyMs,
            avgResultCount,
            totalRuns,
            hourlyBreakdown,
          },
        };
      }),
    );

    return result;
  } catch {
    return [];
  }
}

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

    // System settings
    let emailsPaused = false;
    try {
      const settings = await (prisma as any).systemSettings.findUnique({
        where: { id: 'singleton' },
      });
      emailsPaused = settings?.emailsPaused ?? false;
    } catch {
      // ignore
    }

    // Sources with metrics
    const sources = await getSourcesWithMetrics();

    return NextResponse.json({ postgres, redis, queues, emailsPaused, sources });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
