import type { PrismaClient } from '@flight-hunter/shared/db';

export interface OutlierResult {
  suspicious: boolean;
  suspicionReason?: string;
}

export class OutlierDetector {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Check if a price is an outlier compared to:
   * 1. Historical average (last 48h) for this search
   * 2. Recent prices from other sources (last 30 minutes)
   *
   * Suspicious results are flagged but NOT discarded.
   */
  async check(
    searchId: string,
    pricePerPerson: number,
    source: string,
    avg48h: number | null,
  ): Promise<OutlierResult> {
    // 1. Historical outlier: price < 30% of 48h average
    if (avg48h !== null && avg48h > 0) {
      if (pricePerPerson < avg48h * 0.3) {
        return {
          suspicious: true,
          suspicionReason: 'price too low vs historical avg',
        };
      }
    }

    // 2. Cross-source validation: last 30 minutes from other sources
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const recentRows = await this.prisma.flightResult.findMany({
      where: {
        searchId,
        source: { not: source },
        scrapedAt: { gte: cutoff },
        suspicious: false,
      },
      select: { pricePerPerson: true, source: true },
    });

    if (recentRows.length >= 2) {
      const sourcesSet = new Set(recentRows.map((r: any) => r.source as string));
      if (sourcesSet.size >= 2) {
        const prices = recentRows.map((r: any) => Number(r.pricePerPerson));
        prices.sort((a, b) => a - b);
        const mid = Math.floor(prices.length / 2);
        const median =
          prices.length % 2 === 0
            ? (prices[mid - 1] + prices[mid]) / 2
            : prices[mid];

        if (median > 0 && pricePerPerson < median * 0.5) {
          return {
            suspicious: true,
            suspicionReason: 'price too low vs other sources',
          };
        }
      }
    }

    return { suspicious: false };
  }
}
