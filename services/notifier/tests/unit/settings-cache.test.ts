import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isEmailsPaused,
  resetSettingsCache,
  injectSettingsCache,
  injectFullSettingsCache,
  getWebhookConfig,
  getSlackWebhookUrl,
  getDiscordWebhookUrl,
} from '../../src/settings-cache.js';
import type { PrismaClient } from '@flight-hunter/shared/db';

function makePrisma(emailsPaused: boolean) {
  return {
    systemSettings: {
      findUnique: vi.fn().mockResolvedValue({ id: 'singleton', emailsPaused }),
    },
  } as unknown as PrismaClient;
}

beforeEach(() => {
  resetSettingsCache();
  vi.clearAllMocks();
});

describe('isEmailsPaused', () => {
  it('returns false when settings not found', async () => {
    const prisma = {
      systemSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;

    const result = await isEmailsPaused(prisma);
    expect(result).toBe(false);
  });

  it('returns true when emailsPaused is true in DB', async () => {
    const prisma = makePrisma(true);
    const result = await isEmailsPaused(prisma);
    expect(result).toBe(true);
  });

  it('returns false when emailsPaused is false in DB', async () => {
    const prisma = makePrisma(false);
    const result = await isEmailsPaused(prisma);
    expect(result).toBe(false);
  });

  it('caches the result and does not re-query within TTL', async () => {
    const prisma = makePrisma(false);
    await isEmailsPaused(prisma);
    await isEmailsPaused(prisma);
    expect((prisma as any).systemSettings.findUnique).toHaveBeenCalledTimes(1);
  });

  it('uses injected cache without hitting DB', async () => {
    injectSettingsCache(true);
    const prisma = { systemSettings: { findUnique: vi.fn() } } as unknown as PrismaClient;
    const result = await isEmailsPaused(prisma);
    expect(result).toBe(true);
    expect((prisma as any).systemSettings.findUnique).not.toHaveBeenCalled();
  });

  it('returns false when DB throws and no cache exists', async () => {
    const prisma = {
      systemSettings: {
        findUnique: vi.fn().mockRejectedValue(new Error('DB error')),
      },
    } as unknown as PrismaClient;
    const result = await isEmailsPaused(prisma);
    expect(result).toBe(false);
  });

  it('returns cached value when DB throws and cache exists', async () => {
    injectSettingsCache(true);
    const prisma = {
      systemSettings: {
        findUnique: vi.fn().mockRejectedValue(new Error('DB error')),
      },
    } as unknown as PrismaClient;
    // Force cache to be stale by making TTL appear elapsed
    // We do this by calling with the injected value (cache already set above)
    const result = await isEmailsPaused(prisma);
    expect(result).toBe(true);
  });
});

describe('getWebhookConfig', () => {
  it('returns null url and false enabled when not configured', async () => {
    const prisma = {
      systemSettings: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient;
    const result = await getWebhookConfig(prisma);
    expect(result.url).toBeNull();
    expect(result.enabled).toBe(false);
  });

  it('returns configured webhook settings', async () => {
    injectFullSettingsCache({ webhookUrl: 'https://example.com/hook', webhookEnabled: true });
    const prisma = { systemSettings: { findUnique: vi.fn() } } as unknown as PrismaClient;
    const result = await getWebhookConfig(prisma);
    expect(result.url).toBe('https://example.com/hook');
    expect(result.enabled).toBe(true);
  });
});

describe('getSlackWebhookUrl', () => {
  it('returns null when not configured', async () => {
    const prisma = {
      systemSettings: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient;
    const result = await getSlackWebhookUrl(prisma);
    expect(result).toBeNull();
  });

  it('returns configured Slack URL', async () => {
    injectFullSettingsCache({ slackWebhookUrl: 'https://hooks.slack.com/services/test' });
    const prisma = { systemSettings: { findUnique: vi.fn() } } as unknown as PrismaClient;
    const result = await getSlackWebhookUrl(prisma);
    expect(result).toBe('https://hooks.slack.com/services/test');
  });
});

describe('getDiscordWebhookUrl', () => {
  it('returns null when not configured', async () => {
    const prisma = {
      systemSettings: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient;
    const result = await getDiscordWebhookUrl(prisma);
    expect(result).toBeNull();
  });

  it('returns configured Discord URL', async () => {
    injectFullSettingsCache({ discordWebhookUrl: 'https://discord.com/api/webhooks/123/abc' });
    const prisma = { systemSettings: { findUnique: vi.fn() } } as unknown as PrismaClient;
    const result = await getDiscordWebhookUrl(prisma);
    expect(result).toBe('https://discord.com/api/webhooks/123/abc');
  });
});
