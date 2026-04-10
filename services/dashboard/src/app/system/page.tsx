'use client';

import { useEffect, useState } from 'react';
import { fetchSystemStatus } from '@/lib/api';

function StatusDot({ status }: { status: string }) {
  const ok = status === 'ok';
  return (
    <span style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      background: ok ? '#22c55e' : '#ef4444', marginRight: 8,
    }} />
  );
}

export default function SystemPage() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetchSystemStatus()
      .then(setStatus)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  if (loading) return <div>Cargando...</div>;
  if (!status) return <div>Error al cargar estado del sistema</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Estado del Sistema</h1>
        <button onClick={load} style={{
          padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: 6,
          fontSize: 14, cursor: 'pointer', background: '#fff',
        }}>
          Actualizar
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Base de Datos</h2>
          <div style={{ fontSize: 14 }}>
            <StatusDot status={status.postgres} />
            PostgreSQL: <strong>{status.postgres}</strong>
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Cache / Colas</h2>
          <div style={{ fontSize: 14 }}>
            <StatusDot status={status.redis} />
            Redis: <strong>{status.redis}</strong>
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 15 }}>Colas de Trabajo</h2>
        {typeof status.queues === 'object' && !status.queues.error ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                {['Cola', 'En espera', 'Activos', 'Completados', 'Fallidos'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#6b7280', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(status.queues).map(([name, counts]: [string, any]) => (
                <tr key={name} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 500 }}>{name}</td>
                  <td style={{ padding: '8px 12px' }}>{counts.waiting ?? 0}</td>
                  <td style={{ padding: '8px 12px' }}>{counts.active ?? 0}</td>
                  <td style={{ padding: '8px 12px' }}>{counts.completed ?? 0}</td>
                  <td style={{ padding: '8px 12px', color: counts.failed > 0 ? '#dc2626' : undefined }}>{counts.failed ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: '#ef4444' }}>{status.queues?.error ?? 'No se pudo conectar a las colas'}</div>
        )}
      </div>
    </div>
  );
}
