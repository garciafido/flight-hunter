import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotifierWorker } from '../../src/worker.js';
import { injectSettingsCache, resetSettingsCache } from '../../src/settings-cache.js';
import type { AlertJob } from '@flight-hunter/shared';

const baseAlert: AlertJob = {
  searchId: 'search-uuid-1',
  flightResultId: 'result-uuid-1',
  level: 'good',
  score: 75,
  scoreBreakdown: { price: 80, schedule: 70, stopover: 75, airline: 65, flexibility: 50 },
  flightSummary: {
    price: 350,
    currency: 'USD',
    airline: 'LATAM',
    departureAirport: 'SCL',
    arrivalAirport: 'MAD',
    departureTime: '2026-06-01T10:00:00.000Z',
    arrivalTime: '2026-06-20T10:00:00.000Z',
    bookingUrl: 'https://booking.example.com/test',
  },
};

function makeDeps(overrides: Partial<ReturnType<typeof makeDefaultDeps>> = {}) {
  return { ...makeDefaultDeps(), ...overrides };
}

function makeDefaultDeps() {
  return {
    telegram: { send: vi.fn().mockResolvedValue(undefined) },
    email: { send: vi.fn().mockResolvedValue(undefined) },
    wsBroadcaster: { broadcast: vi.fn(), addClient: vi.fn(), removeClient: vi.fn() },
    throttle: {
      shouldSend: vi.fn().mockReturnValue(true),
      record: vi.fn(),
      recordFlight: vi.fn(),
      isFlightDuplicate: vi.fn().mockReturnValue(false),
    },
    prisma: {
      search: { findUnique: vi.fn().mockResolvedValue({ id: 'search-uuid-1', name: 'Test Search' }) },
      alert: {
        create: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
    // Disable new optional channels by default (null = explicitly disabled)
    webhook: null,
    slack: null,
    discord: null,
  };
}

describe('NotifierWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSettingsCache();
  });

  it('skips processing if flight is a duplicate', async () => {
    const deps = makeDeps({
      throttle: {
        ...makeDefaultDeps().throttle,
        isFlightDuplicate: vi.fn().mockReturnValue(true),
      },
    });
    const worker = new NotifierWorker(deps as never);
    await worker.process(baseAlert);

    expect(deps.prisma.search.findUnique).not.toHaveBeenCalled();
    expect(deps.prisma.alert.create).not.toHaveBeenCalled();
  });

  it('skips processing if search is not found', async () => {
    const deps = makeDeps({
      prisma: {
        search: { findUnique: vi.fn().mockResolvedValue(null) },
        alert: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
      },
    });
    const worker = new NotifierWorker(deps as never);
    await worker.process(baseAlert);

    expect(deps.prisma.alert.create).not.toHaveBeenCalled();
    expect(deps.wsBroadcaster.broadcast).not.toHaveBeenCalled();
  });

  it('sends via websocket for good level', async () => {
    const deps = makeDeps();
    const worker = new NotifierWorker(deps as never);
    await worker.process(baseAlert);

    expect(deps.wsBroadcaster.broadcast).toHaveBeenCalled();
  });

  it('sends via email for good level', async () => {
    const deps = makeDeps();
    const worker = new NotifierWorker(deps as never);
    await worker.process(baseAlert);

    expect(deps.email.send).toHaveBeenCalled();
  });

  it('does not send telegram for good level', async () => {
    const deps = makeDeps();
    const worker = new NotifierWorker(deps as never);
    await worker.process(baseAlert);

    expect(deps.telegram.send).not.toHaveBeenCalled();
  });

  it('sends via all channels for urgent level', async () => {
    const deps = makeDeps();
    const alert: AlertJob = { ...baseAlert, level: 'urgent' };
    const worker = new NotifierWorker(deps as never);
    await worker.process(alert);

    expect(deps.wsBroadcaster.broadcast).toHaveBeenCalled();
    expect(deps.email.send).toHaveBeenCalled();
    expect(deps.telegram.send).toHaveBeenCalled();
  });

  it('sends only via websocket for info level', async () => {
    const deps = makeDeps();
    const alert: AlertJob = { ...baseAlert, level: 'info' };
    const worker = new NotifierWorker(deps as never);
    await worker.process(alert);

    expect(deps.wsBroadcaster.broadcast).toHaveBeenCalled();
    expect(deps.email.send).not.toHaveBeenCalled();
    expect(deps.telegram.send).not.toHaveBeenCalled();
  });

  it('skips channel when throttle returns false', async () => {
    const deps = makeDeps({
      throttle: {
        ...makeDefaultDeps().throttle,
        shouldSend: vi.fn().mockReturnValue(false),
      },
    });
    const worker = new NotifierWorker(deps as never);
    await worker.process(baseAlert);

    expect(deps.email.send).not.toHaveBeenCalled();
    expect(deps.wsBroadcaster.broadcast).not.toHaveBeenCalled();
  });

  it('records throttle for each sent channel', async () => {
    const deps = makeDeps();
    const worker = new NotifierWorker(deps as never);
    await worker.process(baseAlert);

    // good level: websocket + email
    expect(deps.throttle.record).toHaveBeenCalledWith('search-uuid-1', 'websocket');
    expect(deps.throttle.record).toHaveBeenCalledWith('search-uuid-1', 'email');
  });

  it('records flight fingerprint after processing', async () => {
    const deps = makeDeps();
    const worker = new NotifierWorker(deps as never);
    await worker.process(baseAlert);

    expect(deps.throttle.recordFlight).toHaveBeenCalledOnce();
  });

  it('saves alert to database with correct data', async () => {
    const deps = makeDeps();
    const worker = new NotifierWorker(deps as never);
    await worker.process(baseAlert);

    expect(deps.prisma.alert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        searchId: 'search-uuid-1',
        flightResultId: 'result-uuid-1',
        level: 'good',
        channelsSent: expect.arrayContaining(['websocket', 'email']),
        sentAt: expect.any(Date),
      }),
    });
  });

  it('saves alert with only channels that passed throttle', async () => {
    const deps = makeDeps({
      throttle: {
        ...makeDefaultDeps().throttle,
        shouldSend: vi.fn()
          .mockReturnValueOnce(true)  // websocket passes
          .mockReturnValueOnce(false), // email blocked
      },
    });
    const worker = new NotifierWorker(deps as never);
    await worker.process(baseAlert);

    expect(deps.prisma.alert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channelsSent: ['websocket'],
      }),
    });
  });

  it('records fingerprint even when all channels are throttled', async () => {
    const deps = makeDeps({
      throttle: {
        ...makeDefaultDeps().throttle,
        shouldSend: vi.fn().mockReturnValue(false),
      },
    });
    const worker = new NotifierWorker(deps as never);
    await worker.process(baseAlert);

    expect(deps.throttle.recordFlight).toHaveBeenCalledOnce();
    expect(deps.prisma.alert.create).toHaveBeenCalled();
  });

  it('skips email channel when emailsPaused is true', async () => {
    injectSettingsCache(true);
    const deps = makeDeps();
    const worker = new NotifierWorker(deps as never);
    await worker.process({ ...baseAlert, level: 'urgent' });

    // Email should NOT be sent when paused
    expect(deps.email.send).not.toHaveBeenCalled();
    // But other channels (telegram, websocket) should still work
    expect(deps.telegram.send).toHaveBeenCalled();
  });

  it('sends email when emailsPaused is false', async () => {
    injectSettingsCache(false);
    const deps = makeDeps();
    const worker = new NotifierWorker(deps as never);
    await worker.process({ ...baseAlert, level: 'urgent' });

    // Email should be sent when not paused
    expect(deps.email.send).toHaveBeenCalled();
  });

  it('sends to webhook channel when provided', async () => {
    const webhookSend = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ webhook: { send: webhookSend } });
    const worker = new NotifierWorker(deps as never);
    await worker.process(baseAlert);

    expect(webhookSend).toHaveBeenCalledOnce();
    const payload = webhookSend.mock.calls[0][0] as any;
    expect(payload.alert.searchId).toBe('search-uuid-1');
    expect(payload.flightSummary).toBeDefined();
    expect(payload.searchName).toBe('Test Search');
  });

  it('skips webhook channel when null', async () => {
    const webhookSend = vi.fn();
    const deps = makeDeps({ webhook: null });
    const worker = new NotifierWorker(deps as never);
    await worker.process(baseAlert);

    expect(webhookSend).not.toHaveBeenCalled();
  });

  it('records webhook in channelsSent when sent', async () => {
    const deps = makeDeps({ webhook: { send: vi.fn().mockResolvedValue(undefined) } });
    const worker = new NotifierWorker(deps as never);
    await worker.process(baseAlert);

    expect(deps.prisma.alert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channelsSent: expect.arrayContaining(['webhook']),
      }),
    });
  });

  it('sends slack and discord for urgent level when configured', async () => {
    const slackSend = vi.fn().mockResolvedValue(undefined);
    const discordSend = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      slack: { send: slackSend },
      discord: { send: discordSend },
    });
    const worker = new NotifierWorker(deps as never);
    await worker.process({ ...baseAlert, level: 'urgent' });

    expect(slackSend).toHaveBeenCalledOnce();
    expect(discordSend).toHaveBeenCalledOnce();
  });

  it('does not send slack/discord for good level', async () => {
    const slackSend = vi.fn().mockResolvedValue(undefined);
    const discordSend = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      slack: { send: slackSend },
      discord: { send: discordSend },
    });
    const worker = new NotifierWorker(deps as never);
    await worker.process({ ...baseAlert, level: 'good' });

    expect(slackSend).not.toHaveBeenCalled();
    expect(discordSend).not.toHaveBeenCalled();
  });

  it('continues processing when webhook channel throws', async () => {
    const deps = makeDeps({
      webhook: { send: vi.fn().mockRejectedValue(new Error('Network error')) },
    });
    const worker = new NotifierWorker(deps as never);
    // Should not throw
    await expect(worker.process(baseAlert)).resolves.toBeUndefined();
    // Alert should still be saved
    expect(deps.prisma.alert.create).toHaveBeenCalled();
  });

  it('continues processing when slack channel throws', async () => {
    const deps = makeDeps({
      slack: { send: vi.fn().mockRejectedValue(new Error('Slack error')) },
      discord: null,
    });
    const worker = new NotifierWorker(deps as never);
    await expect(worker.process({ ...baseAlert, level: 'urgent' })).resolves.toBeUndefined();
    expect(deps.prisma.alert.create).toHaveBeenCalled();
  });
});
