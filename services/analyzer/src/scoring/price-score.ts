export interface PriceConfig {
  maxPricePerPerson: number;
  targetPricePerPerson?: number;
  dreamPricePerPerson?: number;
}

export interface PriceHistory {
  avg48h: number;
  minHistoric: number;
}

function lerp(value: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number {
  const t = (value - fromMin) / (fromMax - fromMin);
  return toMin + t * (toMax - toMin);
}

export function computePriceScore(
  pricePerPerson: number,
  config: PriceConfig,
  history?: PriceHistory,
): number {
  const { maxPricePerPerson, targetPricePerPerson, dreamPricePerPerson } = config;

  if (pricePerPerson >= maxPricePerPerson) {
    return 0;
  }

  let baseScore: number;

  if (dreamPricePerPerson !== undefined && targetPricePerPerson !== undefined) {
    if (pricePerPerson <= dreamPricePerPerson) {
      baseScore = 100;
    } else if (pricePerPerson <= targetPricePerPerson) {
      // dream → target maps to 100 → 75
      baseScore = lerp(pricePerPerson, dreamPricePerPerson, targetPricePerPerson, 100, 75);
    } else {
      // target → max maps to 75 → 0
      baseScore = lerp(pricePerPerson, targetPricePerPerson, maxPricePerPerson, 75, 0);
    }
  } else if (targetPricePerPerson !== undefined) {
    if (pricePerPerson <= targetPricePerPerson) {
      // 0 → target maps to 75 → 75 (flat at 75? No: linear from 0→target maps to 75→75)
      // Actually: without dream, treat target same: linear 0→target = 100→75
      baseScore = lerp(pricePerPerson, 0, targetPricePerPerson, 100, 75);
    } else {
      // target → max maps to 75 → 0
      baseScore = lerp(pricePerPerson, targetPricePerPerson, maxPricePerPerson, 75, 0);
    }
  } else if (dreamPricePerPerson !== undefined) {
    if (pricePerPerson <= dreamPricePerPerson) {
      baseScore = 100;
    } else {
      // dream → max maps to 100 → 0
      baseScore = lerp(pricePerPerson, dreamPricePerPerson, maxPricePerPerson, 100, 0);
    }
  } else {
    // No target/dream: linear from 0→max maps to 75→0
    baseScore = lerp(pricePerPerson, 0, maxPricePerPerson, 75, 0);
  }

  let bonus = 0;

  if (history !== undefined) {
    const { avg48h, minHistoric } = history;

    if (pricePerPerson === minHistoric || pricePerPerson < minHistoric) {
      bonus = Math.max(bonus, 10);
    }

    if (avg48h > 0) {
      const dropPercent = (avg48h - pricePerPerson) / avg48h;
      if (dropPercent > 0) {
        // up to +15 for being below avg48h
        const historyBonus = Math.min(15, dropPercent * 100);
        bonus = Math.max(bonus, historyBonus);
      }
    }

    // new historic min stacks with the 10 bonus
    if (pricePerPerson < minHistoric) {
      bonus = Math.max(bonus, 10);
    }
  }

  return Math.min(100, Math.max(0, baseScore + bonus));
}
