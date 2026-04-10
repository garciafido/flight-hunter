'use client';

export interface DestinationCardProps {
  iata: string;
  minPrice: number;
  currency: string;
  resultCount: number;
  onClick?: () => void;
}

export function DestinationCard({ iata, minPrice, currency, resultCount, onClick }: DestinationCardProps) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: '16px 20px',
        background: '#fff',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2937' }}>{iata}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#2563eb' }}>
        {currency} {minPrice.toFixed(0)}
      </div>
      <div style={{ fontSize: 12, color: '#9ca3af' }}>
        {resultCount} resultado{resultCount !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
