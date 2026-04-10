import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts';

interface PriceChartProps {
  data: Array<{ date: string; minPrice: number; avgPrice: number; maxPrice: number }>;
  alerts?: Array<{ date: string; level: string }>;
}

function alertColor(level: string): string {
  if (level === 'urgent') return '#dc2626';
  if (level === 'good') return '#16a34a';
  return '#3b82f6';
}

export function PriceChart({ data, alerts = [] }: PriceChartProps) {
  if (data.length === 0) return <div>No hay datos de precios todavía</div>;

  // Build alert lookup: date → level
  const alertMap = new Map<string, string>();
  for (const a of alerts) {
    alertMap.set(a.date, a.level);
  }

  // Recharts Area needs [min, max] via dataKey returning [min, max]
  const chartData = data.map((d) => ({
    ...d,
    range: [d.minPrice, d.maxPrice] as [number, number],
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis />
        <Tooltip
          formatter={(value: any, name: string) => {
            if (name === 'range') return null;
            return [value, name];
          }}
          labelFormatter={(label) => {
            const alert = alertMap.get(label);
            return alert ? `${label} (alerta: ${alert})` : label;
          }}
        />
        <Area
          type="monotone"
          dataKey="range"
          stroke="none"
          fill="#bfdbfe"
          fillOpacity={0.5}
          name="Banda min-max"
        />
        <Line type="monotone" dataKey="minPrice" stroke="#22c55e" dot={false} name="Mínimo" />
        <Line type="monotone" dataKey="avgPrice" stroke="#3b82f6" dot={false} name="Promedio" />
        <Line type="monotone" dataKey="maxPrice" stroke="#ef4444" dot={false} name="Máximo" />
        {alerts.map((a, i) => {
          const point = chartData.find((d) => d.date === a.date);
          if (!point) return null;
          return (
            <ReferenceDot
              key={i}
              x={a.date}
              y={point.minPrice}
              r={6}
              fill={alertColor(a.level)}
              stroke="#fff"
              strokeWidth={2}
              label={{ value: a.level[0].toUpperCase(), position: 'top', fontSize: 10 }}
            />
          );
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
