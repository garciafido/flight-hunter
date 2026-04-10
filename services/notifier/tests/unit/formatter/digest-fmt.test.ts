import { describe, it, expect } from 'vitest';
import { formatDigest, formatDigestDate, type DigestSearch } from '../../../src/formatter/digest-fmt.js';

const makeSearch = (overrides: Partial<DigestSearch> = {}): DigestSearch => ({
  id: 's1',
  name: 'GRU → MAD',
  origin: 'GRU',
  destination: 'MAD',
  top3: [
    {
      price: 285,
      currency: 'USD',
      airline: 'LATAM',
      departureDate: '2026-07-25',
      returnDate: '2026-08-09',
      bookingUrl: 'https://example.com/book1',
    },
    {
      price: 305,
      currency: 'USD',
      airline: 'LATAM',
      departureDate: '2026-07-26',
      returnDate: '2026-08-09',
      bookingUrl: 'https://example.com/book2',
    },
    {
      price: 320,
      currency: 'USD',
      airline: 'Avianca',
      departureDate: '2026-07-25',
      returnDate: '2026-08-12',
      bookingUrl: 'https://example.com/book3',
    },
  ],
  ...overrides,
});

describe('formatDigest', () => {
  it('returns correct subject', () => {
    const { subject } = formatDigest({ date: '10 Abril 2026', searches: [makeSearch()] });
    expect(subject).toBe('Resumen Flight Hunter — 10 Abril 2026');
  });

  it('includes search origin and destination in html', () => {
    const { html } = formatDigest({ date: '10 Abril 2026', searches: [makeSearch()] });
    expect(html).toContain('GRU → MAD');
  });

  it('includes top 3 flight prices in html', () => {
    const { html } = formatDigest({ date: '10 Abril 2026', searches: [makeSearch()] });
    expect(html).toContain('285');
    expect(html).toContain('305');
    expect(html).toContain('320');
  });

  it('includes booking urls in html', () => {
    const { html } = formatDigest({ date: '10 Abril 2026', searches: [makeSearch()] });
    expect(html).toContain('https://example.com/book1');
  });

  it('shows price change note when minPriceChange is negative', () => {
    const { html } = formatDigest({
      date: '10 Abril 2026',
      searches: [makeSearch({ minPriceChange: -30 })],
    });
    expect(html).toContain('bajó');
    expect(html).toContain('30');
  });

  it('shows "Sin cambios" when minPriceChange is 0 or undefined', () => {
    const { html } = formatDigest({
      date: '10 Abril 2026',
      searches: [makeSearch({ minPriceChange: undefined })],
    });
    expect(html).toContain('Sin cambios');
  });

  it('shows "Sin cambios" when minPriceChange is positive', () => {
    const { html } = formatDigest({
      date: '10 Abril 2026',
      searches: [makeSearch({ minPriceChange: 10 })],
    });
    expect(html).toContain('Sin cambios');
  });

  it('handles empty searches array', () => {
    const { subject, html } = formatDigest({ date: '10 Abril 2026', searches: [] });
    expect(subject).toBe('Resumen Flight Hunter — 10 Abril 2026');
    expect(html).toContain('Sin novedades');
  });

  it('handles multiple searches in html', () => {
    const s2 = makeSearch({ id: 's2', name: 'EZE → BCN', origin: 'EZE', destination: 'BCN' });
    const { html } = formatDigest({ date: '10 Abril 2026', searches: [makeSearch(), s2] });
    expect(html).toContain('GRU → MAD');
    expect(html).toContain('EZE → BCN');
  });

  it('includes airline names', () => {
    const { html } = formatDigest({ date: '10 Abril 2026', searches: [makeSearch()] });
    expect(html).toContain('LATAM');
    expect(html).toContain('Avianca');
  });

  it('includes date in heading', () => {
    const { html } = formatDigest({ date: '10 Abril 2026', searches: [makeSearch()] });
    expect(html).toContain('10 Abril 2026');
  });
});

describe('formatDigestDate', () => {
  it('formats date to Spanish locale', () => {
    const date = new Date(2026, 3, 10); // April = month 3 (0-indexed)
    expect(formatDigestDate(date)).toBe('10 Abril 2026');
  });

  it('formats January correctly', () => {
    const date = new Date(2026, 0, 1);
    expect(formatDigestDate(date)).toBe('1 Enero 2026');
  });

  it('formats December correctly', () => {
    const date = new Date(2026, 11, 31);
    expect(formatDigestDate(date)).toBe('31 Diciembre 2026');
  });

  it('formats all months correctly', () => {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    for (let m = 0; m < 12; m++) {
      const date = new Date(2026, m, 15);
      expect(formatDigestDate(date)).toContain(months[m]);
    }
  });
});
