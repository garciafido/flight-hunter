import type { ScoreBreakdown } from '@flight-hunter/shared';
import type { ScoringWeights } from './weights.js';

export interface ScoreComponent {
  name: keyof ScoringWeights;
  score: number;
}

export interface ScoreResult {
  total: number;
  breakdown: ScoreBreakdown;
}

export class ScoringEngine {
  constructor(private readonly weights: ScoringWeights) {}

  compute(components: ScoreComponent[]): ScoreResult {
    const breakdown: ScoreBreakdown = {
      price: 0,
      schedule: 0,
      stopover: 0,
      airline: 0,
      flexibility: 0,
    };

    for (const { name, score } of components) {
      breakdown[name] = score;
    }

    const total =
      breakdown.price * this.weights.price +
      breakdown.schedule * this.weights.schedule +
      breakdown.stopover * this.weights.stopover +
      breakdown.airline * this.weights.airline +
      breakdown.flexibility * this.weights.flexibility;

    return {
      total: Math.min(100, Math.max(0, total)),
      breakdown,
    };
  }
}
