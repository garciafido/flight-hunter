import type { PrismaClient } from '@flight-hunter/shared/db';

interface SourceDef {
  name: string;
  hasApiKey: boolean;
}

/**
 * At first boot, if the sources table is empty, populate it with known sources.
 * Checks environment variables to determine which sources have API keys.
 */
export async function seedSources(prisma: PrismaClient): Promise<void> {
  try {
    const existingCount = await (prisma as any).source.count();
    if (existingCount > 0) return; // already seeded

    const sources: SourceDef[] = [
      {
        name: 'google-flights',
        hasApiKey: false,
      },
    ];

    for (const src of sources) {
      await (prisma as any).source.upsert({
        where: { name: src.name },
        create: {
          name: src.name,
          enabled: true,
          hasApiKey: src.hasApiKey,
          circuitState: 'closed',
          consecutiveFailures: 0,
        },
        update: { hasApiKey: src.hasApiKey },
      });
    }

    console.log(`Seeded ${sources.length} sources`);
  } catch (err) {
    console.error('Failed to seed sources:', err instanceof Error ? err.message : err);
  }
}
