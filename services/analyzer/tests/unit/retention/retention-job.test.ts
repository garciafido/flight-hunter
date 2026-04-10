import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetentionJob } from '../../../src/retention/retention-job.js';

function makePrisma(flightDeleteCount = 5, metricsDeleteCount = 10) {
  return {
    flightResult: {
      deleteMany: vi.fn().mockResolvedValue({ count: flightDeleteCount }),
    },
    sourceMetric: {
      deleteMany: vi.fn().mockResolvedValue({ count: metricsDeleteCount }),
    },
  };
}

describe('RetentionJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes flight results older than 90 days', async () => {
    const prisma = makePrisma();
    const job = new RetentionJob(prisma as any);
    const before = Date.now();
    await job.run();

    expect(prisma.flightResult.deleteMany).toHaveBeenCalledOnce();
    const { where } = (prisma.flightResult.deleteMany as any).mock.calls[0][0];
    const cutoff = where.createdAt.lt as Date;
    const expectedCutoff = before - 90 * 24 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBeCloseTo(expectedCutoff, -3); // within 1 second
  });

  it('deletes source metrics older than 30 days', async () => {
    const prisma = makePrisma();
    const job = new RetentionJob(prisma as any);
    const before = Date.now();
    await job.run();

    expect(prisma.sourceMetric.deleteMany).toHaveBeenCalledOnce();
    const { where } = (prisma.sourceMetric.deleteMany as any).mock.calls[0][0];
    const cutoff = where.timestamp.lt as Date;
    const expectedCutoff = before - 30 * 24 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBeCloseTo(expectedCutoff, -3);
  });

  it('returns counts of deleted records', async () => {
    const prisma = makePrisma(7, 13);
    const job = new RetentionJob(prisma as any);
    const result = await job.run();

    expect(result.deletedFlightResults).toBe(7);
    expect(result.deletedSourceMetrics).toBe(13);
  });

  it('uses custom retention days when specified', async () => {
    const prisma = makePrisma();
    const job = new RetentionJob(prisma as any, 30);
    const before = Date.now();
    await job.run();

    const { where } = (prisma.flightResult.deleteMany as any).mock.calls[0][0];
    const cutoff = where.createdAt.lt as Date;
    const expectedCutoff = before - 30 * 24 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBeCloseTo(expectedCutoff, -3);
  });

  it('returns zero counts when nothing to delete', async () => {
    const prisma = makePrisma(0, 0);
    const job = new RetentionJob(prisma as any);
    const result = await job.run();

    expect(result.deletedFlightResults).toBe(0);
    expect(result.deletedSourceMetrics).toBe(0);
  });
});
