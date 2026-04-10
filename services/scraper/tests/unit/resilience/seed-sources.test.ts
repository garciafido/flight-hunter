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
    delete process.env.TRAVELPAYOUTS_TOKEN;
    delete process.env.DUFFEL_API_TOKEN;
    delete process.env.AMADEUS_API_KEY;
    delete process.env.AMADEUS_API_SECRET;
    delete process.env.KIWI_API_KEY;
    delete process.env.SKYSCANNER_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('seeds 6 sources when table is empty', async () => {
    prisma.source.count.mockResolvedValue(0);

    await seedSources(prisma as never);

    expect(prisma.source.upsert).toHaveBeenCalledTimes(6);
    const names = prisma.source.upsert.mock.calls.map((c) => c[0].where.name);
    expect(names).toEqual(
      expect.arrayContaining(['google-flights', 'travelpayouts', 'duffel', 'amadeus', 'kiwi', 'skyscanner']),
    );
  });

  it('skips seeding when sources already exist', async () => {
    prisma.source.count.mockResolvedValue(3);

    await seedSources(prisma as never);

    expect(prisma.source.upsert).not.toHaveBeenCalled();
  });

  it('marks travelpayouts as having API key when token env is set', async () => {
    prisma.source.count.mockResolvedValue(0);
    process.env.TRAVELPAYOUTS_TOKEN = 'tp-token';

    await seedSources(prisma as never);

    const tpCall = prisma.source.upsert.mock.calls.find((c) => c[0].where.name === 'travelpayouts');
    expect(tpCall![0].create.hasApiKey).toBe(true);
  });

  it('marks amadeus as having API key only when both KEY and SECRET are set', async () => {
    prisma.source.count.mockResolvedValue(0);
    process.env.AMADEUS_API_KEY = 'k';
    // No secret

    await seedSources(prisma as never);

    const amCall = prisma.source.upsert.mock.calls.find((c) => c[0].where.name === 'amadeus');
    expect(amCall![0].create.hasApiKey).toBe(false);

    // Now with both
    prisma.source.upsert.mockClear();
    prisma.source.count.mockResolvedValue(0);
    process.env.AMADEUS_API_SECRET = 's';

    await seedSources(prisma as never);

    const amCall2 = prisma.source.upsert.mock.calls.find((c) => c[0].where.name === 'amadeus');
    expect(amCall2![0].create.hasApiKey).toBe(true);
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
