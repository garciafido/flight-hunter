import { describe, it, expect } from 'vitest';
import type {
  AirportTime,
  FlightLeg,
  StopoverInfo,
  FlightResult,
  FlightSource,
  ProxyRegion,
} from '../src/types/flight.js';
import type {
  StopoverConfig,
  TimeRange,
  SearchFilters,
  SearchAlertConfig,
  SearchConfig,
} from '../src/types/search.js';
import type { ProxyType, ProxyAuth, ProxyConfig } from '../src/types/proxy.js';
import type {
  AlertLevel,
  NotificationChannel,
  Alert,
  ScoreBreakdown,
} from '../src/types/alert.js';

describe('Flight types', () => {
  it('AirportTime holds airport and time', () => {
    const at: AirportTime = { airport: 'SCL', time: '10:00' };
    expect(at.airport).toBe('SCL');
    expect(at.time).toBe('10:00');
  });

  it('FlightLeg holds all leg properties', () => {
    const leg: FlightLeg = {
      departure: { airport: 'SCL', time: '10:00' },
      arrival: { airport: 'MIA', time: '18:00' },
      airline: 'LATAM',
      flightNumber: 'LA800',
      durationMinutes: 480,
      stops: 0,
    };
    expect(leg.airline).toBe('LATAM');
    expect(leg.flightNumber).toBe('LA800');
    expect(leg.durationMinutes).toBe(480);
    expect(leg.stops).toBe(0);
  });

  it('StopoverInfo holds stopover details', () => {
    const s: StopoverInfo = {
      airport: 'BOG',
      arrivalTime: '2025-06-01T12:00:00Z',
      departureTime: '2025-06-03T10:00:00Z',
      durationDays: 2,
    };
    expect(s.airport).toBe('BOG');
    expect(s.durationDays).toBe(2);
  });

  it('FlightSource union accepts valid values', () => {
    const sources: FlightSource[] = ['kiwi', 'skyscanner', 'google-flights'];
    expect(sources).toHaveLength(3);
  });

  it('ProxyRegion union accepts CL and AR', () => {
    const regions: ProxyRegion[] = ['CL', 'AR'];
    expect(regions).toHaveLength(2);
  });

  it('FlightResult can be constructed without optional stopover', () => {
    const result: FlightResult = {
      searchId: 'search-1',
      source: 'kiwi',
      outbound: {
        departure: { airport: 'SCL', time: '10:00' },
        arrival: { airport: 'MIA', time: '18:00' },
        airline: 'LATAM',
        flightNumber: 'LA800',
        durationMinutes: 480,
        stops: 0,
      },
      inbound: {
        departure: { airport: 'MIA', time: '20:00' },
        arrival: { airport: 'SCL', time: '06:00' },
        airline: 'LATAM',
        flightNumber: 'LA801',
        durationMinutes: 600,
        stops: 1,
      },
      totalPrice: 850,
      currency: 'USD',
      pricePer: 'person',
      passengers: 2,
      carryOnIncluded: true,
      bookingUrl: 'https://kiwi.com/booking/123',
      scrapedAt: new Date('2025-06-01T00:00:00Z'),
      proxyRegion: 'CL',
    };
    expect(result.searchId).toBe('search-1');
    expect(result.stopover).toBeUndefined();
    expect(result.carryOnIncluded).toBe(true);
  });

  it('FlightResult can be constructed with optional stopover', () => {
    const result: FlightResult = {
      searchId: 'search-2',
      source: 'skyscanner',
      outbound: {
        departure: { airport: 'SCL', time: '10:00' },
        arrival: { airport: 'BOG', time: '15:00' },
        airline: 'Avianca',
        flightNumber: 'AV100',
        durationMinutes: 300,
        stops: 0,
      },
      inbound: {
        departure: { airport: 'BOG', time: '16:00' },
        arrival: { airport: 'SCL', time: '21:00' },
        airline: 'Avianca',
        flightNumber: 'AV101',
        durationMinutes: 300,
        stops: 0,
      },
      stopover: {
        airport: 'BOG',
        arrivalTime: '2025-07-10T15:00:00Z',
        departureTime: '2025-07-12T16:00:00Z',
        durationDays: 2,
      },
      totalPrice: 1200,
      currency: 'USD',
      pricePer: 'total',
      passengers: 2,
      carryOnIncluded: false,
      bookingUrl: 'https://skyscanner.com/booking/456',
      scrapedAt: new Date('2025-06-01T00:00:00Z'),
      proxyRegion: 'AR',
    };
    expect(result.stopover?.airport).toBe('BOG');
    expect(result.pricePer).toBe('total');
  });
});

describe('Search types', () => {
  it('StopoverConfig holds airport and day range', () => {
    const s: StopoverConfig = { airport: 'BOG', minDays: 1, maxDays: 3 };
    expect(s.airport).toBe('BOG');
    expect(s.minDays).toBe(1);
    expect(s.maxDays).toBe(3);
  });

  it('TimeRange holds earliest and latest', () => {
    const t: TimeRange = { earliest: '06:00', latest: '22:00' };
    expect(t.earliest).toBe('06:00');
    expect(t.latest).toBe('22:00');
  });

  it('SearchFilters holds all filter fields', () => {
    const f: SearchFilters = {
      airlineBlacklist: ['Spirit'],
      airlinePreferred: ['LATAM'],
      airportPreferred: { SCL: ['MIA', 'JFK'] },
      airportBlacklist: {},
      maxUnplannedStops: 1,
      minConnectionTime: 60,
      maxConnectionTime: 240,
      requireCarryOn: true,
      maxTotalTravelTime: 1440,
    };
    expect(f.airlineBlacklist).toContain('Spirit');
    expect(f.requireCarryOn).toBe(true);
    expect(f.departureTimeRange).toBeUndefined();
    expect(f.requireCheckedBag).toBeUndefined();
  });

  it('SearchFilters accepts optional time ranges and checked bag', () => {
    const f: SearchFilters = {
      airlineBlacklist: [],
      airlinePreferred: [],
      airportPreferred: {},
      airportBlacklist: {},
      departureTimeRange: { earliest: '06:00', latest: '20:00' },
      arrivalTimeRange: { earliest: '08:00', latest: '23:59' },
      maxUnplannedStops: 0,
      minConnectionTime: 90,
      maxConnectionTime: 180,
      requireCarryOn: false,
      requireCheckedBag: true,
      maxTotalTravelTime: 720,
    };
    expect(f.departureTimeRange?.earliest).toBe('06:00');
    expect(f.requireCheckedBag).toBe(true);
  });

  it('SearchAlertConfig holds thresholds and price targets', () => {
    const a: SearchAlertConfig = {
      scoreThresholds: { info: 50, good: 70, urgent: 90 },
      maxPricePerPerson: 1000,
      currency: 'USD',
    };
    expect(a.scoreThresholds.urgent).toBe(90);
    expect(a.targetPricePerPerson).toBeUndefined();
    expect(a.dreamPricePerPerson).toBeUndefined();
  });

  it('SearchConfig can be constructed with all fields', () => {
    const c: SearchConfig = {
      id: 'cfg-1',
      name: 'SCL to MIA',
      origin: 'SCL',
      destination: 'MIA',
      departureFrom: new Date('2025-07-01'),
      departureTo: new Date('2025-07-31'),
      returnMinDays: 7,
      returnMaxDays: 14,
      passengers: 2,
      filters: {
        airlineBlacklist: [],
        airlinePreferred: [],
        airportPreferred: {},
        airportBlacklist: {},
        maxUnplannedStops: 1,
        minConnectionTime: 60,
        maxConnectionTime: 300,
        requireCarryOn: true,
        maxTotalTravelTime: 1440,
      },
      alertConfig: {
        scoreThresholds: { info: 50, good: 70, urgent: 85 },
        maxPricePerPerson: 900,
        currency: 'USD',
      },
      proxyRegions: ['CL', 'AR'],
      scanIntervalMin: 30,
      active: true,
    };
    expect(c.id).toBe('cfg-1');
    expect(c.stopover).toBeUndefined();
    expect(c.active).toBe(true);
  });
});

describe('Proxy types', () => {
  it('ProxyType union accepts all proxy types', () => {
    const types: ProxyType[] = ['wireguard', 'socks5', 'http', 'ssh-tunnel'];
    expect(types).toHaveLength(4);
  });

  it('ProxyAuth holds credentials', () => {
    const auth: ProxyAuth = { user: 'admin', password: 'secret' };
    expect(auth.user).toBe('admin');
    expect(auth.password).toBe('secret');
  });

  it('ProxyConfig holds connection details', () => {
    const p: ProxyConfig = {
      id: 'proxy-1',
      type: 'wireguard',
      label: 'Chile VPN',
      region: 'CL',
      host: '1.2.3.4',
      port: 51820,
      active: true,
    };
    expect(p.id).toBe('proxy-1');
    expect(p.auth).toBeUndefined();
    expect(p.sshKey).toBeUndefined();
  });

  it('ProxyConfig accepts optional auth and sshKey', () => {
    const p: ProxyConfig = {
      id: 'proxy-2',
      type: 'socks5',
      label: 'Argentina Proxy',
      region: 'AR',
      host: '5.6.7.8',
      port: 1080,
      auth: { user: 'u', password: 'p' },
      sshKey: '/path/to/key',
      active: false,
    };
    expect(p.auth?.user).toBe('u');
    expect(p.sshKey).toBe('/path/to/key');
  });
});

describe('Alert types', () => {
  it('AlertLevel union accepts info, good, urgent', () => {
    const levels: AlertLevel[] = ['info', 'good', 'urgent'];
    expect(levels).toHaveLength(3);
  });

  it('NotificationChannel union accepts all channels', () => {
    const channels: NotificationChannel[] = ['email', 'telegram', 'websocket'];
    expect(channels).toHaveLength(3);
  });

  it('Alert can be constructed', () => {
    const a: Alert = {
      searchId: 'search-1',
      flightResultId: 'result-1',
      level: 'good',
      channelsSent: ['email', 'telegram'],
      sentAt: new Date('2025-06-01T12:00:00Z'),
    };
    expect(a.level).toBe('good');
    expect(a.channelsSent).toHaveLength(2);
  });

  it('ScoreBreakdown holds all score components', () => {
    const sb: ScoreBreakdown = {
      price: 80,
      schedule: 70,
      stopover: 90,
      airline: 60,
      flexibility: 75,
    };
    expect(sb.price).toBe(80);
    expect(sb.flexibility).toBe(75);
  });
});
