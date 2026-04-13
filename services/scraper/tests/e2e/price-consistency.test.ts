import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleFlightsSource } from '../../src/sources/google-flights.js';
import { normalizePricePerPerson } from '@flight-hunter/shared';
import type { SearchConfig } from '@flight-hunter/shared';

// Mock playwright module
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(),
  },
}));

const makeConsistencyConfig = (overrides: Partial<SearchConfig> = {}): SearchConfig => ({
  id: 'consistency-search',
  name: 'Price Consistency E2E',
  origin: 'AEP',
  departureFrom: new Date('2026-08-05'),
  departureTo: new Date('2026-08-10'),
  passengers: 2,
  waypoints: [
    { airport: 'CUZ', gap: { type: 'stay', minDays: 7, maxDays: 10 } },
    { airport: 'LIM', gap: { type: 'stay', minDays: 3, maxDays: 4 } },
  ],
  proxyRegions: ['CL'],
  scanIntervalMin: 60,
  active: true,
  filters: {
    airlineBlacklist: [],
    airlinePreferred: [],
    airportPreferred: {},
    airportBlacklist: {},
    maxUnplannedStops: 1,
    requireCarryOn: false,
    maxTotalTravelTime: 1440,
  },
  alertConfig: {
    scoreThresholds: { info: 60, good: 75, urgent: 90 },
    maxPricePerPerson: 600,
    currency: 'USD',
  },
  ...overrides,
});

function makeMockPage(evaluateResult: unknown = [], urlOverride?: string) {
  let lastGotoUrl = urlOverride ?? 'https://www.google.com/travel/flights/search?tfs=mock';
  const mockLocator = {
    isVisible: vi.fn().mockResolvedValue(false),
    click: vi.fn().mockResolvedValue(undefined),
    first: vi.fn().mockReturnThis(),
    waitFor: vi.fn().mockResolvedValue(undefined),
  };
  return {
    goto: vi.fn().mockImplementation((u: string) => { lastGotoUrl = u; return Promise.resolve(); }),
    evaluate: vi.fn().mockResolvedValue(evaluateResult),
    url: vi.fn().mockImplementation(() => lastGotoUrl),
    locator: vi.fn().mockReturnValue(mockLocator),
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

describe('Price Consistency E2E: scraper → analyzer → alert', () => {
  let chromiumLaunchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const playwright = await import('playwright');
    chromiumLaunchMock = vi.mocked(playwright.chromium.launch);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('scraper produces FlightResult with correct price, pricePer, passengers, and durationMinutes', async () => {
    const knownFlight = {
      price: 250,
      airline: 'TestAir',
      stops: 'Nonstop',
      departureTime: '8:00 AM',
      arrivalTime: '1:00 PM',
      nextDay: false,
      scrapedDuration: 300, // 5 hours
    };

    const mockPage = makeMockPage([knownFlight]);
    const mockBrowser = makeMockBrowser(mockPage);
    chromiumLaunchMock.mockResolvedValue(mockBrowser);

    const source = new GoogleFlightsSource();
    const config = makeConsistencyConfig();
    const leg = {
      origin: 'AEP',
      destination: 'CUZ',
      departureFrom: new Date('2026-08-05'),
      departureTo: new Date('2026-08-05'),
    };

    const results = await source.searchOneWay(config, leg, null);

    expect(results.length).toBeGreaterThan(0);
    const result = results[0];

    // Price as scraped (total for N adults — config has passengers=2)
    expect(result.totalPrice).toBe(250);
    // Google shows total for N adults
    expect(result.pricePer).toBe('total');
    // passengers matches the search config
    expect(result.passengers).toBe(2);
    // durationMinutes comes from scrapedDuration
    expect(result.outbound.durationMinutes).toBe(300);
  });

  it('analyzer normalization: pricePerPerson=125 when pricePer=total, passengers=2', () => {
    // Simulate what the analyzer does: Google shows $250 total for 2 adults
    const totalPrice = 250;
    const pricePer = 'total' as const;
    const passengers = 2;

    const pricePerPerson = normalizePricePerPerson(totalPrice, pricePer, passengers);

    // $250 total / 2 pax = $125 per person
    expect(pricePerPerson).toBe(125);
  });

  it('booking URL contains +for+2+adults (real passenger count from config)', async () => {
    const source = new GoogleFlightsSource();
    const depDate = new Date('2026-08-05');
    // config.passengers = 2
    const bookingUrl = source.buildBookingUrl('AEP', 'CUZ', depDate, 2);

    expect(bookingUrl).toContain('+for+2+adults');
  });

  it('scrape URL does NOT contain +for+ (always 1 adult for consistent per-person pricing)', async () => {
    const source = new GoogleFlightsSource();
    const depDate = new Date('2026-08-05');
    const scrapeUrl = source.buildScrapeUrl('AEP', 'CUZ', depDate);

    expect(scrapeUrl).not.toContain('+for+');
  });

  it('full flow: scraper result bookingUrl contains real passenger count', async () => {
    const knownFlight = {
      price: 250,
      airline: 'TestAir',
      stops: 'Nonstop',
      departureTime: '8:00 AM',
      arrivalTime: '1:00 PM',
      nextDay: false,
      scrapedDuration: 300,
    };

    const mockPage = makeMockPage([knownFlight]);
    const mockBrowser = makeMockBrowser(mockPage);
    chromiumLaunchMock.mockResolvedValue(mockBrowser);

    const source = new GoogleFlightsSource();
    const config = makeConsistencyConfig(); // passengers=2
    const leg = {
      origin: 'AEP',
      destination: 'CUZ',
      departureFrom: new Date('2026-08-05'),
      departureTo: new Date('2026-08-05'),
    };

    const results = await source.searchOneWay(config, leg, null);
    expect(results.length).toBeGreaterThan(0);

    const { bookingUrl } = results[0];
    // Booking URL uses real passenger count (config.passengers=2)
    expect(bookingUrl).toContain('+for+2+adults');
  });
});
