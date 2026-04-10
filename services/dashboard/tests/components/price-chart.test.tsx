import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PriceChart } from '@/components/price-chart';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => children,
  ComposedChart: ({ children }: any) => <div data-testid="composed-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
  Line: () => <div data-testid="line" />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ReferenceDot: () => <div data-testid="ref-dot" />,
}));

afterEach(() => cleanup());

describe('PriceChart', () => {
  it('renders empty state when no data', () => {
    render(<PriceChart data={[]} />);
    expect(screen.getByText('No hay datos de precios todavía')).toBeDefined();
  });

  it('renders chart when data is provided', () => {
    const data = [
      { date: '2026-06-01', minPrice: 500, avgPrice: 700, maxPrice: 900 },
      { date: '2026-06-02', minPrice: 480, avgPrice: 680, maxPrice: 880 },
    ];
    render(<PriceChart data={data} />);
    expect(screen.getByTestId('composed-chart')).toBeDefined();
  });

  it('renders three Line components and one Area for min/avg/max/band', () => {
    const data = [{ date: '2026-06-01', minPrice: 500, avgPrice: 700, maxPrice: 900 }];
    render(<PriceChart data={data} />);
    const lines = screen.getAllByTestId('line');
    expect(lines).toHaveLength(3);
    const areas = screen.getAllByTestId('area');
    expect(areas).toHaveLength(1);
  });

  it('does not render chart when data is empty', () => {
    render(<PriceChart data={[]} />);
    expect(screen.queryByTestId('composed-chart')).toBeNull();
  });

  it('renders ReferenceDot for each alert that matches a data date', () => {
    const data = [
      { date: '2026-06-01', minPrice: 500, avgPrice: 700, maxPrice: 900 },
      { date: '2026-06-02', minPrice: 480, avgPrice: 680, maxPrice: 880 },
    ];
    const alerts = [
      { date: '2026-06-01', level: 'urgent' },
      { date: '2026-06-02', level: 'good' },
    ];
    render(<PriceChart data={data} alerts={alerts} />);
    const dots = screen.getAllByTestId('ref-dot');
    expect(dots).toHaveLength(2);
  });

  it('does not render ReferenceDot when alert date has no matching data point', () => {
    const data = [{ date: '2026-06-01', minPrice: 500, avgPrice: 700, maxPrice: 900 }];
    const alerts = [{ date: '2026-06-99', level: 'good' }];
    render(<PriceChart data={data} alerts={alerts} />);
    expect(screen.queryByTestId('ref-dot')).toBeNull();
  });

  it('renders with no alerts prop (default empty)', () => {
    const data = [{ date: '2026-06-01', minPrice: 500, avgPrice: 700, maxPrice: 900 }];
    render(<PriceChart data={data} />);
    expect(screen.queryByTestId('ref-dot')).toBeNull();
  });
});
