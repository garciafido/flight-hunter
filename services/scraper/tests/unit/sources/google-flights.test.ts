import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleFlightsSource } from '../../../src/sources/google-flights.js';
import type { SearchConfig } from '@flight-hunter/shared';

// Mock playwright module
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(),
  },
}));

const makeConfig = (overrides: Partial<SearchConfig> = {}): SearchConfig => ({
  id: 'search-3',
  name: 'Google Test',
  origin: 'SCL',
  departureFrom: new Date('2025-07-01'),
  departureTo: new Date('2025-07-15'),
  passengers: 2,
  proxyRegions: ['CL'],
  scanIntervalMin: 60,
  active: true,
  filters: {
    airlineBlacklist: [],
    airlinePreferred: [],
    airportPreferred: {},
    airportBlacklist: {},
    maxUnplannedStops: 1,
    minConnectionTime: 60,
    maxConnectionTime: 240,
    requireCarryOn: false,
    maxTotalTravelTime: 1440,
  },
  alertConfig: {
    scoreThresholds: { info: 60, good: 75, urgent: 90 },
    maxPricePerPerson: 2000,
    currency: 'USD',
  },
  ...overrides,
});

describe('GoogleFlightsSource', () => {
  it('has correct name', () => {
    const source = new GoogleFlightsSource();
    expect(source.name).toBe('google-flights');
  });

  describe('buildOneWayUrl', () => {
    it('returns a Google Flights URL with one-way format', () => {
      const source = new GoogleFlightsSource();
      // Use local noon to avoid UTC midnight timezone issues in formatDate
      const depDate = new Date('2026-07-25T12:00:00');
      const url = source.buildOneWayUrl('BUE', 'CUZ', depDate);
      expect(url).toContain('google.com/travel/flights');
      expect(url).toContain('BUE');
      expect(url).toContain('CUZ');
      expect(url).toContain('One+way');
      expect(url).toMatch(/2026-07-2[45]/); // allow for local timezone offset
    });
  });

  describe('searchOneWay', () => {
    let chromiumLaunchMock: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      const playwright = await import('playwright');
      chromiumLaunchMock = vi.mocked(playwright.chromium.launch);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    function makeMockPage(evaluateResult: unknown = []) {
      return {
        goto: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue(evaluateResult),
        getByText: vi.fn().mockReturnValue({
          isVisible: vi.fn().mockResolvedValue(false),
          click: vi.fn().mockResolvedValue(undefined),
        }),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
      };
    }

    function makeMockBrowser(page: ReturnType<typeof makeMockPage>) {
      return {
        newContext: vi.fn().mockResolvedValue({
          newPage: vi.fn().mockResolvedValue(page),
        }),
        newPage: vi.fn().mockResolvedValue(page),
        close: vi.fn().mockResolvedValue(undefined),
      };
    }

    const makeLeg = (overrides: Partial<{ origin: string; destination: string; departureFrom: Date; departureTo: Date }> = {}) => ({
      origin: 'BUE',
      destination: 'CUZ',
      departureFrom: new Date('2026-07-25'),
      departureTo: new Date('2026-07-27'),
      ...overrides,
    });

    it('returns results for one-way leg', async () => {
      const mockPage = makeMockPage([{ price: 350, airline: 'LATAM', stops: 'Nonstop' }]);
      const mockBrowser = makeMockBrowser(mockPage);
      chromiumLaunchMock.mockResolvedValue(mockBrowser);

      const source = new GoogleFlightsSource();
      const results = await source.searchOneWay(makeConfig(), makeLeg(), null);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].source).toBe('google-flights');
    });

    it('uses leg origin and destination for result airports', async () => {
      const mockPage = makeMockPage([{ price: 200, airline: 'LATAM', stops: 'Nonstop' }]);
      const mockBrowser = makeMockBrowser(mockPage);
      chromiumLaunchMock.mockResolvedValue(mockBrowser);

      const source = new GoogleFlightsSource();
      const results = await source.searchOneWay(makeConfig(), makeLeg(), null);

      expect(results[0].outbound.departure.airport).toBe('BUE');
      expect(results[0].outbound.arrival.airport).toBe('CUZ');
    });

    it('returns [] when playwright throws', async () => {
      chromiumLaunchMock.mockRejectedValue(new Error('crash'));

      const source = new GoogleFlightsSource();
      const results = await source.searchOneWay(makeConfig(), makeLeg(), null);
      expect(results).toEqual([]);
    });

    it('caps date range at 8 dates', async () => {
      const mockPage = makeMockPage([]);
      const mockBrowser = makeMockBrowser(mockPage);
      chromiumLaunchMock.mockResolvedValue(mockBrowser);

      const source = new GoogleFlightsSource();
      // 20-day range should be capped at 8 scrapes
      const wideLeg = makeLeg({
        departureFrom: new Date('2026-07-01'),
        departureTo: new Date('2026-07-20'),
      });
      await source.searchOneWay(makeConfig(), wideLeg, null);

      // goto should be called max 8 times
      expect(mockPage.goto.mock.calls.length).toBeLessThanOrEqual(8);
    });

    it('computes outbound.durationMinutes from real scraped times', async () => {
      const mockPage = makeMockPage([
        {
          price: 250,
          airline: 'JetSMART',
          stops: 'Nonstop',
          departureTime: '8:40 AM',
          arrivalTime: '1:00 PM',
          nextDay: false,
        },
      ]);
      const mockBrowser = makeMockBrowser(mockPage);
      chromiumLaunchMock.mockResolvedValue(mockBrowser);

      const source = new GoogleFlightsSource();
      const results = await source.searchOneWay(makeConfig(), makeLeg(), null);

      expect(results.length).toBeGreaterThan(0);
      // 8:40 AM → 1:00 PM = 4h 20m = 260 minutes
      expect(results[0].outbound.durationMinutes).toBe(260);
      // ISO times should reflect the wall-clock as UTC encoding
      expect(results[0].outbound.departure.time).toMatch(/T08:40:00/);
      expect(results[0].outbound.arrival.time).toMatch(/T13:00:00/);
    });

    it('leaves durationMinutes at 0 when scraped times are missing', async () => {
      const mockPage = makeMockPage([
        { price: 350, airline: 'LATAM', stops: 'Nonstop' },
      ]);
      const mockBrowser = makeMockBrowser(mockPage);
      chromiumLaunchMock.mockResolvedValue(mockBrowser);

      const source = new GoogleFlightsSource();
      const results = await source.searchOneWay(makeConfig(), makeLeg(), null);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].outbound.durationMinutes).toBe(0);
      // Times fall back to midnight UTC of the departure date
      expect(results[0].outbound.departure.time).toMatch(/T00:00:00/);
    });

    it('handles next-day arrival (red-eye) by adding a day to arrival ISO', async () => {
      const mockPage = makeMockPage([
        {
          price: 400,
          airline: 'LATAM',
          stops: '1 stop',
          departureTime: '11:30 PM',
          arrivalTime: '6:00 AM',
          nextDay: true,
        },
      ]);
      const mockBrowser = makeMockBrowser(mockPage);
      chromiumLaunchMock.mockResolvedValue(mockBrowser);

      const source = new GoogleFlightsSource();
      const leg = makeLeg({
        departureFrom: new Date('2026-07-25'),
        departureTo: new Date('2026-07-25'),
      });
      const results = await source.searchOneWay(makeConfig(), leg, null);

      expect(results.length).toBeGreaterThan(0);
      // 11:30 PM on 25th → 6:00 AM on 26th = 6h 30m = 390 minutes
      expect(results[0].outbound.durationMinutes).toBe(390);
      expect(results[0].outbound.departure.time).toContain('2026-07-25');
      expect(results[0].outbound.arrival.time).toContain('2026-07-26');
    });
  });
});
