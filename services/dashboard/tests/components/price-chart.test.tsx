import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PriceChart } from '@/components/price-chart';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => children,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
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
    expect(screen.getByTestId('line-chart')).toBeDefined();
  });

  it('renders three Line components for min/avg/max', () => {
    const data = [{ date: '2026-06-01', minPrice: 500, avgPrice: 700, maxPrice: 900 }];
    render(<PriceChart data={data} />);
    const lines = screen.getAllByTestId('line');
    expect(lines).toHaveLength(3);
  });

  it('does not render chart when data is empty', () => {
    render(<PriceChart data={[]} />);
    expect(screen.queryByTestId('line-chart')).toBeNull();
  });
});
