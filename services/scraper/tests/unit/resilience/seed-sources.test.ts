import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { seedSources } from '../../../src/resilience/seed-sources.js';

function makeMockPrisma() {
  return {
    source: {
      count: vi.fn(),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
}

describe('seedSources', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  const originalEnv = process.env;

  beforeEach(() => {
    prisma = makeMockPrisma();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('seeds 1 source when table is empty', async () => {
    prisma.source.count.mockResolvedValue(0);

    await seedSources(prisma as never);

    expect(prisma.source.upsert).toHaveBeenCalledTimes(1);
    const names = prisma.source.upsert.mock.calls.map((c) => c[0].where.name);
    expect(names).toEqual(['google-flights']);
  });

  it('skips seeding when sources already exist', async () => {
    prisma.source.count.mockResolvedValue(1);

    await seedSources(prisma as never);

    expect(prisma.source.upsert).not.toHaveBeenCalled();
  });

  it('seeds google-flights with hasApiKey=false', async () => {
    prisma.source.count.mockResolvedValue(0);

    await seedSources(prisma as never);

    const gfCall = prisma.source.upsert.mock.calls.find((c) => c[0].where.name === 'google-flights');
    expect(gfCall![0].create.hasApiKey).toBe(false);
  });

  it('catches and logs errors without throwing', async () => {
    prisma.source.count.mockRejectedValue(new Error('DB unreachable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(seedSources(prisma as never)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('catches non-Error throwables', async () => {
    prisma.source.count.mockRejectedValue('string error');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(seedSources(prisma as never)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('Failed to seed sources:', 'string error');

    errorSpy.mockRestore();
  });
});
