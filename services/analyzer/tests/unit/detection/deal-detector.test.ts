import { describe, it, expect } from 'vitest';
import { DealDetector } from '../../../src/detection/deal-detector.js';
import type { SearchAlertConfig } from '@flight-hunter/shared';

const baseConfig: SearchAlertConfig = {
  scoreThresholds: { info: 50, good: 70, urgent: 85 },
  maxPrice: 1000,
  currency: 'USD',
};

describe('DealDetector', () => {
  const detector = new DealDetector();

  describe('price ceiling', () => {
    it('returns null when price equals max', () => {
      expect(detector.detect(90, 1000, baseConfig)).toBeNull();
    });

    it('returns null when price exceeds max', () => {
      expect(detector.detect(90, 1100, baseConfig)).toBeNull();
    });
  });

  describe('score thresholds', () => {
    it('returns null when score below info threshold', () => {
      expect(detector.detect(40, 500, baseConfig)).toBeNull();
    });

    it('returns info when score meets info threshold', () => {
      expect(detector.detect(50, 500, baseConfig)).toBe('info');
    });

    it('returns good when score meets good threshold', () => {
      expect(detector.detect(70, 500, baseConfig)).toBe('good');
    });

    it('returns urgent when score meets urgent threshold', () => {
      expect(detector.detect(85, 500, baseConfig)).toBe('urgent');
    });

    it('returns info when score is between info and good', () => {
      expect(detector.detect(60, 500, baseConfig)).toBe('info');
    });
  });

  describe('price targets', () => {
    const configWithTargets: SearchAlertConfig = {
      ...baseConfig,
      targetPrice: 600,
      dreamPrice: 400,
    };

    it('returns good when price is at or below target', () => {
      const level = detector.detect(0, 600, configWithTargets);
      expect(level).toBe('good');
    });

    it('returns urgent when price is at or below dream', () => {
      const level = detector.detect(0, 400, configWithTargets);
      expect(level).toBe('urgent');
    });

    it('returns urgent when price is below dream', () => {
      const level = detector.detect(0, 300, configWithTargets);
      expect(level).toBe('urgent');
    });

    it('returns good when below target but not dream', () => {
      const level = detector.detect(0, 500, configWithTargets);
      expect(level).toBe('good');
    });

    it('returns null when above target and below info threshold', () => {
      const level = detector.detect(0, 700, configWithTargets);
      expect(level).toBeNull();
    });
  });

  describe('history triggers', () => {
    it('returns urgent for new historic min', () => {
      const level = detector.detect(0, 300, baseConfig, { avg48h: 0, minHistoric: 400 });
      expect(level).toBe('urgent');
    });

    it('returns urgent for >25% drop from avg48h', () => {
      // price=700, avg48h=1000 → drop=30%
      const level = detector.detect(0, 700, baseConfig, { avg48h: 1000, minHistoric: 1200 });
      expect(level).toBe('urgent');
    });

    it('returns good for >15% drop from avg48h', () => {
      // price=830, avg48h=1000 → drop=17%, minHistoric=800 so price > minHistoric
      const level = detector.detect(0, 830, baseConfig, { avg48h: 1000, minHistoric: 800 });
      expect(level).toBe('good');
    });

    it('returns info for >5% drop from avg48h', () => {
      // price=930, avg48h=1000 → drop=7%, minHistoric=900 so price > minHistoric
      const level = detector.detect(0, 930, baseConfig, { avg48h: 1000, minHistoric: 900 });
      expect(level).toBe('info');
    });

    it('returns null for <=5% drop from avg48h with no other triggers', () => {
      // price=960, avg48h=1000 → drop=4%, minHistoric=950 so price > minHistoric
      const level = detector.detect(0, 960, baseConfig, { avg48h: 1000, minHistoric: 950 });
      expect(level).toBeNull();
    });

    it('no history trigger when avg48h is 0', () => {
      // price=500, minHistoric=400 so price > minHistoric (not new min), avg48h=0 (no drop trigger)
      const level = detector.detect(0, 500, baseConfig, { avg48h: 0, minHistoric: 400 });
      expect(level).toBeNull();
    });
  });

  describe('highest level wins', () => {
    it('returns urgent when score triggers good but history triggers urgent', () => {
      // score=70 (good threshold), history shows new min (urgent)
      const level = detector.detect(70, 300, baseConfig, { avg48h: 0, minHistoric: 400 });
      expect(level).toBe('urgent');
    });

    it('returns urgent when price triggers good but dream price met', () => {
      const config = { ...baseConfig, targetPrice: 600, dreamPrice: 400 };
      const level = detector.detect(70, 400, config);
      expect(level).toBe('urgent');
    });

    it('combines score and price triggers taking highest', () => {
      const config = { ...baseConfig, targetPrice: 600 };
      // score=50 (info), price at target (good) → good
      const level = detector.detect(50, 600, config);
      expect(level).toBe('good');
    });
  });

  describe('without history', () => {
    it('works correctly without history parameter', () => {
      expect(detector.detect(85, 500, baseConfig)).toBe('urgent');
      expect(detector.detect(40, 500, baseConfig)).toBeNull();
    });
  });
});
