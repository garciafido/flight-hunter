'use client';

import { useEffect, useState } from 'react';
import { fetchAlerts, fetchSearches, submitAlertFeedback } from '@/lib/api';
import { AlertBadge } from '@/components/alert-badge';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [searches, setSearches] = useState<any[]>([]);
  const [searchId, setSearchId] = useState('');
  const [loading, setLoading] = useState(true);
  const [feedbackState, setFeedbackState] = useState<Record<string, 'positive' | 'negative' | 'pending'>>({});

  useEffect(() => {
    fetchSearches().then(setSearches).catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    const load = () => {
      fetchAlerts({ searchId: searchId || undefined, limit: 50 })
        .then((data) => {
          setAlerts(data);
          // Restore existing feedback from server data
          const serverFeedback: Record<string, 'positive' | 'negative'> = {};
          data.forEach((a: any) => {
            if (a.feedback === 'positive' || a.feedback === 'negative') {
              serverFeedback[a.id] = a.feedback;
            }
          });
          setFeedbackState((prev) => ({ ...serverFeedback, ...prev }));
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [searchId]);

  async function handleFeedback(alertId: string, value: 'positive' | 'negative') {
    setFeedbackState((prev) => ({ ...prev, [alertId]: 'pending' as any }));
    try {
      await submitAlertFeedback(alertId, value);
      setFeedbackState((prev) => ({ ...prev, [alertId]: value }));
    } catch {
      setFeedbackState((prev) => {
        const next = { ...prev };
        delete next[alertId];
        return next;
      });
    }
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 24px', fontSize: 24 }}>Alertas</h1>

      <div style={{ marginBottom: 20 }}>
        <select value={searchId} onChange={e => setSearchId(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14 }}>
          <option value="">Todas las búsquedas</option>
          {searches.map((s: any) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {loading && <div>Cargando...</div>}

      {!loading && alerts.length === 0 && (
        <div style={{ color: '#9ca3af', textAlign: 'center', paddingTop: 64 }}>No hay alertas</div>
      )}

      {alerts.map((a: any) => {
        const fb = feedbackState[a.id];
        return (
          <div key={a.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertBadge level={a.level} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {a.flightResult?.currency} {Number(a.flightResult?.pricePerPerson).toLocaleString()}
                    {' '}/ persona
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    Enviado: {new Date(a.sentAt).toLocaleString('es-CL')} · Canales: {a.channelsSent?.join(', ')}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Feedback buttons */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => handleFeedback(a.id, 'positive')}
                    disabled={fb === 'pending' || fb === 'positive' || fb === 'negative'}
                    title="Buena oferta"
                    style={{
                      padding: '4px 8px', borderRadius: 4, fontSize: 14, cursor: fb ? 'default' : 'pointer',
                      border: `1px solid ${fb === 'positive' ? '#22c55e' : '#d1d5db'}`,
                      background: fb === 'positive' ? '#dcfce7' : '#fff',
                      opacity: fb === 'pending' ? 0.5 : 1,
                    }}
                  >
                    👍
                  </button>
                  <button
                    onClick={() => handleFeedback(a.id, 'negative')}
                    disabled={fb === 'pending' || fb === 'positive' || fb === 'negative'}
                    title="No era buena oferta"
                    style={{
                      padding: '4px 8px', borderRadius: 4, fontSize: 14, cursor: fb ? 'default' : 'pointer',
                      border: `1px solid ${fb === 'negative' ? '#ef4444' : '#d1d5db'}`,
                      background: fb === 'negative' ? '#fee2e2' : '#fff',
                      opacity: fb === 'pending' ? 0.5 : 1,
                    }}
                  >
                    👎
                  </button>
                </div>
                {a.flightResult?.bookingUrl && (
                  <a href={a.flightResult.bookingUrl} target="_blank" rel="noopener noreferrer"
                    style={{ color: '#2563eb', fontSize: 13 }}>
                    Ver vuelo →
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
