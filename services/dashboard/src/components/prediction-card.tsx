interface PricePrediction {
  currentMin: number;
  movingAvg7d: number;
  movingAvg30d: number;
  trendSlope: number;
  predicted7dMin: number;
  predicted14dMin: number;
  confidence: 'low' | 'medium' | 'high';
}

type BuyAction = 'buy-now' | 'wait' | 'monitor';

interface BuyRecommendation {
  action: BuyAction;
  reason: string;
  predictedSavings?: number;
}

interface PredictionCardProps {
  prediction: PricePrediction;
  recommendation: BuyRecommendation;
}

const ACTION_CONFIG: Record<BuyAction, { label: string; bg: string; color: string; border: string }> = {
  'buy-now': { label: 'COMPRAR AHORA', bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  'wait': { label: 'ESPERAR', bg: '#fef9c3', color: '#854d0e', border: '#fde047' },
  'monitor': { label: 'MONITOREAR', bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
};

const CONFIDENCE_LABELS: Record<PricePrediction['confidence'], string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

export function PredictionCard({ prediction, recommendation }: PredictionCardProps) {
  const actionCfg = ACTION_CONFIG[recommendation.action];
  const trendUp = prediction.trendSlope > 0;
  const trendDown = prediction.trendSlope < 0;
  const trendLabel = trendUp
    ? `▲ +${prediction.trendSlope.toFixed(2)}/día`
    : trendDown
    ? `▼ ${prediction.trendSlope.toFixed(2)}/día`
    : '→ estable';
  const trendColor = trendUp ? '#ef4444' : trendDown ? '#22c55e' : '#6b7280';

  return (
    <div
      data-testid="prediction-card"
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: 24,
        marginBottom: 24,
      }}
    >
      <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>Predicción de Precios</h2>

      {/* Action badge */}
      <div
        data-testid="action-badge"
        style={{
          display: 'inline-block',
          padding: '8px 18px',
          borderRadius: 6,
          background: actionCfg.bg,
          color: actionCfg.color,
          border: `1px solid ${actionCfg.border}`,
          fontWeight: 700,
          fontSize: 16,
          marginBottom: 12,
        }}
      >
        {actionCfg.label}
      </div>

      {/* Reason */}
      <div style={{ color: '#374151', fontSize: 14, marginBottom: 12 }}>
        {recommendation.reason}
      </div>

      {/* Savings callout */}
      {recommendation.predictedSavings !== undefined && recommendation.predictedSavings > 0 && (
        <div
          data-testid="savings-callout"
          style={{
            background: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: 6,
            padding: '8px 14px',
            fontSize: 14,
            color: '#15803d',
            marginBottom: 12,
          }}
        >
          Ahorro estimado esperando 7 días: <strong>USD {recommendation.predictedSavings.toFixed(2)}</strong>
        </div>
      )}

      {/* Stats grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginTop: 16,
        }}
      >
        <Stat label="Precio actual" value={`USD ${prediction.currentMin.toFixed(0)}`} />
        <Stat label="Pred. 7 días" value={`USD ${prediction.predicted7dMin.toFixed(0)}`} />
        <Stat label="Pred. 14 días" value={`USD ${prediction.predicted14dMin.toFixed(0)}`} />
        <Stat label="Promedio 7d" value={`USD ${prediction.movingAvg7d.toFixed(0)}`} />
        <Stat label="Promedio 30d" value={`USD ${prediction.movingAvg30d.toFixed(0)}`} />
        <StatTrend label="Tendencia" value={trendLabel} color={trendColor} />
      </div>

      {/* Confidence indicator */}
      <div style={{ marginTop: 12, fontSize: 12, color: '#9ca3af' }}>
        Confianza: <span style={{ fontWeight: 600, color: '#6b7280' }}>{CONFIDENCE_LABELS[prediction.confidence]}</span>
        {' · '}
        Basado en historial de precios
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#f9fafb', borderRadius: 6, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{value}</div>
    </div>
  );
}

function StatTrend({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#f9fafb', borderRadius: 6, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color }}>{value}</div>
    </div>
  );
}
