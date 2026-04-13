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
    private readonly rawResultsQueue: Queue,
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

  /**
   * Wait for the analyzer to finish processing all raw-result jobs.
   * Two-phase check:
   *   1. Poll the BullMQ queue until waiting + active == 0
   *   2. Poll the DB until it has at least `expectedCount` results for this search
   * This prevents the race condition where the queue drains but DB writes
   * haven't committed yet.
   */
  async waitForRawResultsDrain(searchId: string, expectedCount: number): Promise<void> {
    const MAX_WAIT_MS = 5 * 60_000;
    const POLL_INTERVAL_MS = 3_000;
    const start = Date.now();

    // Phase 1: wait for BullMQ queue to drain
    while (Date.now() - start < MAX_WAIT_MS) {
      const counts = await this.rawResultsQueue.getJobCounts('waiting', 'active');
      const pending = (counts.waiting ?? 0) + (counts.active ?? 0);
      if (pending === 0) break;
      console.log(`Scheduler: waiting for raw-results queue to drain (${pending} pending)`);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    // Phase 2: verify DB has the expected results
    if (expectedCount > 0) {
      while (Date.now() - start < MAX_WAIT_MS) {
        const dbCount = await this.prisma.flightResult.count({
          where: { searchId },
        });
        if (dbCount >= expectedCount) {
          console.log(`Scheduler: DB has ${dbCount} results (expected ${expectedCount}) — ready`);
          return;
        }
        console.log(`Scheduler: waiting for DB persistence (${dbCount}/${expectedCount})`);
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      console.warn('Scheduler: DB persistence timed out — proceeding anyway');
    }
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
        const enqueued = await this.jobProcessor.execute(search as unknown as SearchConfig);
        console.log(`Scheduler: search "${search.name}" enqueued ${enqueued} result(s)`);

        // Wait for the analyzer to persist all raw-results to the DB
        // before triggering combo evaluation.
        await this.waitForRawResultsDrain(search.id, enqueued);

        console.log(`Scheduler: enqueueing combo evaluation for "${search.name}"`);
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
