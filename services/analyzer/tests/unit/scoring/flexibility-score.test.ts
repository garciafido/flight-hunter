import { describe, it, expect } from 'vitest';
import { computeFlexibilityScore } from '../../../src/scoring/flexibility-score.js';

describe('computeFlexibilityScore', () => {
  it('returns 100 for free change policy airline (Delta)', () => {
    expect(computeFlexibilityScore('DL')).toBe(100);
  });

  it('returns 50 for paid change policy airline (LATAM)', () => {
    expect(computeFlexibilityScore('LA')).toBe(50);
  });

  it('returns 50 for paid change policy airline (AA)', () => {
    expect(computeFlexibilityScore('AA')).toBe(50);
  });

  it('returns 50 for unknown airline (fallback)', () => {
    expect(computeFlexibilityScore('ZZ')).toBe(50);
  });

  it('returns 50 for unknown airline pair (fallback)', () => {
    expect(computeFlexibilityScore('ZZ', 'YY')).toBe(50);
  });

  it('averages two legs when airlines differ', () => {
    // DL=100 (free), LA=50 (paid) → avg=75
    expect(computeFlexibilityScore('DL', 'LA')).toBe(75);
  });

  it('returns outbound score when both legs are the same airline', () => {
    expect(computeFlexibilityScore('DL', 'DL')).toBe(100);
  });

  it('returns 50 when both legs are paid policy', () => {
    expect(computeFlexibilityScore('LA', 'AA')).toBe(50);
  });

  it('returns single-leg score when inbound is undefined', () => {
    expect(computeFlexibilityScore('DL', undefined)).toBe(100);
  });

  it('averages unknown inbound with known outbound', () => {
    // DL=100, ZZ=50 (unknown) → avg=75
    expect(computeFlexibilityScore('DL', 'ZZ')).toBe(75);
  });

  it('handles lowercase IATA codes', () => {
    expect(computeFlexibilityScore('dl')).toBe(100);
  });

  it('handles mixed case IATA codes', () => {
    expect(computeFlexibilityScore('Dl', 'La')).toBe(75);
  });

  it('returns 10 for no-changes policy airline (Spirit NK)', () => {
    expect(computeFlexibilityScore('NK')).toBe(10);
  });

  it('averages free + no-changes policies correctly', () => {
    // DL=100 (free), NK=10 (no-changes) → avg=55
    expect(computeFlexibilityScore('DL', 'NK')).toBe(55);
  });
});
