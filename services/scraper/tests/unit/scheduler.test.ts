import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler } from '../../src/scheduler.js';

const makeSearch = (overrides = {}) => ({
  id: 'search-1',
  name: 'Test',
  origin: 'SCL',
  destination: 'MAD',
  active: true,
  ...overrides,
});

describe('Scheduler', () => {
  let prisma: { search: { findMany: ReturnType<typeof vi.fn> } };
  let jobProcessor: { execute: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = {
      search: {
        findMany: vi.fn().mockResolvedValue([makeSearch()]),
      },
    };
    jobProcessor = {
      execute: vi.fn().mockResolvedValue(undefined),
    };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('tick', () => {
    it('loads active searches and executes job for each', async () => {
      const search1 = makeSearch({ id: 'search-1' });
      const search2 = makeSearch({ id: 'search-2' });
      prisma.search.findMany.mockResolvedValue([search1, search2]);

      const scheduler = new Scheduler(prisma as never, jobProcessor as never);
      await scheduler.tick();

      expect(prisma.search.findMany).toHaveBeenCalledWith({ where: { active: true } });
      expect(jobProcessor.execute).toHaveBeenCalledTimes(2);
      expect(jobProcessor.execute).toHaveBeenCalledWith(search1);
      expect(jobProcessor.execute).toHaveBeenCalledWith(search2);
    });

    it('continues with other searches if one execute throws', async () => {
      const search1 = makeSearch({ id: 'search-1' });
      const search2 = makeSearch({ id: 'search-2' });
      prisma.search.findMany.mockResolvedValue([search1, search2]);
      jobProcessor.execute.mockRejectedValueOnce(new Error('execute failed'));

      const scheduler = new Scheduler(prisma as never, jobProcessor as never);
      await expect(scheduler.tick()).resolves.toBeUndefined();

      expect(jobProcessor.execute).toHaveBeenCalledTimes(2);
    });

    it('does nothing when no active searches exist', async () => {
      prisma.search.findMany.mockResolvedValue([]);

      const scheduler = new Scheduler(prisma as never, jobProcessor as never);
      await scheduler.tick();

      expect(jobProcessor.execute).not.toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('calls tick repeatedly on the given interval', async () => {
      prisma.search.findMany.mockResolvedValue([]);
      const scheduler = new Scheduler(prisma as never, jobProcessor as never);
      scheduler.start(5000);

      // Advance clock by 3 intervals; start() also runs tick once immediately = 4 total
      await vi.advanceTimersByTimeAsync(15000);

      expect(prisma.search.findMany).toHaveBeenCalledTimes(4);
    });

    it('calls tick immediately on start', async () => {
      prisma.search.findMany.mockResolvedValue([]);
      const scheduler = new Scheduler(prisma as never, jobProcessor as never);
      scheduler.start(5000);

      // Allow microtask queue to flush so the immediate tick runs
      await vi.advanceTimersByTimeAsync(0);
      expect(prisma.search.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('stops calling tick after stop() is called', async () => {
      prisma.search.findMany.mockResolvedValue([]);
      const scheduler = new Scheduler(prisma as never, jobProcessor as never);
      scheduler.start(5000);

      // Initial tick + one interval = 2 calls
      await vi.advanceTimersByTimeAsync(5000);
      expect(prisma.search.findMany).toHaveBeenCalledTimes(2);

      scheduler.stop();
      await vi.advanceTimersByTimeAsync(10000);

      // Should still be 2, no more calls after stop
      expect(prisma.search.findMany).toHaveBeenCalledTimes(2);
    });

    it('calling stop when not started does nothing', () => {
      const scheduler = new Scheduler(prisma as never, jobProcessor as never);
      expect(() => scheduler.stop()).not.toThrow();
    });

    it('calling stop twice does nothing', async () => {
      prisma.search.findMany.mockResolvedValue([]);
      const scheduler = new Scheduler(prisma as never, jobProcessor as never);
      scheduler.start(5000);
      scheduler.stop();
      expect(() => scheduler.stop()).not.toThrow();
    });
  });
});
