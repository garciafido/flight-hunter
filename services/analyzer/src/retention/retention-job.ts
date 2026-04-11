import type { PrismaClient } from '@flight-hunter/shared/db';

export interface RetentionResult {
  deletedFlightResults: number;
  deletedSourceMetrics: number;
}

export class RetentionJob {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly retainDays: number = 90,
  ) {}

  async run(): Promise<RetentionResult> {
    const cutoff = new Date(Date.now() - this.retainDays * 24 * 60 * 60 * 1000);

    const flightResults = await this.prisma.flightResult.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    // Source metrics: 30 days max
    const metricsCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const metrics = await (this.prisma as any).sourceMetric.deleteMany({
      where: { timestamp: { lt: metricsCutoff } },
    });

    return {
      deletedFlightResults: flightResults.count,
      deletedSourceMetrics: metrics.count,
    };
  }
}
