import type { PrismaClient } from '@flight-hunter/shared';

const CACHE_TTL_MS = 30 * 1000; // 30 seconds

interface CachedSettings {
  emailsPaused: boolean;
  fetchedAt: number;
}

let cache: CachedSettings | null = null;

export async function isEmailsPaused(prisma: PrismaClient): Promise<boolean> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.emailsPaused;
  }

  try {
    const settings = await (prisma as any).systemSettings.findUnique({
      where: { id: 'singleton' },
    });
    const emailsPaused = settings?.emailsPaused ?? false;
    cache = { emailsPaused, fetchedAt: now };
    return emailsPaused;
  } catch {
    // If DB is unreachable, fall back to cached value or false
    return cache?.emailsPaused ?? false;
  }
}

/** For testing: reset the cache. */
export function resetSettingsCache(): void {
  cache = null;
}

/** For testing: inject a cached value. */
export function injectSettingsCache(emailsPaused: boolean): void {
  cache = { emailsPaused, fetchedAt: Date.now() };
}
