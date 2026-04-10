import { describe, it, expect, vi } from 'vitest';
import { SearchJobProcessor } from '../../src/jobs/search-job.js';
import { QUEUE_NAMES } from '@flight-hunter/shared';

describe('Scraper E2E Flow', () => {
  it('processes a search config through sources and publishes to queue', async () => {
    const publishedResults: any[] = [];

    const mockSource = {
      name: 'mock-source',
      search: vi.fn().mockResolvedValue([
        {
          searchId: 'e2e-search',
          source: 'kiwi' as const,
          outbound: {
            departure: { airport: 'AEP', time: '2026-07-24T10:00:00Z' },
            arrival: { airport: 'CUZ', time: '2026-07-24T15:00:00Z' },
            airline: 'LATAM',
            flightNumber: 'LA1234',
            durationMinutes: 300,
            stops: 0,
          },
          inbound: {
            departure: { airport: 'CUZ', time: '2026-08-08T10:00:00Z' },
            arrival: { airport: 'AEP', time: '2026-08-08T20:00:00Z' },
            airline: 'LATAM',
            flightNumber: 'LA5678',
            durationMinutes: 600,
            stops: 1,
          },
          totalPrice: 350,
          currency: 'USD',
          pricePer: 'person' as const,
          passengers: 2,
          carryOnIncluded: true,
          bookingUrl: 'https://example.com',
          scrapedAt: new Date(),
          proxyRegion: 'CL' as const,
        },
      ]),
    };

    const mockVpnRouter = { getProxyUrl: vi.fn().mockResolvedValue(null) };
    const mockQueue = {
      add: vi.fn().mockImplementation(async (_name: string, data: any) => {
        publishedResults.push(data);
        return { id: `job-${publishedResults.length}` };
      }),
    };

    const processor = new SearchJobProcessor(
      [mockSource as any],
      mockVpnRouter as any,
      mockQueue as any,
    );

    const config = {
      id: 'e2e-search',
      proxyRegions: ['CL', 'AR'],
      alertConfig: { scoreThresholds: { info: 60, good: 75, urgent: 90 }, maxPricePerPerson: 600, currency: 'USD' },
    } as any;

    await processor.execute(config);

    // 1 source * 2 regions = 2 results
    expect(publishedResults.length).toBe(2);
    expect(publishedResults[0].searchId).toBe('e2e-search');
    expect(publishedResults[0].source).toBe('kiwi');
    expect(mockSource.search).toHaveBeenCalledTimes(2);
    expect(mockVpnRouter.getProxyUrl).toHaveBeenCalledWith('CL');
    expect(mockVpnRouter.getProxyUrl).toHaveBeenCalledWith('AR');

    // Verify queue was called with the correct queue name
    expect(mockQueue.add).toHaveBeenCalledWith(QUEUE_NAMES.RAW_RESULTS, expect.any(Object));
  });

  it('continues when a source fails for one region', async () => {
    const publishedResults: any[] = [];

    const failSource = {
      name: 'fail-source',
      search: vi.fn().mockRejectedValue(new Error('API down')),
    };
    const goodSource = {
      name: 'good-source',
      search: vi.fn().mockResolvedValue([
        {
          searchId: 'e2e-search',
          source: 'skyscanner' as const,
          outbound: {
            departure: { airport: 'AEP', time: '2026-07-24T10:00:00Z' },
            arrival: { airport: 'CUZ', time: '2026-07-24T15:00:00Z' },
            airline: 'LATAM',
            flightNumber: 'LA1',
            durationMinutes: 300,
            stops: 0,
          },
          inbound: {
            departure: { airport: 'CUZ', time: '2026-08-08T10:00:00Z' },
            arrival: { airport: 'AEP', time: '2026-08-08T20:00:00Z' },
            airline: 'LATAM',
            flightNumber: 'LA2',
            durationMinutes: 600,
            stops: 1,
          },
          totalPrice: 400,
          currency: 'USD',
          pricePer: 'person' as const,
          passengers: 2,
          carryOnIncluded: true,
          bookingUrl: 'https://example.com',
          scrapedAt: new Date(),
          proxyRegion: 'CL' as const,
        },
      ]),
    };

    const mockVpnRouter = { getProxyUrl: vi.fn().mockResolvedValue(null) };
    const mockQueue = {
      add: vi.fn().mockImplementation(async (_: string, data: any) => {
        publishedResults.push(data);
        return { id: '1' };
      }),
    };

    const processor = new SearchJobProcessor(
      [failSource as any, goodSource as any],
      mockVpnRouter as any,
      mockQueue as any,
    );

    await processor.execute({ id: 'e2e-search', proxyRegions: ['CL'] } as any);

    expect(publishedResults.length).toBe(1);
    expect(goodSource.search).toHaveBeenCalled();
    expect(failSource.search).toHaveBeenCalled();
  });

  it('uses default region when proxyRegions is empty', async () => {
    const publishedResults: any[] = [];

    const mockSource = {
      name: 'mock-source',
      search: vi.fn().mockResolvedValue([
        {
          searchId: 'e2e-search',
          source: 'kiwi' as const,
          outbound: {
            departure: { airport: 'AEP', time: '2026-07-24T10:00:00Z' },
            arrival: { airport: 'CUZ', time: '2026-07-24T15:00:00Z' },
            airline: 'LATAM',
            flightNumber: 'LA1234',
            durationMinutes: 300,
            stops: 0,
          },
          inbound: {
            departure: { airport: 'CUZ', time: '2026-08-08T10:00:00Z' },
            arrival: { airport: 'AEP', time: '2026-08-08T20:00:00Z' },
            airline: 'LATAM',
            flightNumber: 'LA5678',
            durationMinutes: 600,
            stops: 1,
          },
          totalPrice: 350,
          currency: 'USD',
          pricePer: 'person' as const,
          passengers: 2,
          carryOnIncluded: true,
          bookingUrl: 'https://example.com',
          scrapedAt: new Date(),
          proxyRegion: 'CL' as const,
        },
      ]),
    };

    const mockVpnRouter = { getProxyUrl: vi.fn().mockResolvedValue(null) };
    const mockQueue = {
      add: vi.fn().mockImplementation(async (_: string, data: any) => {
        publishedResults.push(data);
        return { id: '1' };
      }),
    };

    const processor = new SearchJobProcessor(
      [mockSource as any],
      mockVpnRouter as any,
      mockQueue as any,
    );

    await processor.execute({ id: 'e2e-search', proxyRegions: [] } as any);

    // Falls back to ['default'] → 1 region * 1 source = 1 result
    expect(publishedResults.length).toBe(1);
    expect(mockVpnRouter.getProxyUrl).toHaveBeenCalledWith('default');
  });
});
