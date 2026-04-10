import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ---- Price prediction logic (inline — dashboard cannot import from analyzer) ----

interface PricePrediction {
  currentMin: number;
  movingAvg7d: number;
  movingAvg30d: number;
  trendSlope: number;
  predicted7dMin: number;
  predicted14dMin: number;
  confidence: 'low' | 'medium' | 'high';
}

type BuyAction = 'buy-now' | 'wait' | 'monitor';

interface BuyRecommendation {
  action: BuyAction;
  reason: string;
  predictedSavings?: number;
}

function avgArr(xs: number[]): number {
  if (xs.length === 0) return 0;
  return roundTo(xs.reduce((a, b) => a + b, 0) / xs.length, 2);
}

function linearRegressionSlope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (ys[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

async function computePrediction(searchId: string): Promise<PricePrediction | null> {
  const history = await prisma.priceHistory.findMany({
    where: { searchId },
    orderBy: { date: 'desc' },
    take: 60,
  });

  if (history.length < 3) return null;

  const sorted = [...history].reverse();
  const minPrices = sorted.map((h) => Number(h.minPrice));
  const currentMin = minPrices[minPrices.length - 1];
  const movingAvg7d = avgArr(minPrices.slice(-7));
  const movingAvg30d = avgArr(minPrices.slice(-30));
  const trendSlope = linearRegressionSlope(minPrices.slice(-14));
  const predicted7dMin = Math.max(0, currentMin + trendSlope * 7);
  const predicted14dMin = Math.max(0, currentMin + trendSlope * 14);
  const confidence: PricePrediction['confidence'] =
    history.length >= 30 ? 'high' : history.length >= 14 ? 'medium' : 'low';

  return {
    currentMin,
    movingAvg7d,
    movingAvg30d,
    trendSlope: roundTo(trendSlope, 2),
    predicted7dMin: roundTo(predicted7dMin, 2),
    predicted14dMin: roundTo(predicted14dMin, 2),
    confidence,
  };
}

function buildRecommendation(
  pred: PricePrediction,
  alertConfig: { targetPricePerPerson?: number; dreamPricePerPerson?: number },
): BuyRecommendation {
  const { currentMin, predicted7dMin, trendSlope, movingAvg30d, confidence } = pred;

  if (alertConfig.dreamPricePerPerson && currentMin <= alertConfig.dreamPricePerPerson) {
    return { action: 'buy-now', reason: 'Precio actual igual o menor al precio dream' };
  }

  if (trendSlope < -1 && confidence === 'high') {
    const savings = Math.max(0, currentMin - predicted7dMin);
    return {
      action: 'wait',
      reason: `Tendencia bajista (${trendSlope.toFixed(2)}/día) con histórico sólido`,
      predictedSavings: roundTo(savings, 2),
    };
  }

  if (trendSlope > 2) {
    return { action: 'buy-now', reason: 'Tendencia alcista, los precios suben rápidamente' };
  }

  if (currentMin < movingAvg30d * 0.85) {
    return { action: 'buy-now', reason: 'Precio actual 15% por debajo del promedio mensual' };
  }

  if (currentMin > movingAvg30d * 1.15) {
    return { action: 'wait', reason: 'Precio actual 15% por encima del promedio mensual' };
  }

  return { action: 'monitor', reason: 'Precio estable cerca del promedio' };
}

// ---- Route handler ----

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const search = await prisma.search.findUnique({ where: { id } });
    if (!search) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const prediction = await computePrediction(id);

    if (!prediction) {
      return NextResponse.json({ prediction: null, recommendation: null });
    }

    const alertConfig = (search as any).alertConfig ?? {};
    const recommendation = buildRecommendation(prediction, {
      targetPricePerPerson: alertConfig.targetPricePerPerson,
      dreamPricePerPerson: alertConfig.dreamPricePerPerson,
    });

    return NextResponse.json({ prediction, recommendation });
  } catch (err) {
    console.error('GET /api/searches/[id]/prediction error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
