import type { PrismaClient } from '@flight-hunter/shared';

/**
 * Upserts a daily price_history aggregate for (searchId, today).
 * Called asynchronously after each flight result is saved — does not block.
 */
export class PriceAggregator {
  constructor(private readonly prisma: PrismaClient) {}

  async aggregate(searchId: string, date: Date): Promise<void> {
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const nextDay = new Date(dateOnly.getTime() + 24 * 60 * 60 * 1000);

    const agg = await this.prisma.flightResult.aggregate({
      where: {
        searchId,
        scrapedAt: { gte: dateOnly, lt: nextDay },
        suspicious: false,
      },
      _min: { pricePerPerson: true, score: true },
      _max: { pricePerPerson: true },
      _avg: { pricePerPerson: true },
      _count: { id: true },
    });

    if (
      agg._min.pricePerPerson === null ||
      agg._max.pricePerPerson === null ||
      agg._avg.pricePerPerson === null
    ) {
      return; // No data for this day yet
    }

    const existing = await (this.prisma.priceHistory.findFirst as any)({
      where: { searchId, date: dateOnly },
    });

    const data = {
      searchId,
      date: dateOnly,
      minPrice: agg._min.pricePerPerson,
      maxPrice: agg._max.pricePerPerson,
      avgPrice: agg._avg.pricePerPerson,
      bestScore: agg._min.score ?? 0,
      sampleCount: agg._count.id,
    };

    if (existing) {
      await (this.prisma.priceHistory.update as any)({
        where: { id: existing.id },
        data,
      });
    } else {
      await (this.prisma.priceHistory.create as any)({ data });
    }
  }
}
