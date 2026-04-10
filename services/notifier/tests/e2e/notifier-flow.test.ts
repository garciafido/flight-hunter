import { describe, it, expect, vi } from 'vitest';
import { NotifierWorker } from '../../src/worker.js';
import { createThrottle } from '../../src/throttle.js';

describe('Notifier E2E Flow', () => {
  it('sends urgent alert through all channels', async () => {
    const telegramMessages: string[] = [];
    const emailMessages: Array<{ subject: string; html: string }> = [];
    const wsMessages: any[] = [];

    const mockTelegram = {
      send: vi.fn().mockImplementation(async (msg: string) => {
        telegramMessages.push(msg);
      }),
    };
    const mockEmail = {
      send: vi.fn().mockImplementation(async (subject: string, html: string) => {
        emailMessages.push({ subject, html });
      }),
    };
    const mockWsBroadcaster = {
      broadcast: vi.fn().mockImplementation((data: any) => {
        wsMessages.push(data);
      }),
    };
    const throttle = createThrottle({ cooldownMs: 2 * 60 * 60 * 1000 });

    const mockPrisma = {
      search: {
        findUnique: vi.fn().mockResolvedValue({ id: 'search-1', name: 'BUE -> CUZ Julio' }),
      },
      alert: {
        create: vi.fn().mockResolvedValue({ id: 'alert-1' }),
      },
    };

    const worker = new NotifierWorker({
      telegram: mockTelegram as any,
      email: mockEmail as any,
      wsBroadcaster: mockWsBroadcaster as any,
      throttle,
      prisma: mockPrisma as any,
    });

    await worker.process({
      searchId: 'search-1',
      flightResultId: 'result-1',
      level: 'urgent',
      score: 92,
      scoreBreakdown: { price: 38, schedule: 18, stopover: 20, airline: 9, flexibility: 7 },
      flightSummary: {
        price: 285,
        currency: 'USD',
        airline: 'LATAM',
        departureAirport: 'AEP',
        departureTime: '2026-07-24T08:00:00Z',
        arrivalAirport: 'AEP',
        arrivalTime: '2026-08-08T10:00:00Z',
        stopoverAirport: 'LIM',
        stopoverDurationDays: 3,
        bookingUrl: 'https://kiwi.com/booking/abc',
      },
    });

    // All 3 channels should fire for urgent
    expect(telegramMessages.length).toBe(1);
    // Telegram formatter produces "OFERTA URGENTE" which contains "URGENTE"
    expect(telegramMessages[0]).toContain('URGENTE');
    expect(telegramMessages[0]).toContain('285');

    expect(emailMessages.length).toBe(1);
    expect(emailMessages[0].subject).toContain('URGENTE');
    expect(emailMessages[0].html).toContain('LATAM');

    expect(wsMessages.length).toBe(1);
    expect(wsMessages[0].type).toBe('alert');

    // Should save alert to DB
    expect(mockPrisma.alert.create).toHaveBeenCalledOnce();
  });

  it('throttles non-urgent alerts', async () => {
    const mockTelegram = { send: vi.fn() };
    const mockEmail = { send: vi.fn() };
    const mockWsBroadcaster = { broadcast: vi.fn() };
    const throttle = createThrottle({ cooldownMs: 2 * 60 * 60 * 1000 });

    const mockPrisma = {
      search: {
        findUnique: vi.fn().mockResolvedValue({ id: 'search-1', name: 'Test' }),
      },
      alert: {
        create: vi.fn().mockResolvedValue({ id: 'alert-1' }),
      },
    };

    const worker = new NotifierWorker({
      telegram: mockTelegram as any,
      email: mockEmail as any,
      wsBroadcaster: mockWsBroadcaster as any,
      throttle,
      prisma: mockPrisma as any,
    });

    const goodAlert = {
      searchId: 'search-1',
      flightResultId: 'result-1',
      level: 'good' as const,
      score: 78,
      scoreBreakdown: { price: 30, schedule: 15, stopover: 18, airline: 8, flexibility: 7 },
      flightSummary: {
        price: 340,
        currency: 'USD',
        airline: 'LATAM',
        departureAirport: 'AEP',
        departureTime: '2026-07-24T08:00:00Z',
        arrivalAirport: 'AEP',
        arrivalTime: '2026-08-08T10:00:00Z',
        bookingUrl: 'https://example.com',
      },
    };

    // First send should go through
    await worker.process(goodAlert);
    // 'good' level uses websocket + email channels
    expect(mockEmail.send).toHaveBeenCalledTimes(1);
    expect(mockWsBroadcaster.broadcast).toHaveBeenCalledTimes(1);

    // Second send with DIFFERENT flight fingerprint should be throttled on all channels
    // (cooldown not expired for same searchId — both email and websocket are throttled)
    const secondAlert = {
      ...goodAlert,
      flightResultId: 'result-2',
      flightSummary: {
        ...goodAlert.flightSummary,
        price: 345,
        departureTime: '2026-07-25T08:00:00Z',
      },
    };

    await worker.process(secondAlert);
    // Both email and websocket should be throttled (cooldown not expired for same searchId)
    expect(mockEmail.send).toHaveBeenCalledTimes(1); // still 1 — throttled
    expect(mockWsBroadcaster.broadcast).toHaveBeenCalledTimes(1); // still 1 — throttled
  });

  it('deduplicates identical flights', async () => {
    const mockTelegram = { send: vi.fn() };
    const mockEmail = { send: vi.fn() };
    const mockWsBroadcaster = { broadcast: vi.fn() };
    const throttle = createThrottle({ cooldownMs: 0 }); // no cooldown

    const mockPrisma = {
      search: {
        findUnique: vi.fn().mockResolvedValue({ id: 'search-1', name: 'Test' }),
      },
      alert: { create: vi.fn().mockResolvedValue({ id: 'alert-1' }) },
    };

    const worker = new NotifierWorker({
      telegram: mockTelegram as any,
      email: mockEmail as any,
      wsBroadcaster: mockWsBroadcaster as any,
      throttle,
      prisma: mockPrisma as any,
    });

    const urgentAlert = {
      searchId: 'search-1',
      flightResultId: 'result-1',
      level: 'urgent' as const,
      score: 92,
      scoreBreakdown: { price: 38, schedule: 18, stopover: 20, airline: 9, flexibility: 7 },
      flightSummary: {
        price: 285,
        currency: 'USD',
        airline: 'LATAM',
        departureAirport: 'AEP',
        departureTime: '2026-07-24T08:00:00Z',
        arrivalAirport: 'AEP',
        arrivalTime: '2026-08-08T10:00:00Z',
        bookingUrl: 'https://kiwi.com/booking/abc',
      },
    };

    // Send the same alert twice — second should be deduplicated
    await worker.process(urgentAlert);
    await worker.process({ ...urgentAlert, flightResultId: 'result-2' });

    // Only first send goes through — second is a flight duplicate
    expect(mockTelegram.send).toHaveBeenCalledTimes(1);
    expect(mockEmail.send).toHaveBeenCalledTimes(1);
    expect(mockWsBroadcaster.broadcast).toHaveBeenCalledTimes(1);
  });
});
