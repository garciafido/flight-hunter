import type { PrismaClient } from '@flight-hunter/shared';
import type { CircuitState } from './circuit-breaker.js';

export class SourceMetricsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Ensure a source row exists; return its id.
   */
  async ensureSource(
    name: string,
    hasApiKey: boolean,
  ): Promise<{ id: string; circuitState: CircuitState }> {
    const row = await (this.prisma as any).source.upsert({
      where: { name },
      create: {
        name,
        enabled: true,
        hasApiKey,
        circuitState: 'closed',
        consecutiveFailures: 0,
      },
      update: { hasApiKey },
    });

    return {
      id: row.id as string,
      circuitState: {
        status: row.circuitState as CircuitState['status'],
        consecutiveFailures: row.consecutiveFailures as number,
        openedAt: row.circuitOpenedAt ?? undefined,
      },
    };
  }

  /**
   * Persist a metric entry and update source state.
   */
  async recordMetric(opts: {
    sourceId: string;
    success: boolean;
    resultCount: number;
    durationMs: number;
    errorType?: string;
    newCircuitState: CircuitState;
  }): Promise<void> {
    const { sourceId, success, resultCount, durationMs, errorType, newCircuitState } = opts;

    await (this.prisma as any).sourceMetric.create({
      data: {
        sourceId,
        success,
        resultCount,
        durationMs,
        errorType: errorType ?? null,
      },
    });

    await (this.prisma as any).source.update({
      where: { id: sourceId },
      data: {
        circuitState: newCircuitState.status,
        circuitOpenedAt: newCircuitState.openedAt ?? null,
        consecutiveFailures: newCircuitState.consecutiveFailures,
        lastSuccessAt: success ? new Date() : undefined,
        lastFailureAt: !success ? new Date() : undefined,
      },
    });
  }
}
