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
    // 1. Historical outlier: disabled for now.
    // The avg48h is computed across ALL routes in the search (BUE→CUZ, CUZ→LIM, etc.)
    // so a legitimately cheap short-haul (CUZ→LIM $28) gets flagged when compared
    // against the average that includes expensive long-hauls (BUE→CUZ $150).
    // TODO: re-enable when avg48h is computed per-route, not per-search.

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
