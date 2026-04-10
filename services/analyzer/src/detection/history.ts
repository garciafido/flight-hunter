import type { PrismaClient } from '@flight-hunter/shared';
import type { PriceHistory } from '../scoring/price-score.js';

export class HistoryService {
  constructor(private readonly prisma: PrismaClient) {}

  async getPriceHistory(searchId: string): Promise<PriceHistory | null> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const result = await this.prisma.flightResult.aggregate({
      where: {
        searchId,
        scrapedAt: { gte: cutoff },
      },
      _avg: { pricePerPerson: true },
      _min: { pricePerPerson: true },
    });

    if (result._avg.pricePerPerson === null || result._min.pricePerPerson === null) {
      return null;
    }

    return {
      avg48h: Number(result._avg.pricePerPerson),
      minHistoric: Number(result._min.pricePerPerson),
    };
  }
}
