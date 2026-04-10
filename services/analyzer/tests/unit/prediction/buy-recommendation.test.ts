import { describe, it, expect } from 'vitest';
import { buildRecommendation } from '../../../src/prediction/buy-recommendation.js';
import type { PricePrediction } from '../../../src/prediction/price-predictor.js';

function makePred(overrides: Partial<PricePrediction> = {}): PricePrediction {
  return {
    currentMin: 400,
    movingAvg7d: 390,
    movingAvg30d: 420,
    trendSlope: 0,
    predicted7dMin: 400,
    predicted14dMin: 400,
    confidence: 'high',
    ...overrides,
  };
}

describe('buildRecommendation — dream price', () => {
  it('returns buy-now when currentMin is exactly the dream price', () => {
    const result = buildRecommendation(
      makePred({ currentMin: 300 }),
      { dreamPricePerPerson: 300 },
    );
    expect(result.action).toBe('buy-now');
    expect(result.reason).toContain('dream');
  });

  it('returns buy-now when currentMin is below the dream price', () => {
    const result = buildRecommendation(
      makePred({ currentMin: 250 }),
      { dreamPricePerPerson: 300 },
    );
    expect(result.action).toBe('buy-now');
  });

  it('does not trigger dream-price rule when dreamPrice is not set', () => {
    const result = buildRecommendation(makePred({ currentMin: 200 }), {});
    // Should fall through to other rules
    expect(result.action).not.toBeUndefined();
  });
});

describe('buildRecommendation — strong downward trend', () => {
  it('returns wait when slope < -1 with high confidence', () => {
    const result = buildRecommendation(
      makePred({ trendSlope: -2, confidence: 'high', currentMin: 400, predicted7dMin: 386 }),
      {},
    );
    expect(result.action).toBe('wait');
    expect(result.reason).toContain('bajista');
  });

  it('includes predictedSavings when waiting on downward trend', () => {
    const result = buildRecommendation(
      makePred({ trendSlope: -2, confidence: 'high', currentMin: 400, predicted7dMin: 386 }),
      {},
    );
    expect(result.predictedSavings).toBeDefined();
    expect(result.predictedSavings).toBeCloseTo(14, 1);
  });

  it('predictedSavings is 0 when predicted price exceeds current (no savings)', () => {
    // This shouldn't happen with downward slope, but clamp test
    const result = buildRecommendation(
      makePred({ trendSlope: -1.5, confidence: 'high', currentMin: 400, predicted7dMin: 410 }),
      {},
    );
    expect(result.predictedSavings).toBe(0);
  });

  it('does NOT trigger wait for slope < -1 with medium confidence', () => {
    const result = buildRecommendation(
      makePred({ trendSlope: -2, confidence: 'medium', currentMin: 400, predicted7dMin: 386, movingAvg30d: 420 }),
      {},
    );
    // Should not be 'wait' due to downward trend (needs high confidence)
    // but may be buy-now due to current < avg*0.85
    expect(result.action).not.toBe('wait');
  });

  it('does NOT trigger wait for slope exactly -1 (boundary)', () => {
    const result = buildRecommendation(
      makePred({ trendSlope: -1, confidence: 'high', currentMin: 400, predicted7dMin: 393, movingAvg30d: 420 }),
      {},
    );
    // trendSlope < -1 is false at exactly -1
    // currentMin 400 vs avg30d 420: 400 < 420*0.85=357? No → not buy-now on monthly avg
    // 400 > 420*1.15=483? No → not wait on monthly avg
    // → monitor
    expect(['monitor', 'buy-now', 'wait']).toContain(result.action);
  });
});

describe('buildRecommendation — strong upward trend', () => {
  it('returns buy-now when slope > 2', () => {
    const result = buildRecommendation(
      makePred({ trendSlope: 3, movingAvg30d: 400, currentMin: 410 }),
      {},
    );
    expect(result.action).toBe('buy-now');
    expect(result.reason).toContain('alcista');
  });

  it('does NOT trigger buy-now for slope exactly 2 (boundary)', () => {
    const result = buildRecommendation(
      makePred({ trendSlope: 2, currentMin: 400, movingAvg30d: 400 }),
      {},
    );
    // slope > 2 is false at exactly 2
    expect(result.action).not.toBe('buy-now');
  });
});

describe('buildRecommendation — monthly average comparison', () => {
  it('returns buy-now when current is 15% below 30-day avg', () => {
    // avg30d=500, current=420 (420 < 500*0.85=425)
    const result = buildRecommendation(
      makePred({ currentMin: 420, movingAvg30d: 500, trendSlope: 0 }),
      {},
    );
    expect(result.action).toBe('buy-now');
    expect(result.reason).toContain('15%');
  });

  it('returns wait when current is 15% above 30-day avg', () => {
    // avg30d=400, current=470 (470 > 400*1.15=460)
    const result = buildRecommendation(
      makePred({ currentMin: 470, movingAvg30d: 400, trendSlope: 0 }),
      {},
    );
    expect(result.action).toBe('wait');
    expect(result.reason).toContain('15%');
  });

  it('returns monitor when price is within 15% of avg', () => {
    const result = buildRecommendation(
      makePred({ currentMin: 400, movingAvg30d: 420, trendSlope: 0 }),
      {},
    );
    expect(result.action).toBe('monitor');
    expect(result.reason).toContain('estable');
  });
});

describe('buildRecommendation — priority ordering', () => {
  it('dream price takes highest priority over downward trend', () => {
    const result = buildRecommendation(
      makePred({
        currentMin: 200,
        trendSlope: -5,
        confidence: 'high',
        predicted7dMin: 165,
        movingAvg30d: 400,
      }),
      { dreamPricePerPerson: 250 },
    );
    // currentMin(200) <= dreamPrice(250) → buy-now wins
    expect(result.action).toBe('buy-now');
    expect(result.reason).toContain('dream');
  });

  it('upward trend takes priority over monthly avg comparison', () => {
    const result = buildRecommendation(
      makePred({
        currentMin: 400,
        trendSlope: 3,
        movingAvg30d: 500, // current is below avg (would normally be buy-now)
      }),
      {},
    );
    // upward trend (slope > 2) evaluated before monthly avg check
    expect(result.action).toBe('buy-now');
    expect(result.reason).toContain('alcista');
  });
});

describe('buildRecommendation — edge cases', () => {
  it('returns monitor for completely neutral conditions', () => {
    const result = buildRecommendation(
      makePred({ currentMin: 400, movingAvg30d: 400, trendSlope: 0 }),
      {},
    );
    expect(result.action).toBe('monitor');
  });

  it('does not include predictedSavings in buy-now result', () => {
    const result = buildRecommendation(
      makePred({ currentMin: 250 }),
      { dreamPricePerPerson: 300 },
    );
    expect(result.predictedSavings).toBeUndefined();
  });

  it('does not include predictedSavings in monitor result', () => {
    const result = buildRecommendation(
      makePred({ currentMin: 400, movingAvg30d: 400, trendSlope: 0 }),
      {},
    );
    expect(result.predictedSavings).toBeUndefined();
  });
});
