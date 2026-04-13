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

/**
 * Resolves alert config prices — supports both new "total" fields and
 * legacy "perPerson" fields for backwards compatibility with old DB rows.
 */
function resolveMaxPrice(config: SearchAlertConfig): number {
  return config.maxPrice ?? config.maxPricePerPerson ?? Infinity;
}
function resolveTargetPrice(config: SearchAlertConfig): number | undefined {
  return config.targetPrice ?? config.targetPricePerPerson;
}
function resolveDreamPrice(config: SearchAlertConfig): number | undefined {
  return config.dreamPrice ?? config.dreamPricePerPerson;
}

export class DealDetector {
  /**
   * Detect deal level based on the TOTAL TRIP PRICE (group, all legs, all pax).
   * @param score — combo quality score (0-100)
   * @param totalPrice — group total price (tickets + baggage)
   * @param config — alert thresholds from search config
   * @param history — optional price history for trend detection
   */
  detect(
    score: number,
    totalPrice: number,
    config: SearchAlertConfig,
    history?: PriceHistory,
  ): AlertLevel | null {
    const maxPrice = resolveMaxPrice(config);
    const targetPrice = resolveTargetPrice(config);
    const dreamPrice = resolveDreamPrice(config);

    // Price ≥ max → no alert
    if (totalPrice >= maxPrice) return null;

    let level: AlertLevel | null = null;

    // Score thresholds
    if (score >= config.scoreThresholds.urgent) {
      level = maxLevel(level, 'urgent');
    } else if (score >= config.scoreThresholds.good) {
      level = maxLevel(level, 'good');
    } else if (score >= config.scoreThresholds.info) {
      level = maxLevel(level, 'info');
    }

    // Price targets (total, not per-person)
    if (dreamPrice !== undefined && totalPrice <= dreamPrice) {
      level = maxLevel(level, 'urgent');
    } else if (targetPrice !== undefined && totalPrice <= targetPrice) {
      level = maxLevel(level, 'good');
    }

    // History triggers (using total price for consistency)
    if (history !== undefined) {
      const { avg48h, minHistoric } = history;

      if (totalPrice < minHistoric) {
        level = maxLevel(level, 'urgent');
      }

      if (avg48h > 0) {
        const dropPercent = (avg48h - totalPrice) / avg48h;
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
