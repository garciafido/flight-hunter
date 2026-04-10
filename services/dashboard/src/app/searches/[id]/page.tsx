'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { fetchSearch, fetchResults, fetchCombos, fetchSuspiciousResults, promoteResult } from '@/lib/api';
import { FlightCard } from '@/components/flight-card';
import { PriceChart } from '@/components/price-chart';

export default function SearchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [search, setSearch] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);
  const [combos, setCombos] = useState<any[]>([]);
  const [sort, setSort] = useState('date');
  const [loading, setLoading] = useState(true);
  const [suspicious, setSuspicious] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchSearch(id), fetchResults(id, { sort, limit: 20 }), fetchSuspiciousResults(id)])
      .then(([s, r, susp]) => {
        setSearch(s);
        setResults(r);
        setSuspicious(susp);
        if (s.mode === 'split') {
          fetchCombos(id).then(setCombos).catch(console.error);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id, sort]);

  if (loading) return <div>Cargando...</div>;
  if (!search) return <div>Búsqueda no encontrada</div>;

  // Build chart data from results grouped by date
  const dateMap: Record<string, number[]> = {};
  results.forEach((r: any) => {
    const date = new Date(r.scrapedAt).toISOString().split('T')[0];
    if (!dateMap[date]) dateMap[date] = [];
    dateMap[date].push(Number(r.pricePerPerson));
  });
  const chartData = Object.entries(dateMap).map(([date, prices]) => ({
    date,
    minPrice: Math.min(...prices),
    avgPrice: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    maxPrice: Math.max(...prices),
  })).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Link href="/searches" style={{ color: '#2563eb', fontSize: 14 }}>← Búsquedas</Link>
          <h1 style={{ margin: '4px 0 0', fontSize: 24 }}>{search.name}</h1>
          <div style={{ color: '#6b7280', fontSize: 14 }}>{search.origin} → {search.destination}</div>
        </div>
        <Link href={`/searches/${id}/settings`} style={{
          padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: 6,
          fontSize: 14, color: '#374151', textDecoration: 'none',
        }}>
          Configuración
        </Link>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24, marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>Historial de Precios</h2>
        <PriceChart data={chartData} />
      </div>

      {search.mode === 'split' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24, marginBottom: 24 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>Mejores Combinaciones Split ({combos.length})</h2>
          {combos.length === 0 && <div style={{ color: '#9ca3af' }}>No hay combinaciones todavía. Los combos se generan automáticamente cuando se encuentran resultados para todos los tramos.</div>}
          {combos.map((combo: any, ci: number) => (
            <div key={combo.id ?? ci} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 18 }}>{combo.currency} {Number(combo.totalPrice).toFixed(0)} total</span>
                  {combo.alertLevel && (
                    <span style={{
                      marginLeft: 10, padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                      background: combo.alertLevel === 'urgent' ? '#fee2e2' : combo.alertLevel === 'good' ? '#dcfce7' : '#f3f4f6',
                      color: combo.alertLevel === 'urgent' ? '#dc2626' : combo.alertLevel === 'good' ? '#16a34a' : '#6b7280',
                    }}>
                      {combo.alertLevel.toUpperCase()}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 13, color: '#6b7280' }}>Score: {Number(combo.score).toFixed(0)}/100</span>
              </div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                {combo.flightResultIds?.length ?? 0} vuelo(s) — {new Date(combo.createdAt).toLocaleString('es')}
              </div>
            </div>
          ))}
        </div>
      )}

      {suspicious.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #fbbf24', borderRadius: 8, padding: 24, marginBottom: 24 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16, color: '#92400e' }}>
            Resultados sospechosos ({suspicious.length})
          </h2>
          {suspicious.map((r: any) => (
            <div key={r.id} style={{
              border: '1px solid #fde68a', borderRadius: 6, padding: 16, marginBottom: 12,
              background: '#fffbeb',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>
                    {r.currency} {Number(r.totalPrice ?? r.pricePerPerson).toFixed(0)}
                  </div>
                  <div style={{ fontSize: 13, color: '#374151', marginTop: 4 }}>
                    {r.outbound?.airline ?? '—'} · {r.outbound?.departure?.airport ?? '—'} → {r.inbound?.departure?.airport ?? '—'}
                  </div>
                  <div style={{ fontSize: 13, color: '#374151' }}>
                    Salida: {r.outbound?.departure?.time ? new Date(r.outbound.departure.time).toLocaleDateString('es') : '—'}
                    {' · '}
                    Regreso: {r.inbound?.arrival?.time ? new Date(r.inbound.arrival.time).toLocaleDateString('es') : '—'}
                  </div>
                  {r.suspicionReason && (
                    <div style={{ fontSize: 12, color: '#b45309', marginTop: 6, fontStyle: 'italic' }}>
                      Motivo: {r.suspicionReason}
                    </div>
                  )}
                </div>
                <button
                  onClick={async () => {
                    try {
                      await promoteResult(r.id);
                      setSuspicious((prev) => prev.filter((x) => x.id !== r.id));
                    } catch {
                      console.error('Failed to promote result', r.id);
                    }
                  }}
                  style={{
                    padding: '6px 14px', background: '#f59e0b', border: 'none',
                    borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#fff',
                  }}
                >
                  Promover
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Resultados por Tramo ({results.length})</h2>
          <select value={sort} onChange={e => setSort(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}>
            <option value="date">Más reciente</option>
            <option value="price">Menor precio</option>
            <option value="score">Mayor score</option>
          </select>
        </div>
        {results.map((r: any) => (
          <FlightCard
            key={r.id}
            airline={r.outbound?.airline ?? '—'}
            departureAirport={r.outbound?.departure?.airport ?? search.origin}
            arrivalAirport={r.inbound?.departure?.airport ?? search.destination}
            departureTime={r.outbound?.departure?.time ?? r.scrapedAt}
            returnTime={r.inbound?.arrival?.time ?? r.scrapedAt}
            price={Number(r.pricePerPerson)}
            currency={r.currency}
            score={Number(r.score ?? 0)}
            alertLevel={r.alertLevel ?? undefined}
            bookingUrl={r.bookingUrl}
            stopoverAirport={r.stopoverInfo?.airport}
            stopoverDays={r.stopoverInfo?.durationDays}
          />
        ))}
        {results.length === 0 && <div style={{ color: '#9ca3af' }}>No hay resultados todavía</div>}
      </div>
    </div>
  );
}
