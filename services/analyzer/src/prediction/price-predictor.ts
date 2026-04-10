import type { PrismaClient } from '@flight-hunter/shared';

export interface PricePrediction {
  currentMin: number;
  movingAvg7d: number;
  movingAvg30d: number;
  trendSlope: number;        // price change per day (positive = rising)
  predicted7dMin: number;
  predicted14dMin: number;
  confidence: 'low' | 'medium' | 'high'; // based on sample size
}

export class PricePredictor {
  constructor(private readonly prisma: PrismaClient) {}

  async predict(searchId: string): Promise<PricePrediction | null> {
    // Pull last 60 days of price_history
    const history = await this.prisma.priceHistory.findMany({
      where: { searchId },
      orderBy: { date: 'desc' },
      take: 60,
    });

    if (history.length < 3) return null;

    const sorted = [...history].reverse(); // ascending by date
    const minPrices = sorted.map((h) => Number(h.minPrice));

    const currentMin = minPrices[minPrices.length - 1];
    const last7 = minPrices.slice(-7);
    const last30 = minPrices.slice(-30);
    const movingAvg7d = avg(last7);
    const movingAvg30d = avg(last30);

    // Linear regression on the last 14 days
    const window = minPrices.slice(-14);
    const trendSlope = linearRegressionSlope(window);

    const predicted7dMin = Math.max(0, currentMin + trendSlope * 7);
    const predicted14dMin = Math.max(0, currentMin + trendSlope * 14);

    const confidence: PricePrediction['confidence'] =
      history.length >= 30 ? 'high' : history.length >= 14 ? 'medium' : 'low';

    return {
      currentMin,
      movingAvg7d,
      movingAvg30d,
      trendSlope: round(trendSlope, 2),
      predicted7dMin: round(predicted7dMin, 2),
      predicted14dMin: round(predicted14dMin, 2),
      confidence,
    };
  }
}

function avg(xs: number[]): number {
  return round(xs.reduce((a, b) => a + b, 0) / xs.length, 2);
}

function linearRegressionSlope(ys: number[]): number {
  const n = ys.length;
  const xMean = (n - 1) / 2;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (ys[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return num / den;
}

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
