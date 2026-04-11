import type { PrismaClient } from '@flight-hunter/shared/db';

const CACHE_TTL_MS = 30 * 1000; // 30 seconds

interface CachedSettings {
  emailsPaused: boolean;
  webhookUrl: string | null;
  webhookEnabled: boolean;
  slackWebhookUrl: string | null;
  discordWebhookUrl: string | null;
  fetchedAt: number;
}

let cache: CachedSettings | null = null;

async function fetchSettings(prisma: PrismaClient): Promise<CachedSettings> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache;
  }

  try {
    const settings = await (prisma as any).systemSettings.findUnique({
      where: { id: 'singleton' },
    });
    cache = {
      emailsPaused: settings?.emailsPaused ?? false,
      webhookUrl: settings?.webhookUrl ?? null,
      webhookEnabled: settings?.webhookEnabled ?? false,
      slackWebhookUrl: settings?.slackWebhookUrl ?? null,
      discordWebhookUrl: settings?.discordWebhookUrl ?? null,
      fetchedAt: now,
    };
    return cache;
  } catch {
    // If DB is unreachable, fall back to cached value or defaults
    return cache ?? {
      emailsPaused: false,
      webhookUrl: null,
      webhookEnabled: false,
      slackWebhookUrl: null,
      discordWebhookUrl: null,
      fetchedAt: now,
    };
  }
}

export async function isEmailsPaused(prisma: PrismaClient): Promise<boolean> {
  const s = await fetchSettings(prisma);
  return s.emailsPaused;
}

export async function getWebhookConfig(prisma: PrismaClient): Promise<{ url: string | null; enabled: boolean }> {
  const s = await fetchSettings(prisma);
  return { url: s.webhookUrl, enabled: s.webhookEnabled };
}

export async function getSlackWebhookUrl(prisma: PrismaClient): Promise<string | null> {
  const s = await fetchSettings(prisma);
  return s.slackWebhookUrl;
}

export async function getDiscordWebhookUrl(prisma: PrismaClient): Promise<string | null> {
  const s = await fetchSettings(prisma);
  return s.discordWebhookUrl;
}

/** For testing: reset the cache. */
export function resetSettingsCache(): void {
  cache = null;
}

/** For testing: inject a cached value. */
export function injectSettingsCache(emailsPaused: boolean): void {
  cache = {
    emailsPaused,
    webhookUrl: null,
    webhookEnabled: false,
    slackWebhookUrl: null,
    discordWebhookUrl: null,
    fetchedAt: Date.now(),
  };
}

/** For testing: inject full settings. */
export function injectFullSettingsCache(settings: Partial<Omit<CachedSettings, 'fetchedAt'>>): void {
  cache = {
    emailsPaused: false,
    webhookUrl: null,
    webhookEnabled: false,
    slackWebhookUrl: null,
    discordWebhookUrl: null,
    ...settings,
    fetchedAt: Date.now(),
  };
}
