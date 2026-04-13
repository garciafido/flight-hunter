import type { PrismaClient } from '@flight-hunter/shared/db';
import type { SearchConfig } from '@flight-hunter/shared';
import type { SearchJobProcessor } from './jobs/search-job.js';

export class Scheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly jobProcessor: SearchJobProcessor,
  ) {}

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
        console.log(`Scheduler: search "${search.name}" completed`);
      } catch (err) {
        console.error(`Scheduler: search "${search.name}" failed:`, err);
      }
    }
  }

  start(intervalMs: number): void {
    // Wait 15s before the first tick so that tsc --watch has time to
    // recompile the shared package (turbo starts all services in parallel
    // and the scraper can import stale dist/ on the very first tick).
    const startupDelayMs = 15_000;
    console.log(`Scheduler: waiting ${startupDelayMs / 1000}s for shared to compile, then polling every ${intervalMs / 1000}s...`);
    setTimeout(() => {
      console.log('Scheduler: running first tick now...');
      void this.tick();
      this.intervalId = setInterval(() => {
        void this.tick();
      }, intervalMs);
    }, startupDelayMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
