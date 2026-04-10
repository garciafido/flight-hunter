import type { StopoverInfo } from '@flight-hunter/shared';
import type { StopoverConfig } from '@flight-hunter/shared';

export function computeStopoverScore(stopover?: StopoverInfo, config?: StopoverConfig): number {
  // No config and no stopover → 100 (no stopover expected, none found, perfect)
  if (!config && !stopover) return 100;

  // Config required but no stopover found → 0
  if (config && !stopover) return 0;

  // No config but stopover exists → 100 (bonus stopover, don't penalize)
  if (!config && stopover) return 100;

  // Both config and stopover exist
  const s = stopover!;
  const c = config!;

  // Wrong airport → 0
  if (s.airport !== c.airport) return 0;

  // Wrong leg (e.g. config requires inbound but stopover is on outbound) → 0
  const requiredLeg = c.leg ?? 'any';
  if (requiredLeg !== 'any' && s.leg && s.leg !== requiredLeg) return 0;

  const days = s.durationDays;

  if (days >= c.minDays && days <= c.maxDays) {
    return 100;
  }

  if (days < c.minDays) {
    const shortage = c.minDays - days;
    return Math.max(0, 100 - shortage * 30);
  }

  // days > maxDays
  const excess = days - c.maxDays;
  return Math.max(0, 100 - excess * 15);
}
