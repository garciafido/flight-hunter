import type { AlertLevel } from '@flight-hunter/shared';
import type { SearchAlertConfig } from '@flight-hunter/shared';
import type { PriceHistory } from '../scoring/price-score.js';

const LEVEL_ORDER: Record<AlertLevel, number> = {
  info: 1,
  good: 2,
  urgent: 3,
};

function maxLevel(a: AlertLevel | null, b: AlertLevel): AlertLevel {
  if (a === null) return b;
  return LEVEL_ORDER[a] >= LEVEL_ORDER[b] ? a : b;
}

export class DealDetector {
  detect(
    score: number,
    pricePerPerson: number,
    config: SearchAlertConfig,
    history?: PriceHistory,
  ): AlertLevel | null {
    // Price ≥ max → null (always)
    if (pricePerPerson >= config.maxPricePerPerson) return null;

    let level: AlertLevel | null = null;

    // Score thresholds
    if (score >= config.scoreThresholds.urgent) {
      level = maxLevel(level, 'urgent');
    } else if (score >= config.scoreThresholds.good) {
      level = maxLevel(level, 'good');
    } else if (score >= config.scoreThresholds.info) {
      level = maxLevel(level, 'info');
    }

    // Price targets
    if (config.dreamPricePerPerson !== undefined && pricePerPerson <= config.dreamPricePerPerson) {
      level = maxLevel(level, 'urgent');
    } else if (
      config.targetPricePerPerson !== undefined &&
      pricePerPerson <= config.targetPricePerPerson
    ) {
      level = maxLevel(level, 'good');
    }

    // History triggers
    if (history !== undefined) {
      const { avg48h, minHistoric } = history;

      // New historic min → urgent
      if (pricePerPerson < minHistoric) {
        level = maxLevel(level, 'urgent');
      }

      if (avg48h > 0) {
        const dropPercent = (avg48h - pricePerPerson) / avg48h;

        if (dropPercent > 0.25) {
          level = maxLevel(level, 'urgent');
        } else if (dropPercent > 0.15) {
          level = maxLevel(level, 'good');
        } else if (dropPercent > 0.05) {
          level = maxLevel(level, 'info');
        }
      }
    }

    return level;
  }
}
