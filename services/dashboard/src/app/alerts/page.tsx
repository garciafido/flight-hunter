'use client';

import { useEffect, useState } from 'react';
import { fetchAlerts, fetchSearches, submitAlertFeedback, deleteAlerts } from '@/lib/api';
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

  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function formatDate(iso: string | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    const isMidnightUtc = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
    if (isMidnightUtc) {
      return d.toLocaleDateString('es-CL', { timeZone: 'UTC' });
    }
    return d.toLocaleString('es-CL', {
      timeZone: 'UTC',
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }

  function buildShareText(alert: any, searchName: string): string {
    const combo = alert.comboInfo as { legs?: any[]; totalPrice?: number; plan?: any } | null;
    const isCombo = !!(combo && Array.isArray(combo.legs) && combo.legs.length > 0);
    const levelEmoji = alert.level === 'urgent' ? '🚨' : alert.level === 'good' ? '✅' : 'ℹ️';

    if (isCombo) {
      const currency = combo!.legs![0]?.currency ?? 'USD';
      const totalPrice = combo!.totalPrice;
      const lines: string[] = [];
      lines.push(`${levelEmoji} *${searchName}*`);
      if (combo!.plan) {
        const positionLabel =
          combo!.plan.position === 'start' ? 'al inicio' :
          combo!.plan.position === 'end' ? 'al final' : '';
        lines.push(`🏨 ${combo!.plan.days}d en ${combo!.plan.airport} ${positionLabel}`.trim());
      }
      lines.push(`💰 *${currency} ${totalPrice} / persona* (${combo!.legs!.length} tramos)`);
      lines.push('');
      combo!.legs!.forEach((leg: any, idx: number) => {
        const dep = formatDate(leg.departureTime);
        lines.push(`*${idx + 1}.* ${leg.departureAirport} → ${leg.arrivalAirport} — ${leg.airline}`);
        if (dep) lines.push(`   📅 ${dep} (hora local)`);
        lines.push(`   💵 ${leg.currency} ${leg.price}`);
        if (leg.bookingUrl) lines.push(`   🔗 ${leg.bookingUrl}`);
        lines.push('');
      });
      return lines.join('\n').trimEnd();
    }

    // Single flight
    const fr = alert.flightResult;
    const lines: string[] = [];
    lines.push(`${levelEmoji} *${searchName}*`);
    lines.push(`✈️ ${fr?.outbound?.airline ?? ''} ${fr?.outbound?.departure?.airport ?? ''} → ${fr?.outbound?.arrival?.airport ?? ''}`);
    lines.push(`💰 *${fr?.currency} ${Number(fr?.pricePerPerson ?? 0).toLocaleString()} / persona*`);
    const dep = formatDate(fr?.outbound?.departure?.time);
    const ret = formatDate(fr?.inbound?.departure?.time);
    if (dep) lines.push(`📅 Ida: ${dep}`);
    if (ret) lines.push(`📅 Vuelta: ${ret}`);
    if (fr?.bookingUrl) {
      lines.push('');
      lines.push(`🔗 ${fr.bookingUrl}`);
    }
    return lines.join('\n');
  }

  async function handleCopyShare(alert: any) {
    const searchName = searches.find((s: any) => s.id === alert.searchId)?.name ?? 'Vuelo';
    const text = buildShareText(alert, searchName);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(alert.id);
      setTimeout(() => setCopiedId((current) => (current === alert.id ? null : current)), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
      setCopiedId(alert.id);
      setTimeout(() => setCopiedId((current) => (current === alert.id ? null : current)), 2000);
    }
  }

  async function runDelete(filter: Parameters<typeof deleteAlerts>[0], confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setDeleting(true);
    setDeleteMsg(null);
    try {
      const res = await deleteAlerts({ ...filter, searchId: searchId || undefined });
      setDeleteMsg(`Borradas ${res.deleted} alertas`);
      // Reload immediately
      const data = await fetchAlerts({ searchId: searchId || undefined, limit: 50 });
      setAlerts(data);
    } catch (e: any) {
      setDeleteMsg(`Error: ${e?.message ?? e}`);
    } finally {
      setDeleting(false);
      setTimeout(() => setDeleteMsg(null), 4000);
    }
  }

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

  const btnStyle: React.CSSProperties = {
    padding: '4px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    fontSize: 12,
    cursor: deleting ? 'not-allowed' : 'pointer',
    background: '#fff',
    color: '#374151',
    opacity: deleting ? 0.5 : 1,
  };

  return (
    <div>
      <h1 style={{ margin: '0 0 24px', fontSize: 24 }}>Alertas</h1>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <select value={searchId} onChange={e => setSearchId(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14 }}>
          <option value="">Todas las búsquedas</option>
          {searches.map((s: any) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
        padding: '12px 16px', marginBottom: 20, display: 'flex',
        flexWrap: 'wrap', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 13, color: '#6b7280', marginRight: 4 }}>Borrar:</span>

        <button onClick={() => runDelete({ olderThanHours: 1 })} disabled={deleting}
          style={btnStyle}>Última hora</button>
        <button onClick={() => runDelete({ olderThanHours: 24 })} disabled={deleting}
          style={btnStyle}>Últimas 24h</button>
        <button onClick={() => runDelete({ olderThanDays: 7 })} disabled={deleting}
          style={btnStyle}>Últimos 7 días</button>

        <span style={{ borderLeft: '1px solid #e5e7eb', height: 20, marginLeft: 4 }} />

        <button onClick={() => runDelete({ keepLast: 10 })} disabled={deleting}
          style={btnStyle}>Dejar últimas 10</button>
        <button onClick={() => runDelete({ keepLast: 50 })} disabled={deleting}
          style={btnStyle}>Dejar últimas 50</button>

        <span style={{ borderLeft: '1px solid #e5e7eb', height: 20, marginLeft: 4 }} />

        <button
          onClick={() => runDelete(
            searchId ? { all: true } : { all: true },
            searchId
              ? '¿Borrar TODAS las alertas de esta búsqueda?'
              : '¿Borrar TODAS las alertas? Esta acción no se puede deshacer.',
          )}
          disabled={deleting}
          style={{ ...btnStyle, color: '#dc2626', borderColor: '#fca5a5' }}>
          Borrar todas
        </button>

        {deleteMsg && (
          <span style={{
            fontSize: 13,
            color: deleteMsg.startsWith('Error') ? '#dc2626' : '#16a34a',
            marginLeft: 8,
          }}>
            {deleteMsg}
          </span>
        )}
      </div>

      {loading && <div>Cargando...</div>}

      {!loading && alerts.length === 0 && (
        <div style={{ color: '#9ca3af', textAlign: 'center', paddingTop: 64 }}>No hay alertas</div>
      )}

      {alerts.map((a: any) => {
        const fb = feedbackState[a.id];
        const combo = a.comboInfo as { legs?: any[]; totalPrice?: number } | null;
        const isCombo = !!(combo && Array.isArray(combo.legs) && combo.legs.length > 0);
        const displayPrice = isCombo
          ? combo!.totalPrice
          : Number(a.flightResult?.pricePerPerson);
        const displayCurrency = isCombo
          ? combo!.legs![0]?.currency ?? a.flightResult?.currency
          : a.flightResult?.currency;
        return (
          <div key={a.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertBadge level={a.level} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {displayCurrency} {Number(displayPrice ?? 0).toLocaleString()}
                    {' '}/ persona
                    {isCombo && (
                      <span style={{
                        marginLeft: 8, fontSize: 11, fontWeight: 600,
                        background: '#eff6ff', color: '#1d4ed8',
                        padding: '2px 8px', borderRadius: 10,
                      }}>
                        {combo!.legs!.length} tramos
                      </span>
                    )}
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
                <button
                  onClick={() => handleCopyShare(a)}
                  title="Copiar texto para enviar por WhatsApp"
                  style={{
                    padding: '4px 10px', borderRadius: 4, fontSize: 12,
                    cursor: 'pointer',
                    border: `1px solid ${copiedId === a.id ? '#22c55e' : '#d1d5db'}`,
                    background: copiedId === a.id ? '#dcfce7' : '#fff',
                    color: copiedId === a.id ? '#166534' : '#374151',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {copiedId === a.id ? '✓ Copiado' : '📋 Compartir'}
                </button>
                {!isCombo && a.flightResult?.bookingUrl && (
                  <a href={a.flightResult.bookingUrl} target="_blank" rel="noopener noreferrer"
                    style={{ color: '#2563eb', fontSize: 13 }}>
                    Ver vuelo →
                  </a>
                )}
              </div>
            </div>

            {isCombo && (
              <div style={{
                marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                {combo!.legs!.map((leg: any, idx: number) => (
                  <div key={idx} style={{
                    display: 'grid',
                    gridTemplateColumns: '24px 1fr auto auto',
                    gap: 12, alignItems: 'center', fontSize: 13,
                  }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: '#eff6ff', color: '#1d4ed8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 600,
                    }}>
                      {idx + 1}
                    </span>
                    <div>
                      <div style={{ fontWeight: 500 }}>
                        {leg.departureAirport} → {leg.arrivalAirport}
                        {leg.airline && (
                          <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: 8 }}>
                            {leg.airline}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                        {(() => {
                          // We store the times as the wall-clock at the airport
                          // (encoded into UTC just to fit the schema). Render them
                          // verbatim with timeZone: 'UTC' so the user sees the same
                          // hours that appeared on Google Flights, and label them
                          // as "hora local del vuelo" so it's not ambiguous.
                          const fmt = (iso: string | undefined) => {
                            if (!iso) return null;
                            const d = new Date(iso);
                            const isMidnightUtc = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
                            return isMidnightUtc
                              ? { text: d.toLocaleDateString('es-CL', { timeZone: 'UTC' }), withTime: false }
                              : {
                                  text: d.toLocaleString('es-CL', {
                                    timeZone: 'UTC',
                                    dateStyle: 'short',
                                    timeStyle: 'short',
                                  }),
                                  withTime: true,
                                };
                          };
                          const dep = fmt(leg.departureTime);
                          const arr = fmt(leg.arrivalTime);
                          const hasAnyTime = (dep && dep.withTime) || (arr && arr.withTime);
                          return (
                            <>
                              Salida: {dep?.text ?? '—'}
                              {arr && <> · Llegada: {arr.text}</>}
                              {hasAnyTime && (
                                <span style={{ marginLeft: 6, color: '#cbd5e1', fontStyle: 'italic' }}>
                                  (hora local del vuelo)
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                      {leg.currency} {Number(leg.price ?? 0).toLocaleString()}
                    </div>
                    {leg.bookingUrl && (
                      <a href={leg.bookingUrl} target="_blank" rel="noopener noreferrer"
                        style={{ color: '#2563eb', fontSize: 12, whiteSpace: 'nowrap' }}>
                        Reservar →
                      </a>
                    )}
                  </div>
                ))}
                <div style={{
                  marginTop: 4, paddingTop: 8, borderTop: '1px dashed #e5e7eb',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontSize: 13,
                }}>
                  <span style={{ color: '#6b7280' }}>Total del viaje (por persona)</span>
                  <strong style={{ fontSize: 15, color: '#0f172a' }}>
                    {displayCurrency} {Number(displayPrice ?? 0).toLocaleString()}
                  </strong>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
