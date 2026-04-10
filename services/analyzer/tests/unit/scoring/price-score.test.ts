import { describe, it, expect } from 'vitest';
import { computePriceScore } from '../../../src/scoring/price-score.js';

describe('computePriceScore', () => {
  const baseConfig = { maxPricePerPerson: 1000 };

  describe('boundary conditions', () => {
    it('returns 0 when price equals max', () => {
      expect(computePriceScore(1000, baseConfig)).toBe(0);
    });

    it('returns 0 when price exceeds max', () => {
      expect(computePriceScore(1200, baseConfig)).toBe(0);
    });
  });

  describe('without target or dream (linear 0→max = 75→0)', () => {
    it('returns 75 at price=0', () => {
      expect(computePriceScore(0, baseConfig)).toBeCloseTo(75);
    });

    it('interpolates linearly between 0 and max', () => {
      // at price=500 (half of 1000), score should be 37.5
      expect(computePriceScore(500, baseConfig)).toBeCloseTo(37.5);
    });

    it('returns close to 0 just below max', () => {
      expect(computePriceScore(999, baseConfig)).toBeCloseTo(0.075);
    });
  });

  describe('with target only', () => {
    const config = { maxPricePerPerson: 1000, targetPricePerPerson: 600 };

    it('returns 100 at price=0', () => {
      expect(computePriceScore(0, config)).toBeCloseTo(100);
    });

    it('returns 75 at target price', () => {
      expect(computePriceScore(600, config)).toBeCloseTo(75);
    });

    it('returns 0 at max price', () => {
      expect(computePriceScore(1000, config)).toBe(0);
    });

    it('interpolates correctly above target', () => {
      // 800 is midpoint between 600 and 1000 → score = 37.5
      expect(computePriceScore(800, config)).toBeCloseTo(37.5);
    });

    it('interpolates correctly below target', () => {
      // 300 is midpoint between 0 and 600 → score = 87.5
      expect(computePriceScore(300, config)).toBeCloseTo(87.5);
    });
  });

  describe('with dream only', () => {
    const config = { maxPricePerPerson: 1000, dreamPricePerPerson: 300 };

    it('returns 100 at dream price', () => {
      expect(computePriceScore(300, config)).toBe(100);
    });

    it('returns 100 below dream price', () => {
      expect(computePriceScore(100, config)).toBe(100);
    });

    it('returns 0 at max price', () => {
      expect(computePriceScore(1000, config)).toBe(0);
    });

    it('interpolates between dream and max', () => {
      // midpoint between 300 and 1000 = 650 → score = 50
      expect(computePriceScore(650, config)).toBeCloseTo(50);
    });
  });

  describe('with both target and dream', () => {
    const config = {
      maxPricePerPerson: 1000,
      targetPricePerPerson: 600,
      dreamPricePerPerson: 300,
    };

    it('returns 100 at dream price', () => {
      expect(computePriceScore(300, config)).toBe(100);
    });

    it('returns 100 below dream price', () => {
      expect(computePriceScore(200, config)).toBe(100);
    });

    it('returns 75 at target price', () => {
      expect(computePriceScore(600, config)).toBeCloseTo(75);
    });

    it('returns 0 at max price', () => {
      expect(computePriceScore(1000, config)).toBe(0);
    });

    it('interpolates between dream and target (100→75)', () => {
      // midpoint between 300 and 600 = 450 → score = 87.5
      expect(computePriceScore(450, config)).toBeCloseTo(87.5);
    });

    it('interpolates between target and max (75→0)', () => {
      // midpoint between 600 and 1000 = 800 → score = 37.5
      expect(computePriceScore(800, config)).toBeCloseTo(37.5);
    });
  });

  describe('history bonus', () => {
    it('adds up to +15 for being below avg48h', () => {
      // price=400, avg48h=500 → dropPercent=20% → bonus=min(15,20)=15
      const score = computePriceScore(400, baseConfig, { avg48h: 500, minHistoric: 600 });
      const baseScore = computePriceScore(400, baseConfig);
      expect(score).toBeCloseTo(Math.min(100, baseScore + 15));
    });

    it('adds +10 for equaling historic min', () => {
      const score = computePriceScore(400, baseConfig, { avg48h: 0, minHistoric: 400 });
      const baseScore = computePriceScore(400, baseConfig);
      expect(score).toBeCloseTo(Math.min(100, baseScore + 10));
    });

    it('adds +10 for new historic min (below minHistoric)', () => {
      const score = computePriceScore(300, baseConfig, { avg48h: 0, minHistoric: 400 });
      const baseScore = computePriceScore(300, baseConfig);
      expect(score).toBeCloseTo(Math.min(100, baseScore + 10));
    });

    it('applies max of history bonuses', () => {
      // both avg48h and minHistoric bonuses - max is used
      // avg drop > 25% → bonus=15 (capped), new min → bonus=10; max=15
      const score = computePriceScore(200, baseConfig, { avg48h: 500, minHistoric: 300 });
      const baseScore = computePriceScore(200, baseConfig);
      expect(score).toBeCloseTo(Math.min(100, baseScore + 15));
    });

    it('no bonus when price is above avg48h', () => {
      // price=600, avg48h=500 (price > avg, no drop bonus), minHistoric=500 (price > min, no min bonus)
      const score = computePriceScore(600, baseConfig, { avg48h: 500, minHistoric: 500 });
      const baseScore = computePriceScore(600, baseConfig);
      expect(score).toBeCloseTo(baseScore);
    });

    it('caps total score at 100', () => {
      // Very low price with history bonus should not exceed 100
      const score = computePriceScore(50, { maxPricePerPerson: 1000, dreamPricePerPerson: 100 }, {
        avg48h: 900,
        minHistoric: 100,
      });
      expect(score).toBe(100);
    });

    it('no bonus when avg48h is 0', () => {
      const score = computePriceScore(400, baseConfig, { avg48h: 0, minHistoric: 600 });
      const baseScore = computePriceScore(400, baseConfig);
      // minHistoric=600 > price=400, so +10
      expect(score).toBeCloseTo(Math.min(100, baseScore + 10));
    });

    it('proportional bonus for small drop below avg48h', () => {
      // price=475, avg48h=500 → dropPercent=5% → avg bonus=min(15,5)=5
      // minHistoric=470 so price=475 > 470, no min bonus → max bonus=5
      const score = computePriceScore(475, baseConfig, { avg48h: 500, minHistoric: 470 });
      const baseScore = computePriceScore(475, baseConfig);
      expect(score).toBeCloseTo(Math.min(100, baseScore + 5));
    });
  });
});
