import { describe, it, expect, vi } from 'vitest';
import { AnalyzerWorker } from '../../src/worker.js';
import type { AnalyzerDeps } from '../../src/worker.js';
import type { RawResultJob } from '@flight-hunter/shared';
import { FilterEngine } from '../../src/filters/filter-engine.js';
import { DealDetector } from '../../src/detection/deal-detector.js';
import { HistoryService } from '../../src/detection/history.js';
import { OutlierDetector } from '../../src/detection/outlier-detector.js';
import { Publisher } from '../../src/publisher.js';
import type { PrismaClient } from '@flight-hunter/shared/db';

function makeJob(data: RawResultJob): RawResultJob {
  return data;
}

describe('Analyzer E2E Flow', () => {
  it('processes a raw result through the full pipeline', async () => {
    const published: any[] = [];

    const mockPrisma = {
      search: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'search-1',
          name: 'BUE -> CUZ Julio',
          filters: {
            airlineBlacklist: [],
            airlinePreferred: ['LATAM'],
            airportPreferred: { BUE: ['AEP'] },
            airportBlacklist: {},
            maxUnplannedStops: 2,
            minConnectionTime: 60,
            maxConnectionTime: 480,
            requireCarryOn: true,
            // maxTotalTravelTime in minutes: 300 + 480 = 780 outbound + inbound
            maxTotalTravelTime: 2880,
          },
          alertConfig: {
            scoreThresholds: { info: 60, good: 75, urgent: 90 },
            maxPricePerPerson: 600,
            targetPricePerPerson: 350,
            dreamPricePerPerson: 250,
            currency: 'USD',
          },
          stopover: { airport: 'LIM', minDays: 3, maxDays: 4 },
        }),
      },
      flightResult: {
        create: vi.fn().mockResolvedValue({ id: 'result-1' }),
        aggregate: vi.fn().mockResolvedValue({ _avg: { pricePerPerson: null }, _min: { pricePerPerson: null } }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaClient;

    const mockAlertQueue = {
      add: vi.fn().mockImplementation(async (_: string, data: any) => {
        published.push(data);
        return { id: '1' };
      }),
    };

    const deps: AnalyzerDeps = {
      filterEngine: new FilterEngine(),
      dealDetector: new DealDetector(),
      historyService: new HistoryService(mockPrisma),
      outlierDetector: new OutlierDetector(mockPrisma),
      publisher: new Publisher(mockAlertQueue as any, mockPrisma),
      prisma: mockPrisma,
    };

    const worker = new AnalyzerWorker(deps);

    await worker.process(
      makeJob({
        searchId: 'search-1',
        source: 'google-flights',
        outbound: {
          departure: { airport: 'AEP', time: '2026-07-24T10:00:00Z' },
          arrival: { airport: 'LIM', time: '2026-07-24T15:00:00Z' },
          airline: 'LATAM',
          flightNumber: 'LA1234',
          durationMinutes: 300,
          stops: 0,
        },
        inbound: {
          departure: { airport: 'CUZ', time: '2026-08-08T10:00:00Z' },
          arrival: { airport: 'AEP', time: '2026-08-08T18:00:00Z' },
          airline: 'LATAM',
          flightNumber: 'LA5678',
          durationMinutes: 480,
          stops: 1,
        },
        stopover: {
          airport: 'LIM',
          arrivalTime: '2026-07-24T15:00:00Z',
          departureTime: '2026-07-27T10:00:00Z',
          durationDays: 3,
        },
        totalPrice: 285,
        currency: 'USD',
        pricePer: 'person',
        passengers: 2,
        carryOnIncluded: true,
        bookingUrl: 'https://www.google.com/travel/flights/booking/abc',
        scrapedAt: '2026-04-08T12:00:00Z',
        proxyRegion: 'CL',
      }),
    );

    // Should save to DB
    expect(vi.mocked(mockPrisma.flightResult.create)).toHaveBeenCalledOnce();

    const savedData = vi.mocked(mockPrisma.flightResult.create).mock.calls[0][0].data;
    expect(savedData.searchId).toBe('search-1');
    expect(Number(savedData.pricePerPerson)).toBe(285);
    expect(savedData.score).toBeGreaterThan(0);

    // Price 285 < target (350) → should trigger at least 'good' deal level
    // Score should be meaningful since LATAM is preferred and stopover is valid
    expect(savedData.alertLevel).not.toBeNull();
  });

  it('filters out blacklisted airline', async () => {
    const mockPrisma = {
      search: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'search-1',
          name: 'Test',
          filters: {
            airlineBlacklist: ['Spirit'],
            airlinePreferred: [],
            airportPreferred: {},
            airportBlacklist: {},
            maxUnplannedStops: 2,
            minConnectionTime: 60,
            maxConnectionTime: 480,
            requireCarryOn: false,
            maxTotalTravelTime: 2880,
          },
          alertConfig: {
            scoreThresholds: { info: 60, good: 75, urgent: 90 },
            maxPricePerPerson: 600,
            currency: 'USD',
          },
          stopover: null,
        }),
      },
      flightResult: {
        create: vi.fn().mockResolvedValue({ id: 'result-1' }),
        aggregate: vi.fn().mockResolvedValue({ _avg: { pricePerPerson: null }, _min: { pricePerPerson: null } }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaClient;

    const mockQueue = { add: vi.fn() };

    const deps: AnalyzerDeps = {
      filterEngine: new FilterEngine(),
      dealDetector: new DealDetector(),
      historyService: new HistoryService(mockPrisma),
      outlierDetector: new OutlierDetector(mockPrisma),
      publisher: new Publisher(mockQueue as any, mockPrisma),
      prisma: mockPrisma,
    };

    const worker = new AnalyzerWorker(deps);

    await worker.process(
      makeJob({
        searchId: 'search-1',
        source: 'google-flights',
        outbound: {
          departure: { airport: 'AEP', time: '2026-07-24T10:00:00Z' },
          arrival: { airport: 'CUZ', time: '2026-07-24T15:00:00Z' },
          airline: 'Spirit',
          flightNumber: 'NK100',
          durationMinutes: 300,
          stops: 0,
        },
        inbound: {
          departure: { airport: 'CUZ', time: '2026-08-08T10:00:00Z' },
          arrival: { airport: 'AEP', time: '2026-08-08T18:00:00Z' },
          airline: 'Spirit',
          flightNumber: 'NK200',
          durationMinutes: 480,
          stops: 1,
        },
        totalPrice: 200,
        currency: 'USD',
        pricePer: 'person',
        passengers: 2,
        carryOnIncluded: true,
        bookingUrl: 'https://example.com',
        scrapedAt: '2026-04-08T12:00:00Z',
        proxyRegion: 'AR',
      }),
    );

    // Should still save to DB but with score=0 and no alert (filtered out path calls publisher.publish)
    expect(vi.mocked(mockPrisma.flightResult.create)).toHaveBeenCalledOnce();
    const savedData = vi.mocked(mockPrisma.flightResult.create).mock.calls[0][0].data;
    expect(savedData.score).toBe(0);
    expect(savedData.alertLevel).toBeUndefined();

    // Should NOT push to alert queue
    expect(mockQueue.add).not.toHaveBeenCalled();
  });
});
