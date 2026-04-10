import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    systemSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: any, init?: any) => ({
      data,
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

// Dynamic import after mock setup
let GET: any, PUT: any;
import { prisma } from '@/lib/prisma';

beforeEach(async () => {
  vi.resetAllMocks();
  const mod = await import('../../../src/app/api/system/settings/route');
  GET = mod.GET;
  PUT = mod.PUT;
});

describe('GET /api/system/settings', () => {
  it('returns all settings when record exists', async () => {
    (prisma as any).systemSettings.findUnique.mockResolvedValue({
      id: 'singleton',
      emailsPaused: false,
      webhookUrl: 'https://example.com/hook',
      webhookEnabled: true,
      slackWebhookUrl: 'https://hooks.slack.com/test',
      discordWebhookUrl: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.emailsPaused).toBe(false);
    expect(data.webhookUrl).toBe('https://example.com/hook');
    expect(data.webhookEnabled).toBe(true);
    expect(data.slackWebhookUrl).toBe('https://hooks.slack.com/test');
    expect(data.discordWebhookUrl).toBeNull();
  });

  it('returns defaults when no record', async () => {
    (prisma as any).systemSettings.findUnique.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.emailsPaused).toBe(false);
    expect(data.webhookUrl).toBeNull();
    expect(data.webhookEnabled).toBe(false);
    expect(data.slackWebhookUrl).toBeNull();
    expect(data.discordWebhookUrl).toBeNull();
  });
});

describe('PUT /api/system/settings', () => {
  beforeEach(() => {
    (prisma as any).systemSettings.upsert.mockResolvedValue({
      id: 'singleton',
      emailsPaused: false,
      webhookUrl: null,
      webhookEnabled: false,
      slackWebhookUrl: null,
      discordWebhookUrl: null,
    });
  });

  it('updates emailsPaused', async () => {
    const req = { json: async () => ({ emailsPaused: true }) } as any;
    await PUT(req);
    expect((prisma as any).systemSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ emailsPaused: true }),
      }),
    );
  });

  it('updates webhookUrl and webhookEnabled', async () => {
    const req = {
      json: async () => ({ webhookUrl: 'https://example.com/hook', webhookEnabled: true }),
    } as any;
    await PUT(req);
    expect((prisma as any).systemSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          webhookUrl: 'https://example.com/hook',
          webhookEnabled: true,
        }),
      }),
    );
  });

  it('updates slackWebhookUrl', async () => {
    const req = { json: async () => ({ slackWebhookUrl: 'https://hooks.slack.com/services/test' }) } as any;
    await PUT(req);
    expect((prisma as any).systemSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ slackWebhookUrl: 'https://hooks.slack.com/services/test' }),
      }),
    );
  });

  it('updates discordWebhookUrl', async () => {
    const req = { json: async () => ({ discordWebhookUrl: 'https://discord.com/api/webhooks/123/abc' }) } as any;
    await PUT(req);
    expect((prisma as any).systemSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ discordWebhookUrl: 'https://discord.com/api/webhooks/123/abc' }),
      }),
    );
  });

  it('sets field to null when explicit null passed', async () => {
    const req = { json: async () => ({ webhookUrl: null }) } as any;
    await PUT(req);
    expect((prisma as any).systemSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ webhookUrl: null }),
      }),
    );
  });
});
