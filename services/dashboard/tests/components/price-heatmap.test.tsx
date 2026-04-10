import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PriceHeatmap } from '@/components/price-heatmap';

afterEach(() => cleanup());

const makeDays = (dates: Array<{ date: string; minPrice: number }>) =>
  dates.map(({ date, minPrice }) => ({
    date,
    minPrice,
    currency: 'USD',
    resultCount: 3,
  }));

describe('PriceHeatmap', () => {
  it('renders month and year heading', () => {
    render(<PriceHeatmap month="2026-07" days={[]} />);
    expect(screen.getByText(/Julio 2026/)).toBeDefined();
  });

  it('renders day-of-week labels', () => {
    render(<PriceHeatmap month="2026-07" days={[]} />);
    expect(screen.getByText('Lu')).toBeDefined();
    expect(screen.getByText('Do')).toBeDefined();
  });

  it('renders the correct number of day cells for a 31-day month', () => {
    render(<PriceHeatmap month="2026-07" days={[]} />);
    // July has 31 days, days 1–31 should appear
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('31')).toBeDefined();
  });

  it('renders price data cell with tooltip for a day with data', () => {
    const days = makeDays([{ date: '2026-07-15', minPrice: 285 }]);
    const { container } = render(<PriceHeatmap month="2026-07" days={days} />);
    const cell = container.querySelector('[title*="285"]');
    expect(cell).not.toBeNull();
  });

  it('colors cell green when price <= targetPrice', () => {
    const days = makeDays([{ date: '2026-07-15', minPrice: 250 }]);
    const { container } = render(<PriceHeatmap month="2026-07" days={days} targetPrice={300} />);
    const cell = container.querySelector('[title*="250"]') as HTMLElement;
    expect(cell?.style.background).toBe('rgb(22, 163, 74)');
  });

  it('colors cell amber when price <= maxPrice but > targetPrice', () => {
    const days = makeDays([{ date: '2026-07-15', minPrice: 350 }]);
    const { container } = render(<PriceHeatmap month="2026-07" days={days} targetPrice={300} maxPrice={400} />);
    const cell = container.querySelector('[title*="350"]') as HTMLElement;
    expect(cell?.style.background).toBe('rgb(217, 119, 6)');
  });

  it('colors cell red when price > maxPrice', () => {
    const days = makeDays([{ date: '2026-07-15', minPrice: 500 }]);
    const { container } = render(<PriceHeatmap month="2026-07" days={days} targetPrice={300} maxPrice={400} />);
    const cell = container.querySelector('[title*="500"]') as HTMLElement;
    expect(cell?.style.background).toBe('rgb(220, 38, 38)');
  });

  it('colors cell red when no targetPrice/maxPrice provided', () => {
    const days = makeDays([{ date: '2026-07-15', minPrice: 285 }]);
    const { container } = render(<PriceHeatmap month="2026-07" days={days} />);
    const cell = container.querySelector('[title*="285"]') as HTMLElement;
    // No target or max, defaults to red
    expect(cell?.style.background).toBe('rgb(220, 38, 38)');
  });

  it('shows result count in tooltip', () => {
    const days = [{ date: '2026-07-15', minPrice: 285, currency: 'USD', resultCount: 7 }];
    const { container } = render(<PriceHeatmap month="2026-07" days={days} />);
    const cell = container.querySelector('[title*="7 vuelos"]');
    expect(cell).not.toBeNull();
  });

  it('shows singular "vuelo" for resultCount=1', () => {
    const days = [{ date: '2026-07-15', minPrice: 285, currency: 'USD', resultCount: 1 }];
    const { container } = render(<PriceHeatmap month="2026-07" days={days} />);
    const cell = container.querySelector('[title*="1 vuelo"]');
    expect(cell).not.toBeNull();
    // Should not have "vuelos" (plural)
    const cellPlural = container.querySelector('[title*="1 vuelos"]');
    expect(cellPlural).toBeNull();
  });

  it('renders empty month with no days in range', () => {
    render(<PriceHeatmap month="2026-07" days={[]} />);
    // Should not throw
    expect(screen.getByText('Julio 2026')).toBeDefined();
  });

  it('renders legend for target and max colors when provided', () => {
    render(<PriceHeatmap month="2026-07" days={[]} targetPrice={300} maxPrice={400} />);
    expect(screen.getByText('Bajo objetivo')).toBeDefined();
    expect(screen.getByText('Sobre objetivo')).toBeDefined();
    expect(screen.getByText('Alto')).toBeDefined();
  });

  it('renders only available legends when no targetPrice/maxPrice', () => {
    render(<PriceHeatmap month="2026-07" days={[]} />);
    expect(screen.queryByText('Bajo objetivo')).toBeNull();
    expect(screen.queryByText('Sobre objetivo')).toBeNull();
    expect(screen.getByText('Alto')).toBeDefined();
    expect(screen.getByText('Sin datos')).toBeDefined();
  });

  it('handles February (28-day month)', () => {
    render(<PriceHeatmap month="2026-02" days={[]} />);
    expect(screen.getByText('Febrero 2026')).toBeDefined();
    expect(screen.getByText('28')).toBeDefined();
    expect(screen.queryByText('29')).toBeNull();
  });

  it('handles all 12 month names', () => {
    const months = [
      ['2026-01', 'Enero'],
      ['2026-02', 'Febrero'],
      ['2026-03', 'Marzo'],
      ['2026-04', 'Abril'],
      ['2026-05', 'Mayo'],
      ['2026-06', 'Junio'],
      ['2026-07', 'Julio'],
      ['2026-08', 'Agosto'],
      ['2026-09', 'Septiembre'],
      ['2026-10', 'Octubre'],
      ['2026-11', 'Noviembre'],
      ['2026-12', 'Diciembre'],
    ] as const;

    for (const [month, name] of months) {
      const { unmount } = render(<PriceHeatmap month={month} days={[]} />);
      expect(screen.getByText(new RegExp(name))).toBeDefined();
      unmount();
    }
  });
});
