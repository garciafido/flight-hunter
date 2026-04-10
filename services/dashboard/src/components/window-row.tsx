'use client';

export interface WindowRowProps {
  start: string;
  end: string;
  duration: number;
  minPrice: number;
  currency: string;
  resultCount: number;
  bookingUrl?: string;
  onBook?: () => void;
}

export function WindowRow({ start, end, duration, minPrice, currency, resultCount, bookingUrl, onBook }: WindowRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        border: '1px solid #e5e7eb',
        borderRadius: 6,
        background: '#fff',
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>
            {start} — {end}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {duration} día{duration !== 1 ? 's' : ''} · {resultCount} resultado{resultCount !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#2563eb' }}>
          {currency} {minPrice.toFixed(0)}
        </div>
      </div>
      {(bookingUrl || onBook) && (
        bookingUrl ? (
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '6px 14px',
              background: '#2563eb',
              color: '#fff',
              borderRadius: 4,
              fontSize: 13,
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Reservar
          </a>
        ) : (
          <button
            onClick={onBook}
            style={{
              padding: '6px 14px',
              background: '#2563eb',
              color: '#fff',
              borderRadius: 4,
              fontSize: 13,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Ver
          </button>
        )
      )}
    </div>
  );
}
