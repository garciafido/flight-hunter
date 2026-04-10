import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleFlightsSource } from '../../../src/sources/google-flights.js';
import type { SearchConfig, SearchLeg } from '@flight-hunter/shared';

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
  destination: 'MAD',
  departureFrom: new Date('2025-07-01'),
  departureTo: new Date('2025-07-15'),
  returnMinDays: 7,
  returnMaxDays: 14,
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

  describe('buildUrl', () => {
    it('returns a Google Flights URL containing origin and destination', () => {
      const source = new GoogleFlightsSource();
      const url = source.buildUrl(makeConfig());
      expect(url).toContain('google.com/travel/flights');
      expect(url).toContain('SCL');
      expect(url).toContain('MAD');
    });
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

  describe('search', () => {
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

    it('returns results when playwright scrapes prices', async () => {
      const mockPage = makeMockPage([
        { price: 800, airline: 'LATAM', stops: '1 stop' },
      ]);
      const mockBrowser = makeMockBrowser(mockPage);
      chromiumLaunchMock.mockResolvedValue(mockBrowser);

      const source = new GoogleFlightsSource();
      const results = await source.search(makeConfig(), null);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].source).toBe('google-flights');
      expect(results[0].totalPrice).toBe(800);
      expect(results[0].searchId).toBe('search-3');
    });

    it('passes proxy server to chromium when proxyUrl given', async () => {
      const mockBrowser = makeMockBrowser(makeMockPage());
      chromiumLaunchMock.mockResolvedValue(mockBrowser);

      const source = new GoogleFlightsSource();
      await source.search(makeConfig(), 'socks5://127.0.0.1:1080');

      expect(chromiumLaunchMock).toHaveBeenCalledWith(
        expect.objectContaining({ proxy: { server: 'socks5://127.0.0.1:1080' } }),
      );
    });

    it('launches without proxy when proxyUrl is null', async () => {
      const mockBrowser = makeMockBrowser(makeMockPage());
      chromiumLaunchMock.mockResolvedValue(mockBrowser);

      const source = new GoogleFlightsSource();
      await source.search(makeConfig(), null);

      const callArg = chromiumLaunchMock.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg['proxy']).toBeUndefined();
    });

    it('returns [] when playwright throws during launch', async () => {
      chromiumLaunchMock.mockRejectedValue(new Error('browser crash'));

      const source = new GoogleFlightsSource();
      const results = await source.search(makeConfig(), null);
      expect(results).toEqual([]);
    });

    it('returns empty array when no prices are found', async () => {
      const mockBrowser = makeMockBrowser(makeMockPage([]));
      chromiumLaunchMock.mockResolvedValue(mockBrowser);

      const source = new GoogleFlightsSource();
      const results = await source.search(makeConfig(), null);
      expect(results).toEqual([]);
    });

    it('uses first proxyRegion for result proxyRegion', async () => {
      const mockBrowser = makeMockBrowser(
        makeMockPage([{ price: 900, airline: 'LATAM', stops: '1 stop' }]),
      );
      chromiumLaunchMock.mockResolvedValue(mockBrowser);

      const source = new GoogleFlightsSource();
      const results = await source.search(makeConfig({ proxyRegions: ['AR'] }), null);
      expect(results[0].proxyRegion).toBe('AR');
    });

    it('falls back to CL when proxyRegions is empty', async () => {
      const mockBrowser = makeMockBrowser(
        makeMockPage([{ price: 900, airline: 'LATAM', stops: '1 stop' }]),
      );
      chromiumLaunchMock.mockResolvedValue(mockBrowser);

      const source = new GoogleFlightsSource();
      const results = await source.search(makeConfig({ proxyRegions: [] }), null);
      expect(results[0].proxyRegion).toBe('CL');
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

    const makeLeg = (overrides: Partial<SearchLeg> = {}): SearchLeg => ({
      origin: 'BUE',
      destination: 'CUZ',
      departureFrom: new Date('2026-07-25'),
      departureTo: new Date('2026-07-27'),
      ...overrides,
    });

    it('returns results with correct legIndex', async () => {
      const mockPage = makeMockPage([{ price: 350, airline: 'LATAM', stops: 'Nonstop' }]);
      const mockBrowser = makeMockBrowser(mockPage);
      chromiumLaunchMock.mockResolvedValue(mockBrowser);

      const source = new GoogleFlightsSource();
      const results = await source.searchOneWay(makeConfig(), 1, makeLeg(), null);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].legIndex).toBe(1);
      expect(results[0].source).toBe('google-flights');
    });

    it('uses leg origin and destination for result airports', async () => {
      const mockPage = makeMockPage([{ price: 200, airline: 'LATAM', stops: 'Nonstop' }]);
      const mockBrowser = makeMockBrowser(mockPage);
      chromiumLaunchMock.mockResolvedValue(mockBrowser);

      const source = new GoogleFlightsSource();
      const results = await source.searchOneWay(makeConfig(), 0, makeLeg(), null);

      expect(results[0].outbound.departure.airport).toBe('BUE');
      expect(results[0].outbound.arrival.airport).toBe('CUZ');
    });

    it('returns [] when playwright throws', async () => {
      chromiumLaunchMock.mockRejectedValue(new Error('crash'));

      const source = new GoogleFlightsSource();
      const results = await source.searchOneWay(makeConfig(), 0, makeLeg(), null);
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
      await source.searchOneWay(makeConfig(), 0, wideLeg, null);

      // goto should be called max 8 times
      expect(mockPage.goto.mock.calls.length).toBeLessThanOrEqual(8);
    });
  });
});
