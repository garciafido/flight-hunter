import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler } from '../../src/scheduler.js';

const makeSearch = (overrides = {}) => ({
  id: 'search-1',
  name: 'Test',
  origin: 'SCL',
  destination: 'MAD',
  active: true,
  status: 'active',
  snoozedUntil: null,
  ...overrides,
});

describe('Scheduler', () => {
  let prisma: {
    search: {
      findMany: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    flightResult: {
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };
  let jobProcessor: { execute: ReturnType<typeof vi.fn> };
  let evaluateCombosQueue: { add: ReturnType<typeof vi.fn> };
  let rawResultsQueue: { getJobCounts: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    evaluateCombosQueue = { add: vi.fn().mockResolvedValue(undefined) };
    rawResultsQueue = { getJobCounts: vi.fn().mockResolvedValue({ waiting: 0, active: 0 }) };
    prisma = {
      search: {
        findMany: vi.fn().mockResolvedValue([makeSearch()]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      alert: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      flightCombo: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      flightResult: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        count: vi.fn().mockResolvedValue(100),
      },
    };
    jobProcessor = {
      execute: vi.fn().mockResolvedValue(10),
    };
  });

  describe('tick', () => {
    it('loads active searches and executes job for each', async () => {
      const search1 = makeSearch({ id: 'search-1' });
      const search2 = makeSearch({ id: 'search-2' });
      prisma.search.findMany.mockResolvedValue([search1, search2]);

      const scheduler = new Scheduler(prisma as never, jobProcessor as never, evaluateCombosQueue as never, rawResultsQueue as never);
      await scheduler.tick();

      expect(prisma.search.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'active' }) }),
      );
      expect(jobProcessor.execute).toHaveBeenCalledTimes(2);
      expect(jobProcessor.execute).toHaveBeenCalledWith(search1);
      expect(jobProcessor.execute).toHaveBeenCalledWith(search2);
    });

    it('continues with other searches if one execute throws', async () => {
      const search1 = makeSearch({ id: 'search-1' });
      const search2 = makeSearch({ id: 'search-2' });
      prisma.search.findMany.mockResolvedValue([search1, search2]);
      jobProcessor.execute.mockRejectedValueOnce(new Error('execute failed'));

      const scheduler = new Scheduler(prisma as never, jobProcessor as never, evaluateCombosQueue as never, rawResultsQueue as never);
      await expect(scheduler.tick()).resolves.toBeUndefined();

      expect(jobProcessor.execute).toHaveBeenCalledTimes(2);
    });

    it('does nothing when no active searches exist', async () => {
      prisma.search.findMany.mockResolvedValue([]);

      const scheduler = new Scheduler(prisma as never, jobProcessor as never, evaluateCombosQueue as never, rawResultsQueue as never);
      await scheduler.tick();

      expect(jobProcessor.execute).not.toHaveBeenCalled();
    });

    it('auto-resumes snoozed searches whose snoozedUntil has passed', async () => {
      prisma.search.findMany.mockResolvedValue([]);

      const scheduler = new Scheduler(prisma as never, jobProcessor as never, evaluateCombosQueue as never, rawResultsQueue as never);
      await scheduler.tick();

      expect(prisma.search.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'snoozed' }),
          data: expect.objectContaining({ status: 'active', snoozedUntil: null }),
        }),
      );
    });

    it('calls updateMany before findMany on each tick', async () => {
      const callOrder: string[] = [];
      prisma.search.updateMany.mockImplementation(async () => {
        callOrder.push('updateMany');
        return { count: 0 };
      });
      prisma.search.findMany.mockImplementation(async () => {
        callOrder.push('findMany');
        return [];
      });

      const scheduler = new Scheduler(prisma as never, jobProcessor as never, evaluateCombosQueue as never, rawResultsQueue as never);
      await scheduler.tick();

      expect(callOrder).toEqual(['updateMany', 'findMany']);
    });

    it('does not execute jobs for snoozed searches (not returned by findMany)', async () => {
      // Snoozed searches are filtered out by status='active' query
      prisma.search.findMany.mockResolvedValue([]);

      const scheduler = new Scheduler(prisma as never, jobProcessor as never, evaluateCombosQueue as never, rawResultsQueue as never);
      await scheduler.tick();

      expect(jobProcessor.execute).not.toHaveBeenCalled();
    });

    it('enqueues evaluate-combos with searchId after each search', async () => {
      const search1 = makeSearch({ id: 'search-1' });
      const search2 = makeSearch({ id: 'search-2' });
      prisma.search.findMany.mockResolvedValue([search1, search2]);

      const scheduler = new Scheduler(prisma as never, jobProcessor as never, evaluateCombosQueue as never, rawResultsQueue as never);
      await scheduler.tick();

      expect(evaluateCombosQueue.add).toHaveBeenCalledTimes(2);
      expect(evaluateCombosQueue.add).toHaveBeenCalledWith(
        'evaluate-combos',
        { searchId: 'search-1' },
        expect.objectContaining({ attempts: 2 }),
      );
      expect(evaluateCombosQueue.add).toHaveBeenCalledWith(
        'evaluate-combos',
        { searchId: 'search-2' },
        expect.objectContaining({ attempts: 2 }),
      );
    });

    it('waits for raw-results to drain before enqueueing evaluate-combos', async () => {
      const search = makeSearch({ id: 'search-1' });
      prisma.search.findMany.mockResolvedValue([search]);

      // First poll: 5 pending, second poll: 0 pending
      rawResultsQueue.getJobCounts
        .mockResolvedValueOnce({ waiting: 3, active: 2 })
        .mockResolvedValueOnce({ waiting: 0, active: 0 });

      const scheduler = new Scheduler(prisma as never, jobProcessor as never, evaluateCombosQueue as never, rawResultsQueue as never);
      await scheduler.tick();

      // getJobCounts called at least twice (first poll + drained check)
      expect(rawResultsQueue.getJobCounts.mock.calls.length).toBeGreaterThanOrEqual(2);
      // evaluate-combos was still enqueued after drain
      expect(evaluateCombosQueue.add).toHaveBeenCalledOnce();
    });

    it('does not enqueue evaluate-combos when search execution fails', async () => {
      const search = makeSearch({ id: 'search-1' });
      prisma.search.findMany.mockResolvedValue([search]);
      jobProcessor.execute.mockRejectedValueOnce(new Error('scrape failed'));

      const scheduler = new Scheduler(prisma as never, jobProcessor as never, evaluateCombosQueue as never, rawResultsQueue as never);
      await scheduler.tick();

      // execute threw → entire try block bailed, no evaluate-combos enqueued
      expect(evaluateCombosQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('start', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('calls tick repeatedly on the given interval', async () => {
      prisma.search.findMany.mockResolvedValue([]);
      const scheduler = new Scheduler(prisma as never, jobProcessor as never, evaluateCombosQueue as never, rawResultsQueue as never);
      await scheduler.start(5000);

      // start() already ran cleanStaleResults + tick (1 call).
      // Advance clock by 3 intervals → 3 more ticks = 4 total
      await vi.advanceTimersByTimeAsync(15000);

      expect(prisma.search.findMany).toHaveBeenCalledTimes(4);
    });

    it('calls tick immediately on start', async () => {
      prisma.search.findMany.mockResolvedValue([]);
      const scheduler = new Scheduler(prisma as never, jobProcessor as never, evaluateCombosQueue as never, rawResultsQueue as never);
      await scheduler.start(5000);

      // start() is async and awaited, so the immediate tick has already run
      expect(prisma.search.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('stops calling tick after stop() is called', async () => {
      prisma.search.findMany.mockResolvedValue([]);
      const scheduler = new Scheduler(prisma as never, jobProcessor as never, evaluateCombosQueue as never, rawResultsQueue as never);
      await scheduler.start(5000);

      // start() ran tick immediately (1 call). Advance 1 interval → 2nd call
      await vi.advanceTimersByTimeAsync(5000);
      expect(prisma.search.findMany).toHaveBeenCalledTimes(2);

      scheduler.stop();
      await vi.advanceTimersByTimeAsync(10000);

      // Should still be 2, no more calls after stop
      expect(prisma.search.findMany).toHaveBeenCalledTimes(2);
    });

    it('calling stop when not started does nothing', () => {
      const scheduler = new Scheduler(prisma as never, jobProcessor as never, evaluateCombosQueue as never, rawResultsQueue as never);
      expect(() => scheduler.stop()).not.toThrow();
    });

    it('calling stop twice does nothing', async () => {
      prisma.search.findMany.mockResolvedValue([]);
      const scheduler = new Scheduler(prisma as never, jobProcessor as never, evaluateCombosQueue as never, rawResultsQueue as never);
      await scheduler.start(5000);
      scheduler.stop();
      expect(() => scheduler.stop()).not.toThrow();
    });
  });
});
