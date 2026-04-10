import { describe, it, expect } from 'vitest';
import { REGION_PRESETS, expandDestinationCandidates } from '../src/utils/region-presets.js';

describe('REGION_PRESETS', () => {
  it('contains southAmerica preset with IATA codes', () => {
    expect(REGION_PRESETS.southAmerica).toContain('LIM');
    expect(REGION_PRESETS.southAmerica).toContain('SCL');
    expect(REGION_PRESETS.southAmerica.length).toBeGreaterThan(0);
  });

  it('contains europe preset with IATA codes', () => {
    expect(REGION_PRESETS.europe).toContain('MAD');
    expect(REGION_PRESETS.europe).toContain('LHR');
  });

  it('contains northAmerica, asia, oceania presets', () => {
    expect(REGION_PRESETS.northAmerica).toContain('JFK');
    expect(REGION_PRESETS.asia).toContain('NRT');
    expect(REGION_PRESETS.oceania).toContain('SYD');
  });
});

describe('expandDestinationCandidates', () => {
  it('returns empty array for empty input', () => {
    expect(expandDestinationCandidates([])).toEqual([]);
  });

  it('keeps IATA codes that are not region keys as-is', () => {
    const result = expandDestinationCandidates(['CUZ', 'BOG']);
    expect(result).toContain('CUZ');
    expect(result).toContain('BOG');
    expect(result).toHaveLength(2);
  });

  it('expands region preset key to its airports', () => {
    const result = expandDestinationCandidates(['southAmerica']);
    expect(result).toContain('LIM');
    expect(result).toContain('SCL');
    expect(result).toHaveLength(REGION_PRESETS.southAmerica.length);
  });

  it('expands multiple region keys', () => {
    const result = expandDestinationCandidates(['southAmerica', 'europe']);
    const expected = new Set([...REGION_PRESETS.southAmerica, ...REGION_PRESETS.europe]);
    expect(result).toHaveLength(expected.size);
    expect(result).toContain('LIM');
    expect(result).toContain('MAD');
  });

  it('mixes IATA codes and region keys', () => {
    const result = expandDestinationCandidates(['JFK', 'southAmerica']);
    expect(result).toContain('JFK');
    expect(result).toContain('LIM');
  });

  it('deduplicates airports that appear in multiple presets or repeated IATA codes', () => {
    // Add same IATA twice
    const result = expandDestinationCandidates(['LIM', 'LIM']);
    const countLIM = result.filter(r => r === 'LIM').length;
    expect(countLIM).toBe(1);
  });

  it('deduplicates when IATA is also in a region preset', () => {
    // LIM is in southAmerica
    const result = expandDestinationCandidates(['LIM', 'southAmerica']);
    const countLIM = result.filter(r => r === 'LIM').length;
    expect(countLIM).toBe(1);
  });

  it('expands oceania preset correctly', () => {
    const result = expandDestinationCandidates(['oceania']);
    expect(result).toContain('SYD');
    expect(result).toContain('AKL');
  });
});
