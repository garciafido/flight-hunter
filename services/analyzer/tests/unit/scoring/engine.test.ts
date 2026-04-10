import { describe, it, expect } from 'vitest';
import { ScoringEngine } from '../../../src/scoring/engine.js';
import { DEFAULT_WEIGHTS } from '../../../src/scoring/weights.js';

describe('ScoringEngine', () => {
  const engine = new ScoringEngine(DEFAULT_WEIGHTS);

  it('computes weighted sum of components', () => {
    const result = engine.compute([
      { name: 'price', score: 100 },
      { name: 'schedule', score: 100 },
      { name: 'stopover', score: 100 },
      { name: 'airline', score: 100 },
      { name: 'flexibility', score: 100 },
    ]);
    expect(result.total).toBeCloseTo(100);
  });

  it('returns 0 for all zero scores', () => {
    const result = engine.compute([
      { name: 'price', score: 0 },
      { name: 'schedule', score: 0 },
      { name: 'stopover', score: 0 },
      { name: 'airline', score: 0 },
      { name: 'flexibility', score: 0 },
    ]);
    expect(result.total).toBe(0);
  });

  it('computes correct weighted sum', () => {
    // price=100 (weight 0.4), rest=0 → total=40
    const result = engine.compute([
      { name: 'price', score: 100 },
      { name: 'schedule', score: 0 },
      { name: 'stopover', score: 0 },
      { name: 'airline', score: 0 },
      { name: 'flexibility', score: 0 },
    ]);
    expect(result.total).toBeCloseTo(40);
  });

  it('clamps total to 0 minimum', () => {
    const result = engine.compute([
      { name: 'price', score: -50 },
      { name: 'schedule', score: 0 },
      { name: 'stopover', score: 0 },
      { name: 'airline', score: 0 },
      { name: 'flexibility', score: 0 },
    ]);
    expect(result.total).toBe(0);
  });

  it('clamps total to 100 maximum', () => {
    // This would require somehow getting > 100 total...
    // With valid weights (sum=1) and scores <= 100, total <= 100
    // Test with custom engine where weights don't sum to 1
    const heavyEngine = new ScoringEngine({
      price: 1.0,
      schedule: 1.0,
      stopover: 1.0,
      airline: 1.0,
      flexibility: 1.0,
    });
    const result = heavyEngine.compute([
      { name: 'price', score: 100 },
      { name: 'schedule', score: 100 },
      { name: 'stopover', score: 100 },
      { name: 'airline', score: 100 },
      { name: 'flexibility', score: 100 },
    ]);
    expect(result.total).toBe(100);
  });

  it('includes full breakdown', () => {
    const result = engine.compute([
      { name: 'price', score: 80 },
      { name: 'schedule', score: 60 },
      { name: 'stopover', score: 70 },
      { name: 'airline', score: 50 },
      { name: 'flexibility', score: 50 },
    ]);
    expect(result.breakdown.price).toBe(80);
    expect(result.breakdown.schedule).toBe(60);
    expect(result.breakdown.stopover).toBe(70);
    expect(result.breakdown.airline).toBe(50);
    expect(result.breakdown.flexibility).toBe(50);
  });

  it('defaults missing components to 0 in breakdown', () => {
    const result = engine.compute([{ name: 'price', score: 50 }]);
    expect(result.breakdown.schedule).toBe(0);
    expect(result.breakdown.stopover).toBe(0);
    expect(result.breakdown.airline).toBe(0);
    expect(result.breakdown.flexibility).toBe(0);
  });

  it('computes partial components correctly', () => {
    // price=50 (weight 0.4) → 20, schedule=100 (weight 0.2) → 20, rest=0
    const result = engine.compute([
      { name: 'price', score: 50 },
      { name: 'schedule', score: 100 },
    ]);
    expect(result.total).toBeCloseTo(40);
  });
});
