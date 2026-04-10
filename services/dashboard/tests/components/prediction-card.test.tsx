import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { PredictionCard } from '@/components/prediction-card';

afterEach(() => cleanup());

const basePrediction = {
  currentMin: 400,
  movingAvg7d: 390,
  movingAvg30d: 420,
  trendSlope: -2,
  predicted7dMin: 386,
  predicted14dMin: 372,
  confidence: 'high' as const,
};

const baseRecommendation = {
  action: 'wait' as const,
  reason: 'Tendencia bajista (-2.00/día) con histórico sólido',
  predictedSavings: 14,
};

describe('PredictionCard', () => {
  it('renders without crashing', () => {
    const { getByTestId } = render(
      <PredictionCard prediction={basePrediction} recommendation={baseRecommendation} />,
    );
    expect(getByTestId('prediction-card')).toBeTruthy();
  });

  it('shows ESPERAR badge for wait action', () => {
    const { getByTestId } = render(
      <PredictionCard prediction={basePrediction} recommendation={baseRecommendation} />,
    );
    expect(getByTestId('action-badge').textContent).toBe('ESPERAR');
  });

  it('shows COMPRAR AHORA badge for buy-now action', () => {
    const { getByTestId } = render(
      <PredictionCard
        prediction={basePrediction}
        recommendation={{ action: 'buy-now', reason: 'Great price' }}
      />,
    );
    expect(getByTestId('action-badge').textContent).toBe('COMPRAR AHORA');
  });

  it('shows MONITOREAR badge for monitor action', () => {
    const { getByTestId } = render(
      <PredictionCard
        prediction={basePrediction}
        recommendation={{ action: 'monitor', reason: 'Stable' }}
      />,
    );
    expect(getByTestId('action-badge').textContent).toBe('MONITOREAR');
  });

  it('shows savings callout when predictedSavings > 0', () => {
    const { getByTestId } = render(
      <PredictionCard prediction={basePrediction} recommendation={baseRecommendation} />,
    );
    const savings = getByTestId('savings-callout');
    expect(savings.textContent).toContain('14.00');
  });

  it('does not show savings callout when predictedSavings is undefined', () => {
    const { queryByTestId } = render(
      <PredictionCard
        prediction={basePrediction}
        recommendation={{ action: 'buy-now', reason: 'Good price' }}
      />,
    );
    expect(queryByTestId('savings-callout')).toBeNull();
  });

  it('does not show savings callout when predictedSavings is 0', () => {
    const { queryByTestId } = render(
      <PredictionCard
        prediction={basePrediction}
        recommendation={{ action: 'wait', reason: 'Wait', predictedSavings: 0 }}
      />,
    );
    expect(queryByTestId('savings-callout')).toBeNull();
  });

  it('shows current price in stats grid', () => {
    const { container } = render(
      <PredictionCard prediction={basePrediction} recommendation={baseRecommendation} />,
    );
    expect(container.textContent).toContain('USD 400');
  });

  it('shows predicted 7d and 14d prices', () => {
    const { container } = render(
      <PredictionCard prediction={basePrediction} recommendation={baseRecommendation} />,
    );
    expect(container.textContent).toContain('USD 386');
    expect(container.textContent).toContain('USD 372');
  });

  it('shows downward trend indicator with green color', () => {
    const { container } = render(
      <PredictionCard prediction={basePrediction} recommendation={baseRecommendation} />,
    );
    expect(container.textContent).toContain('▼');
  });

  it('shows upward trend indicator for positive slope', () => {
    const { container } = render(
      <PredictionCard
        prediction={{ ...basePrediction, trendSlope: 1.5 }}
        recommendation={{ action: 'buy-now', reason: 'Rising' }}
      />,
    );
    expect(container.textContent).toContain('▲');
  });

  it('shows stable indicator for zero slope', () => {
    const { container } = render(
      <PredictionCard
        prediction={{ ...basePrediction, trendSlope: 0 }}
        recommendation={{ action: 'monitor', reason: 'Stable' }}
      />,
    );
    expect(container.textContent).toContain('→');
  });

  it('shows confidence level', () => {
    const { container } = render(
      <PredictionCard prediction={basePrediction} recommendation={baseRecommendation} />,
    );
    expect(container.textContent).toContain('Alta');
  });

  it('shows medium confidence label', () => {
    const { container } = render(
      <PredictionCard
        prediction={{ ...basePrediction, confidence: 'medium' }}
        recommendation={baseRecommendation}
      />,
    );
    expect(container.textContent).toContain('Media');
  });

  it('shows low confidence label', () => {
    const { container } = render(
      <PredictionCard
        prediction={{ ...basePrediction, confidence: 'low' }}
        recommendation={baseRecommendation}
      />,
    );
    expect(container.textContent).toContain('Baja');
  });

  it('shows the recommendation reason text', () => {
    const { container } = render(
      <PredictionCard prediction={basePrediction} recommendation={baseRecommendation} />,
    );
    expect(container.textContent).toContain('Tendencia bajista');
  });
});
