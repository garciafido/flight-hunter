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
   * Wait for the analyzer to finish processing all raw-result jobs before
   * triggering combo evaluation. Polls the raw-results queue every 3s.
   * After the queue drains, waits an extra 3s for DB commits to flush.
   */
  private async waitForRawResultsDrain(): Promise<void> {
    const MAX_WAIT_MS = 5 * 60_000;
    const POLL_INTERVAL_MS = 3_000;
    const DB_FLUSH_BUFFER_MS = 1_000;

    const start = Date.now();
    while (Date.now() - start < MAX_WAIT_MS) {
      const counts = await this.rawResultsQueue.getJobCounts('waiting', 'active');
      const pending = (counts.waiting ?? 0) + (counts.active ?? 0);
      if (pending === 0) {
        await new Promise((r) => setTimeout(r, DB_FLUSH_BUFFER_MS));
        return;
      }
      console.log(`Scheduler: waiting for raw-results to drain (${pending} pending)`);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    console.warn('Scheduler: raw-results drain timed out after 5 min — proceeding anyway');
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

        // Wait for the analyzer to persist all raw-results to the DB
        // before triggering combo evaluation. This prevents the race
        // condition where ComboEvaluator queries the DB and finds 0 rows.
        await this.waitForRawResultsDrain();

        console.log(`Scheduler: search "${search.name}" completed — enqueueing combo evaluation`);
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
