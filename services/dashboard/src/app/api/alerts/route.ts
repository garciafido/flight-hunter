import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const searchId = url.searchParams.get('searchId');
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

    const alerts = await prisma.alert.findMany({
      where: searchId ? { searchId } : undefined,
      orderBy: { sentAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        flightResult: true,
      },
    });

    return NextResponse.json(alerts);
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/alerts — flexible bulk delete with query parameters:
 *
 * - ?all=true                 → delete every alert
 * - ?searchId=UUID            → only alerts of that search (combinable)
 * - ?before=ISO-8601          → delete alerts older than that timestamp
 * - ?olderThanHours=N         → delete alerts older than N hours
 * - ?olderThanDays=N          → delete alerts older than N days
 * - ?keepLast=N               → delete all except the most recent N
 *
 * Multiple filters AND together. At least one filter is required to
 * prevent accidental wipes.
 */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const all = url.searchParams.get('all') === 'true';
    const searchId = url.searchParams.get('searchId');
    const beforeParam = url.searchParams.get('before');
    const olderThanHours = url.searchParams.get('olderThanHours');
    const olderThanDays = url.searchParams.get('olderThanDays');
    const keepLast = url.searchParams.get('keepLast');

    const where: any = {};

    if (searchId) where.searchId = searchId;

    let cutoff: Date | null = null;
    if (beforeParam) cutoff = new Date(beforeParam);
    else if (olderThanHours) cutoff = new Date(Date.now() - parseInt(olderThanHours, 10) * 3600 * 1000);
    else if (olderThanDays) cutoff = new Date(Date.now() - parseInt(olderThanDays, 10) * 24 * 3600 * 1000);
    if (cutoff) where.sentAt = { lt: cutoff };

    // keepLast: delete everything OLDER than the Nth most recent
    if (keepLast) {
      const n = parseInt(keepLast, 10);
      const nth = await prisma.alert.findMany({
        where: searchId ? { searchId } : undefined,
        orderBy: { sentAt: 'desc' },
        skip: n,
        take: 1,
        select: { sentAt: true },
      });
      if (nth.length === 0) {
        // Nothing to delete (we have <= N total)
        return NextResponse.json({ deleted: 0 });
      }
      where.sentAt = { lt: nth[0].sentAt };
    }

    // Safety guard: refuse to wipe everything unless explicitly requested
    const hasFilter = Object.keys(where).length > 0;
    if (!hasFilter && !all) {
      return NextResponse.json(
        { error: 'Refusing to delete all alerts without ?all=true' },
        { status: 400 },
      );
    }

    const result = await prisma.alert.deleteMany({ where });

    // When deleting ALL alerts, also clean flight_results, combos, price_history
    // and flush Redis queues to prevent stale data from resurfacing.
    if (all) {
      await prisma.flightCombo.deleteMany({ where: searchId ? { searchId } : {} });
      await prisma.flightResult.deleteMany({ where: searchId ? { searchId } : {} });
      await prisma.priceHistory.deleteMany({ where: searchId ? { searchId } : {} });
      // Flush Redis BullMQ queues (stale jobs cause price/date contamination)
      try {
        const { Redis } = await import('ioredis');
        const redis = new Redis({
          host: process.env.REDIS_HOST ?? 'localhost',
          port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
        });
        await redis.flushdb();
        await redis.quit();
      } catch {
        // Redis flush is best-effort — don't fail the request
      }
    }

    return NextResponse.json({ deleted: result.count, cleanedAll: !!all });
  } catch (err) {
    console.error('DELETE /api/alerts error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
