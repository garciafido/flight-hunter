import type { PricePrediction } from './price-predictor.js';

export type BuyAction = 'buy-now' | 'wait' | 'monitor';

export interface BuyRecommendation {
  action: BuyAction;
  reason: string;
  predictedSavings?: number; // expected USD savings if waiting
}

export function buildRecommendation(
  pred: PricePrediction,
  alertConfig: { targetPricePerPerson?: number; dreamPricePerPerson?: number },
): BuyRecommendation {
  const { currentMin, predicted7dMin, trendSlope, movingAvg30d, confidence } = pred;

  // Already at or below dream price → buy now
  if (alertConfig.dreamPricePerPerson && currentMin <= alertConfig.dreamPricePerPerson) {
    return { action: 'buy-now', reason: 'Precio actual igual o menor al precio dream' };
  }

  // Strong downward trend with high confidence → wait
  if (trendSlope < -1 && confidence === 'high') {
    const savings = Math.max(0, currentMin - predicted7dMin);
    return {
      action: 'wait',
      reason: `Tendencia bajista (${trendSlope.toFixed(2)}/día) con histórico sólido`,
      predictedSavings: round(savings, 2),
    };
  }

  // Strong upward trend → buy now
  if (trendSlope > 2) {
    return { action: 'buy-now', reason: 'Tendencia alcista, los precios suben rápidamente' };
  }

  // Current is significantly below 30-day avg → buy now
  if (currentMin < movingAvg30d * 0.85) {
    return { action: 'buy-now', reason: 'Precio actual 15% por debajo del promedio mensual' };
  }

  // Current is above 30-day avg → wait
  if (currentMin > movingAvg30d * 1.15) {
    return { action: 'wait', reason: 'Precio actual 15% por encima del promedio mensual' };
  }

  return { action: 'monitor', reason: 'Precio estable cerca del promedio' };
}

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
