export interface ScoringWeights {
  price: number;
  schedule: number;
  stopover: number;
  airline: number;
  flexibility: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  price: 0.4,
  schedule: 0.2,
  stopover: 0.2,
  airline: 0.1,
  flexibility: 0.1,
};

export function resolveWeights(overrides?: Partial<ScoringWeights>): ScoringWeights {
  const merged: ScoringWeights = {
    ...DEFAULT_WEIGHTS,
    ...overrides,
  };

  const total = merged.price + merged.schedule + merged.stopover + merged.airline + merged.flexibility;

  /* v8 ignore next 3 */
  if (total === 0) {
    return { ...DEFAULT_WEIGHTS };
  }

  return {
    price: merged.price / total,
    schedule: merged.schedule / total,
    stopover: merged.stopover / total,
    airline: merged.airline / total,
    flexibility: merged.flexibility / total,
  };
}
