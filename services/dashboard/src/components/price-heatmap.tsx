'use client';

export interface HeatmapDay {
  date: string;
  minPrice: number;
  currency: string;
  resultCount: number;
}

export interface PriceHeatmapProps {
  month: string; // "YYYY-MM"
  days: HeatmapDay[];
  targetPrice?: number;
  maxPrice?: number;
}

const DAY_LABELS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

function getDayColor(
  price: number,
  targetPrice?: number,
  maxPrice?: number,
): string {
  if (targetPrice !== undefined && price <= targetPrice) return '#16a34a'; // green
  if (maxPrice !== undefined && price <= maxPrice) return '#d97706'; // yellow/amber
  return '#dc2626'; // red
}

export function PriceHeatmap({ month, days, targetPrice, maxPrice }: PriceHeatmapProps) {
  const [year, monthNum] = month.split('-').map(Number);
  const firstDay = new Date(year, monthNum - 1, 1);
  const lastDay = new Date(year, monthNum, 0);
  const totalDays = lastDay.getDate();

  // Weekday of first day: 0=Sun → remap to Mon=0
  const startWeekday = (firstDay.getDay() + 6) % 7; // Monday-first offset

  const dayMap = new Map<string, HeatmapDay>();
  for (const d of days) {
    dayMap.set(d.date, d);
  }

  // Build grid cells
  const cells: Array<{ day: number | null; data: HeatmapDay | null }> = [];

  // Leading empty cells
  for (let i = 0; i < startWeekday; i++) {
    cells.push({ day: null, data: null });
  }

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, data: dayMap.get(dateStr) ?? null });
  }

  // Trailing empty cells
  while (cells.length % 7 !== 0) {
    cells.push({ day: null, data: null });
  }

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>
        {monthNames[monthNum - 1]} {year}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, maxWidth: 420 }}>
        {DAY_LABELS.map((label) => (
          <div key={label} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#6b7280', padding: '4px 0' }}>
            {label}
          </div>
        ))}
        {cells.map((cell, idx) => {
          if (cell.day === null) {
            return <div key={`empty-${idx}`} style={{ padding: 8 }} />;
          }

          if (cell.data === null) {
            // In range but no data
            return (
              <div
                key={`day-${cell.day}`}
                style={{
                  background: '#f3f4f6',
                  borderRadius: 4,
                  padding: 8,
                  textAlign: 'center',
                  fontSize: 12,
                  color: '#9ca3af',
                }}
              >
                {cell.day}
              </div>
            );
          }

          const color = getDayColor(cell.data.minPrice, targetPrice, maxPrice);
          return (
            <div
              key={`day-${cell.day}`}
              title={`${cell.data.currency} ${cell.data.minPrice} (${cell.data.resultCount} vuelo${cell.data.resultCount !== 1 ? 's' : ''})`}
              style={{
                background: color,
                borderRadius: 4,
                padding: 8,
                textAlign: 'center',
                fontSize: 12,
                color: '#fff',
                cursor: 'default',
                fontWeight: 600,
              }}
            >
              {cell.day}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 12, color: '#6b7280' }}>
        {targetPrice !== undefined && (
          <span><span style={{ color: '#16a34a', fontWeight: 700 }}>●</span> Bajo objetivo</span>
        )}
        {maxPrice !== undefined && (
          <span><span style={{ color: '#d97706', fontWeight: 700 }}>●</span> Sobre objetivo</span>
        )}
        <span><span style={{ color: '#dc2626', fontWeight: 700 }}>●</span> Alto</span>
        <span><span style={{ color: '#9ca3af', fontWeight: 700 }}>●</span> Sin datos</span>
      </div>
    </div>
  );
}
