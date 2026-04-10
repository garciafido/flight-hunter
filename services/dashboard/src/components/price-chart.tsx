import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface PriceChartProps {
  data: Array<{ date: string; minPrice: number; avgPrice: number; maxPrice: number }>;
}

export function PriceChart({ data }: PriceChartProps) {
  if (data.length === 0) return <div>No hay datos de precios todavía</div>;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="minPrice" stroke="#22c55e" name="Mínimo" />
        <Line type="monotone" dataKey="avgPrice" stroke="#3b82f6" name="Promedio" />
        <Line type="monotone" dataKey="maxPrice" stroke="#ef4444" name="Máximo" />
      </LineChart>
    </ResponsiveContainer>
  );
}
