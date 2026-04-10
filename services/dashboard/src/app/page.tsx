'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchSearches, fetchAlerts } from '@/lib/api';

export default function HomePage() {
  const [searches, setSearches] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      Promise.all([fetchSearches(), fetchAlerts({ limit: 5 })])
        .then(([s, a]) => { setSearches(s); setAlerts(a); })
        .catch(console.error)
        .finally(() => setLoading(false));
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div>Cargando...</div>;

  return (
    <div>
      <h1 style={{ margin: '0 0 24px', fontSize: 24 }}>Dashboard</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Búsquedas Activas</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{searches.length}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Alertas Recientes</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{alerts.length}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Estado</div>
          <div style={{ fontSize: 14, color: '#16a34a', fontWeight: 600, marginTop: 8 }}>Operacional</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Búsquedas</h2>
            <Link href="/searches" style={{ fontSize: 13, color: '#2563eb' }}>Ver todas</Link>
          </div>
          {searches.slice(0, 5).map((s: any) => (
            <div key={s.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
              <Link href={`/searches/${s.id}`} style={{ color: '#1e293b', textDecoration: 'none', fontWeight: 500 }}>
                {s.name}
              </Link>
              <span style={{ marginLeft: 8, color: '#6b7280' }}>{s.origin} → {s.destination}</span>
            </div>
          ))}
          {searches.length === 0 && <div style={{ color: '#9ca3af', fontSize: 14 }}>No hay búsquedas activas</div>}
        </div>

        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Alertas Recientes</h2>
            <Link href="/alerts" style={{ fontSize: 13, color: '#2563eb' }}>Ver todas</Link>
          </div>
          {alerts.map((a: any) => {
            const fr = a.flightResult;
            const depDate = fr?.outbound?.departure?.time ? new Date(fr.outbound.departure.time).toLocaleDateString('es-CL') : '';
            const retDate = fr?.inbound?.departure?.time ? new Date(fr.inbound.departure.time).toLocaleDateString('es-CL') : '';
            const price = fr?.pricePerPerson ? `USD ${Math.round(Number(fr.pricePerPerson))}/pers` : '';
            const airline = fr?.outbound?.airline ?? '';
            return (
              <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{
                      padding: '1px 6px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                      background: a.level === 'urgent' ? '#fef2f2' : a.level === 'good' ? '#f0fdf4' : '#eff6ff',
                      color: a.level === 'urgent' ? '#dc2626' : a.level === 'good' ? '#16a34a' : '#2563eb',
                      marginRight: 8,
                    }}>
                      {a.level.toUpperCase()}
                    </span>
                    <strong>{price}</strong>
                    {airline && <span style={{ color: '#6b7280', marginLeft: 6 }}>{airline}</span>}
                  </div>
                  <span style={{ color: '#9ca3af', fontSize: 12 }}>{new Date(a.sentAt).toLocaleString('es-CL')}</span>
                </div>
                {depDate && (
                  <div style={{ marginTop: 4, fontSize: 13, color: '#6b7280', paddingLeft: 50 }}>
                    {depDate} → {retDate}
                  </div>
                )}
              </div>
            );
          })}
          {alerts.length === 0 && <div style={{ color: '#9ca3af', fontSize: 14 }}>No hay alertas recientes</div>}
        </div>
      </div>
    </div>
  );
}
