import type { Queue } from 'bullmq';
import type { PrismaClient } from '@flight-hunter/shared/db';
import type { SearchConfig } from '@flight-hunter/shared';
import { getRuntimeConfig, QUEUE_NAMES } from '@flight-hunter/shared';
import type { SearchJobProcessor } from './jobs/search-job.js';

export class Scheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly jobProcessor: SearchJobProcessor,
    private readonly evaluateCombosQueue: Queue,
  ) {}

  /**
   * Clean stale flight results that are older than resultMaxAgeHours.
   * Prevents contamination from old ticks with stale prices/dates.
   * Runs before the first tick and can be called on-demand.
   */
  async cleanStaleResults(): Promise<number> {
    const maxAgeMs = getRuntimeConfig().resultMaxAgeHours * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - maxAgeMs);
    // Delete dependents first (FK constraints)
    await this.prisma.alert.deleteMany({
      where: { flightResult: { scrapedAt: { lt: cutoff } } },
    });
    await (this.prisma as any).flightCombo.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    const deleted = await this.prisma.flightResult.deleteMany({
      where: { scrapedAt: { lt: cutoff } },
    });
    return deleted.count;
  }

  async tick(): Promise<void> {
    const now = new Date();

    // Auto-resume snoozed searches whose snoozedUntil has passed
    await (this.prisma.search.updateMany as any)({
      where: {
        status: 'snoozed',
        snoozedUntil: { lte: now, not: null },
      },
      data: {
        status: 'active',
        snoozedUntil: null,
      },
    });

    // Fetch searches that are active (status = 'active')
    const searches = await (this.prisma.search.findMany as any)({
      where: {
        status: 'active',
        active: true,
      },
    });

    console.log(`Scheduler: found ${searches.length} active search(es)`);
    for (const search of searches) {
      try {
        console.log(`Scheduler: executing search "${search.name}" (${search.id})`);
        await this.jobProcessor.execute(search as unknown as SearchConfig);
        console.log(`Scheduler: search "${search.name}" completed — enqueueing combo evaluation`);
        // After all flights for this search are enqueued, trigger a single
        // combo evaluation. The analyzer will build combos once with all
        // fresh data instead of re-evaluating on every individual flight.
        await this.evaluateCombosQueue.add(
          QUEUE_NAMES.EVALUATE_COMBOS,
          { searchId: search.id },
          { attempts: 2, backoff: { type: 'exponential', delay: 2000 } },
        );
      } catch (err) {
        console.error(`Scheduler: search "${search.name}" failed:`, err);
      }
    }
  }

  async start(intervalMs: number): Promise<void> {
    // Clean stale results BEFORE the first tick — prevents old data with
    // wrong prices/dates from contaminating combos on restart.
    const deleted = await this.cleanStaleResults();
    if (deleted > 0) {
      console.log(`Scheduler: cleaned ${deleted} stale flight result(s)`);
    }

    console.log(`Scheduler: polling every ${intervalMs / 1000}s, running first tick now...`);
    await this.tick();
    this.intervalId = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
