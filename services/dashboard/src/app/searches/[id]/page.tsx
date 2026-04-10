'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  fetchSearch,
  fetchResults,
  fetchCombos,
  fetchSuspiciousResults,
  promoteResult,
  snoozeSearch,
  unsnoozeSearch,
  purchaseSearch,
  archiveSearch,
  reactivateSearch,
  fetchCalendar,
  fetchHistory,
  fetchDestinations,
  fetchWindows,
} from '@/lib/api';
import { FlightCard } from '@/components/flight-card';
import { PriceChart } from '@/components/price-chart';
import { PriceHeatmap } from '@/components/price-heatmap';
import { DestinationCard } from '@/components/destination-card';
import { WindowRow } from '@/components/window-row';

function StatusBanner({ search, onReactivate }: { search: any; onReactivate: () => void }) {
  if (search.status === 'snoozed') {
    const until = search.snoozedUntil
      ? `hasta ${new Date(search.snoozedUntil).toLocaleDateString('es')}`
      : 'indefinidamente';
    return (
      <div style={{
        background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8,
        padding: '12px 20px', marginBottom: 20, display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ color: '#854d0e', fontWeight: 500 }}>Pausada {until}</span>
        <button onClick={onReactivate} style={{
          padding: '6px 14px', background: '#854d0e', border: 'none',
          borderRadius: 4, color: '#fff', cursor: 'pointer', fontSize: 13,
        }}>
          Reactivar ahora
        </button>
      </div>
    );
  }

  if (search.status === 'purchased') {
    return (
      <div style={{
        background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8,
        padding: '12px 20px', marginBottom: 20,
      }}>
        <span style={{ color: '#1e40af', fontWeight: 500 }}>
          Marcada como comprada
          {search.purchaseRecords?.[0]?.createdAt
            ? ` el ${new Date(search.purchaseRecords[0].createdAt).toLocaleDateString('es')}`
            : ''}
          {search.purchaseRecords?.[0]?.pricePaid
            ? ` — ${search.purchaseRecords[0].currency ?? 'USD'} ${Number(search.purchaseRecords[0].pricePaid).toFixed(0)}`
            : ''}
        </span>
      </div>
    );
  }

  return null;
}

type SnoozePreset = '1day' | '1week' | 'indefinite' | string;

export default function SearchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [search, setSearch] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);
  const [combos, setCombos] = useState<any[]>([]);
  const [sort, setSort] = useState('date');
  const [loading, setLoading] = useState(true);
  const [suspicious, setSuspicious] = useState<any[]>([]);
  const [showSnoozeModal, setShowSnoozeModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [snoozeDate, setSnoozeDate] = useState('');
  const [purchaseForm, setPurchaseForm] = useState({ pricePaid: '', currency: 'USD', bookingUrl: '', travelDate: '', notes: '' });
  const [calendarData, setCalendarData] = useState<any>(null);
  const [historyData, setHistoryData] = useState<any>(null);
  const [destinationsData, setDestinationsData] = useState<any>(null);
  const [windowsData, setWindowsData] = useState<any>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

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
        if (s.destinationMode === 'flexible') {
          fetchDestinations(id).then(setDestinationsData).catch(console.error);
        }
        if (s.windowMode) {
          fetchWindows(id).then(setWindowsData).catch(console.error);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id, sort]);

  useEffect(() => {
    if (!id) return;
    fetchCalendar(id, calendarMonth).then(setCalendarData).catch(console.error);
  }, [id, calendarMonth]);

  useEffect(() => {
    if (!id) return;
    fetchHistory(id, 30).then(setHistoryData).catch(console.error);
  }, [id]);

  const handleReactivate = async () => {
    try {
      const updated = await reactivateSearch(id);
      setSearch(updated);
    } catch {
      console.error('Failed to reactivate');
    }
  };

  const handleSnooze = async (preset: SnoozePreset) => {
    try {
      const until = preset === 'custom' ? snoozeDate : preset;
      const updated = await snoozeSearch(id, until);
      setSearch(updated);
      setShowSnoozeModal(false);
    } catch {
      console.error('Failed to snooze');
    }
  };

  const handlePurchase = async () => {
    try {
      const data: any = {};
      if (purchaseForm.pricePaid) data.pricePaid = Number(purchaseForm.pricePaid);
      if (purchaseForm.currency) data.currency = purchaseForm.currency;
      if (purchaseForm.bookingUrl) data.bookingUrl = purchaseForm.bookingUrl;
      if (purchaseForm.travelDate) data.travelDate = purchaseForm.travelDate;
      if (purchaseForm.notes) data.notes = purchaseForm.notes;
      const res = await purchaseSearch(id, data);
      setSearch(res.search);
      setShowPurchaseModal(false);
    } catch {
      console.error('Failed to mark as purchased');
    }
  };

  const handleArchive = async () => {
    if (!confirm('¿Archivar esta búsqueda?')) return;
    try {
      const updated = await archiveSearch(id);
      setSearch(updated);
    } catch {
      console.error('Failed to archive');
    }
  };

  if (loading) return <div>Cargando...</div>;
  if (!search) return <div>Búsqueda no encontrada</div>;

  // Build chart data from results (fallback if no price_history)
  const dateMap: Record<string, number[]> = {};
  results.forEach((r: any) => {
    const date = new Date(r.scrapedAt).toISOString().split('T')[0];
    if (!dateMap[date]) dateMap[date] = [];
    dateMap[date].push(Number(r.pricePerPerson));
  });
  const fallbackChartData = Object.entries(dateMap).map(([date, prices]) => ({
    date,
    minPrice: Math.min(...prices),
    avgPrice: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    maxPrice: Math.max(...prices),
  })).sort((a, b) => a.date.localeCompare(b.date));

  const chartData = historyData?.history?.length > 0 ? historyData.history : fallbackChartData;
  const chartAlerts = historyData?.alerts ?? [];

  const alertConfig = search.alertConfig as any ?? {};
  const targetPrice = alertConfig.targetPricePerPerson;
  const maxPriceConfig = alertConfig.maxPricePerPerson;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Link href="/searches" style={{ color: '#2563eb', fontSize: 14 }}>← Búsquedas</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <h1 style={{ margin: 0, fontSize: 24 }}>{search.name}</h1>
            <StatusBadge status={search.status} snoozedUntil={search.snoozedUntil} />
          </div>
          <div style={{ color: '#6b7280', fontSize: 14 }}>{search.origin} → {search.destination}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/searches/${id}/settings`} style={{
            padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: 6,
            fontSize: 14, color: '#374151', textDecoration: 'none',
          }}>
            Configuración
          </Link>
          <ActionMenu
            status={search.status}
            onSnooze={() => setShowSnoozeModal(true)}
            onPurchase={() => setShowPurchaseModal(true)}
            onArchive={handleArchive}
            onReactivate={handleReactivate}
          />
        </div>
      </div>

      {/* Status banner */}
      <StatusBanner search={search} onReactivate={handleReactivate} />

      {/* Snooze modal */}
      {showSnoozeModal && (
        <Modal title="Pausar búsqueda" onClose={() => setShowSnoozeModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => handleSnooze('1day')} style={btnStyle}>1 día</button>
            <button onClick={() => handleSnooze('1week')} style={btnStyle}>1 semana</button>
            <button onClick={() => handleSnooze('indefinite')} style={btnStyle}>Indefinidamente</button>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="date"
                value={snoozeDate}
                onChange={e => setSnoozeDate(e.target.value)}
                style={{ flex: 1, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 4 }}
              />
              <button
                onClick={() => snoozeDate && handleSnooze('custom')}
                disabled={!snoozeDate}
                style={{ ...btnStyle, opacity: snoozeDate ? 1 : 0.5 }}
              >
                Hasta fecha
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Purchase modal */}
      {showPurchaseModal && (
        <Modal title="Ya compré" onClose={() => setShowPurchaseModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Precio pagado (opcional)</label>
            <input
              type="number"
              placeholder="Ej: 350"
              value={purchaseForm.pricePaid}
              onChange={e => setPurchaseForm(prev => ({ ...prev, pricePaid: e.target.value }))}
              style={inputStyle}
            />
            <label style={{ fontSize: 13, fontWeight: 500 }}>Moneda</label>
            <input
              type="text"
              value={purchaseForm.currency}
              onChange={e => setPurchaseForm(prev => ({ ...prev, currency: e.target.value }))}
              style={inputStyle}
            />
            <label style={{ fontSize: 13, fontWeight: 500 }}>URL de reserva (opcional)</label>
            <input
              type="url"
              placeholder="https://..."
              value={purchaseForm.bookingUrl}
              onChange={e => setPurchaseForm(prev => ({ ...prev, bookingUrl: e.target.value }))}
              style={inputStyle}
            />
            <label style={{ fontSize: 13, fontWeight: 500 }}>Fecha de viaje (opcional)</label>
            <input
              type="date"
              value={purchaseForm.travelDate}
              onChange={e => setPurchaseForm(prev => ({ ...prev, travelDate: e.target.value }))}
              style={inputStyle}
            />
            <label style={{ fontSize: 13, fontWeight: 500 }}>Notas (opcional)</label>
            <textarea
              value={purchaseForm.notes}
              onChange={e => setPurchaseForm(prev => ({ ...prev, notes: e.target.value }))}
              style={{ ...inputStyle, minHeight: 60 }}
            />
            <button onClick={handlePurchase} style={{ ...btnStyle, background: '#2563eb' }}>
              Confirmar compra
            </button>
          </div>
        </Modal>
      )}

      {/* Price history chart */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24, marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>Historial de Precios</h2>
        <PriceChart data={chartData} alerts={chartAlerts} />
      </div>

      {/* Calendar heatmap */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Calendario de Precios</h2>
          <input
            type="month"
            value={calendarMonth}
            onChange={e => setCalendarMonth(e.target.value)}
            style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
          />
        </div>
        {calendarData ? (
          <PriceHeatmap
            month={calendarData.month}
            days={calendarData.days}
            targetPrice={targetPrice}
            maxPrice={maxPriceConfig}
          />
        ) : (
          <div style={{ color: '#9ca3af' }}>Cargando...</div>
        )}
      </div>

      {/* Split combos */}
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

      {/* Flexible destination ranking */}
      {search.destinationMode === 'flexible' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24, marginBottom: 24 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>Destinos rankeados por precio</h2>
          {!destinationsData && <div style={{ color: '#9ca3af' }}>Cargando...</div>}
          {destinationsData?.destinations?.length === 0 && (
            <div style={{ color: '#9ca3af' }}>No hay resultados todavía para ningún destino.</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {(destinationsData?.destinations ?? []).map((d: any) => (
              <DestinationCard
                key={d.iata}
                iata={d.iata}
                minPrice={d.minPrice}
                currency={d.currency}
                resultCount={d.resultCount}
              />
            ))}
          </div>
        </div>
      )}

      {/* Window mode results */}
      {search.windowMode && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24, marginBottom: 24 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>Ventanas posibles</h2>
          {!windowsData && <div style={{ color: '#9ca3af' }}>Cargando...</div>}
          {windowsData?.windows?.length === 0 && (
            <div style={{ color: '#9ca3af' }}>No hay ventanas disponibles todavía.</div>
          )}
          {(windowsData?.windows ?? []).map((w: any, idx: number) => (
            <WindowRow
              key={`${w.start}-${w.end}-${idx}`}
              start={w.start}
              end={w.end}
              duration={w.duration}
              minPrice={w.minPrice}
              currency={w.currency}
              resultCount={w.resultCount}
            />
          ))}
        </div>
      )}

      {/* Suspicious results */}
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

      {/* Results */}
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

// --- Sub-components ---

function StatusBadge({ status, snoozedUntil }: { status: string; snoozedUntil?: string | null }) {
  const config: Record<string, { label: string; bg: string; color: string }> = {
    active: { label: 'Activa', bg: '#dcfce7', color: '#15803d' },
    snoozed: { label: 'Pausada', bg: '#fef9c3', color: '#854d0e' },
    purchased: { label: 'Comprada', bg: '#dbeafe', color: '#1d4ed8' },
    archived: { label: 'Archivada', bg: '#f3f4f6', color: '#6b7280' },
  };
  const c = config[status] ?? config.active;
  const tooltip =
    status === 'snoozed' && snoozedUntil
      ? `hasta ${new Date(snoozedUntil).toLocaleDateString('es')}`
      : undefined;

  return (
    <span
      title={tooltip}
      style={{
        padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
        background: c.bg, color: c.color,
      }}
    >
      {c.label}
    </span>
  );
}

function ActionMenu({
  status,
  onSnooze,
  onPurchase,
  onArchive,
  onReactivate,
}: {
  status: string;
  onSnooze: () => void;
  onPurchase: () => void;
  onArchive: () => void;
  onReactivate: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((p) => !p)}
        style={{
          padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6,
          fontSize: 14, color: '#374151', background: '#fff', cursor: 'pointer',
        }}
      >
        ⋯ Acciones
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 4,
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 160,
        }}>
          {status === 'active' && (
            <MenuAction label="Pausar" onClick={() => { setOpen(false); onSnooze(); }} />
          )}
          {status !== 'purchased' && (
            <MenuAction label="Ya compré" onClick={() => { setOpen(false); onPurchase(); }} />
          )}
          {status !== 'archived' && (
            <MenuAction label="Archivar" onClick={() => { setOpen(false); onArchive(); }} />
          )}
          {status !== 'active' && (
            <MenuAction label="Reactivar" onClick={() => { setOpen(false); onReactivate(); }} />
          )}
        </div>
      )}
    </div>
  );
}

function MenuAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '10px 16px', border: 'none', background: 'none',
        cursor: 'pointer', fontSize: 14, color: '#374151',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      {label}
    </button>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: '#fff', borderRadius: 8, padding: 24, maxWidth: 400, width: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '10px 16px', background: '#374151', border: 'none',
  borderRadius: 4, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #d1d5db',
  borderRadius: 4, fontSize: 14, width: '100%', boxSizing: 'border-box',
};
