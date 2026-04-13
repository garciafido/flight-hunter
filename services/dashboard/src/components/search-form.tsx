'use client';

import { useState } from 'react';
import { createSearch, updateSearch } from '@/lib/api';

interface SearchFormProps {
  /** When set, the form is in edit mode and submits PUT to /api/searches/[id]. */
  searchId?: string;
  /** Pre-populated form state (e.g. from an existing search row). */
  initialState?: Partial<FormState>;
  onCreated?: (search: any) => void;
  onUpdated?: (search: any) => void;
}

export interface WaypointFormEntry {
  id: string;
  airport: string;
  type: 'stay' | 'connection';
  minDays: number;
  maxDays: number;
  maxHours: number;
  /** Checked bags to bring on the leg arriving at this waypoint. Default 0. */
  checkedBags: number;
  /** Override passenger count for this leg. Empty string = inherit global. */
  passengers: number | '';
}

export interface FormState {
  active: boolean;
  name: string;
  origin: string;
  passengers: number;
  departureDateMode: 'range' | 'list';
  departureFrom: string;
  departureTo: string;
  departureDatesText: string; // comma-separated dates for list mode
  maxConnectionHours: number;
  returnBy: string; // ISO date or empty string
  waypoints: WaypointFormEntry[];
  // Filters (structured)
  requireCarryOn: boolean;
  maxUnplannedStops: number;
  airlineBlacklist: string;     // comma-separated, parsed to string[] on submit
  // Checked bags on the final return leg (per passenger).
  returnCheckedBags: number;
  // Override passenger count for the return leg. '' = inherit global.
  returnPassengers: number | '';
  // Alerts
  scoreThresholdInfo: number;
  scoreThresholdGood: number;
  scoreThresholdUrgent: number;
  maxPrice: number | '';
  targetPrice: number | '';
  dreamPrice: number | '';
  currency: string;
  proxyRegions: string[];
  scanIntervalMin: number;
}

function newWaypointEntry(): WaypointFormEntry {
  return {
    id: crypto.randomUUID(),
    airport: '',
    type: 'stay',
    minDays: 1,
    maxDays: 7,
    maxHours: 6,
    checkedBags: 0,
    passengers: '',
  };
}

/**
 * Converts a Search row (as returned by /api/searches/[id]) into FormState.
 * Used by the edit page to pre-populate the form.
 */
export function searchRowToFormState(row: any): FormState {
  const filters = row.filters ?? {};
  const alertConfig = row.alertConfig ?? {};
  const wps = Array.isArray(row.waypoints) ? row.waypoints : [];
  return {
    active: row.active ?? true,
    name: row.name ?? '',
    origin: row.origin ?? '',
    passengers: row.passengers ?? 1,
    departureDateMode: Array.isArray(row.departureDates) && row.departureDates.length > 0 ? 'list' : 'range',
    departureFrom: typeof row.departureFrom === 'string'
      ? row.departureFrom.slice(0, 10)
      : '',
    departureTo: typeof row.departureTo === 'string'
      ? row.departureTo.slice(0, 10)
      : '',
    departureDatesText: Array.isArray(row.departureDates)
      ? row.departureDates.map((d: string) => (typeof d === 'string' ? d.slice(0, 10) : '')).join(', ')
      : '',
    maxConnectionHours: row.maxConnectionHours ?? 6,
    returnBy: typeof row.returnBy === 'string' ? row.returnBy.slice(0, 10) : '',
    waypoints: wps.length > 0
      ? wps.map((wp: any) => ({
          id: crypto.randomUUID(),
          airport: wp.airport ?? '',
          type: wp.gap?.type === 'connection' ? 'connection' : 'stay',
          minDays: wp.gap?.minDays ?? 1,
          maxDays: wp.gap?.maxDays ?? 7,
          maxHours: wp.gap?.maxHours ?? 6,
          checkedBags: wp.checkedBags ?? 0,
          passengers: wp.passengers ?? '',
        }))
      : [newWaypointEntry()],
    requireCarryOn: filters.requireCarryOn ?? false,
    maxUnplannedStops: filters.maxUnplannedStops ?? 1,
    airlineBlacklist: Array.isArray(filters.airlineBlacklist) ? filters.airlineBlacklist.join(', ') : '',
    returnCheckedBags: row.returnCheckedBags ?? 0,
    returnPassengers: row.returnPassengers ?? '',
    scoreThresholdInfo: alertConfig.scoreThresholds?.info ?? 30,
    scoreThresholdGood: alertConfig.scoreThresholds?.good ?? 60,
    scoreThresholdUrgent: alertConfig.scoreThresholds?.urgent ?? 80,
    maxPrice: alertConfig.maxPrice ?? alertConfig.maxPricePerPerson ?? '',
    targetPrice: alertConfig.targetPrice ?? alertConfig.targetPricePerPerson ?? '',
    dreamPrice: alertConfig.dreamPrice ?? alertConfig.dreamPricePerPerson ?? '',
    currency: alertConfig.currency ?? 'USD',
    proxyRegions: Array.isArray(row.proxyRegions) ? row.proxyRegions : [],
    scanIntervalMin: row.scanIntervalMin ?? 60,
  };
}

const DEFAULT_FORM_STATE: FormState = {
  active: true,
  name: '',
  origin: '',
  passengers: 1,
  departureDateMode: 'range',
  departureFrom: '',
  departureTo: '',
  departureDatesText: '',
  maxConnectionHours: 6,
  returnBy: '',
  waypoints: [],
  requireCarryOn: false,
  maxUnplannedStops: 1,
  airlineBlacklist: '',
  returnCheckedBags: 0,
  returnPassengers: '',
  scoreThresholdInfo: 30,
  scoreThresholdGood: 60,
  scoreThresholdUrgent: 80,
  maxPrice: '',
  targetPrice: '',
  dreamPrice: '',
  currency: 'USD',
  proxyRegions: [],
  scanIntervalMin: 60,
};

export function SearchForm({ searchId, initialState, onCreated, onUpdated }: SearchFormProps) {
  const isEdit = !!searchId;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(() => {
    const base = initialState
      ? { ...DEFAULT_FORM_STATE, ...initialState }
      : DEFAULT_FORM_STATE;
    return {
      ...base,
      // Always have at least one waypoint card to edit
      waypoints: base.waypoints.length > 0 ? base.waypoints : [newWaypointEntry()],
    };
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const target = e.target;
    const { name, value, type } = target;
    if (type === 'checkbox' && target instanceof HTMLInputElement) {
      setForm(prev => ({ ...prev, [name]: target.checked }));
      return;
    }
    setForm(prev => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? '' : Number(value)) : value,
    }));
  }

  function handleCheckbox(e: React.ChangeEvent<HTMLInputElement>) {
    const { value, checked } = e.target;
    setForm(prev => ({
      ...prev,
      proxyRegions: checked
        ? [...prev.proxyRegions, value]
        : prev.proxyRegions.filter(r => r !== value),
    }));
  }

  function insertAt(index: number) {
    setForm(prev => ({
      ...prev,
      waypoints: [
        ...prev.waypoints.slice(0, index),
        newWaypointEntry(),
        ...prev.waypoints.slice(index),
      ],
    }));
  }

  function removeWaypoint(index: number) {
    setForm(prev => ({
      ...prev,
      waypoints: prev.waypoints.filter((_, i) => i !== index),
    }));
  }

  function updateWaypoint(index: number, partial: Partial<WaypointFormEntry>) {
    setForm(prev => ({
      ...prev,
      waypoints: prev.waypoints.map((wp, i) => (i === index ? { ...wp, ...partial } : wp)),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.waypoints.length === 0) {
      setError('Agregá al menos una parada');
      return;
    }
    for (const wp of form.waypoints) {
      if (wp.airport.length !== 3) {
        setError(`Aeropuerto inválido: "${wp.airport}" (debe ser código IATA de 3 letras)`);
        return;
      }
      if (wp.type === 'stay' && wp.minDays > wp.maxDays) {
        setError(`En ${wp.airport}: min días no puede ser mayor que max días`);
        return;
      }
    }

    setLoading(true);
    try {
      const airlineBlacklist = form.airlineBlacklist
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const filters = {
        airlineBlacklist,
        airlinePreferred: [],
        airportPreferred: {},
        airportBlacklist: {},
        maxUnplannedStops: Number(form.maxUnplannedStops),
        requireCarryOn: form.requireCarryOn,
      };

      // Parse departure dates based on mode
      let departureFrom = form.departureFrom;
      let departureTo = form.departureTo;
      let departureDates: string[] | undefined;

      if (form.departureDateMode === 'list') {
        const dates = form.departureDatesText
          .split(',')
          .map(s => s.trim())
          .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s))
          .sort();
        if (dates.length === 0) {
          setError('Ingresá al menos una fecha en el listado');
          setLoading(false);
          return;
        }
        departureDates = dates;
        departureFrom = dates[0];
        departureTo = dates[dates.length - 1];
      }

      const payload = {
        active: form.active,
        name: form.name,
        origin: form.origin,
        passengers: Number(form.passengers),
        departureFrom,
        departureTo,
        ...(departureDates ? { departureDates } : {}),
        maxConnectionHours: Number(form.maxConnectionHours),
        ...(form.returnBy ? { returnBy: form.returnBy } : {}),
        returnCheckedBags: Number(form.returnCheckedBags),
        ...(form.returnPassengers !== '' ? { returnPassengers: Number(form.returnPassengers) } : {}),
        waypoints: form.waypoints.map(wp => ({
          airport: wp.airport,
          gap: wp.type === 'stay'
            ? { type: 'stay' as const, minDays: Number(wp.minDays), maxDays: Number(wp.maxDays) }
            : { type: 'connection' as const, maxHours: Number(wp.maxHours) },
          checkedBags: Number(wp.checkedBags) || 0,
          ...(wp.passengers !== '' ? { passengers: Number(wp.passengers) } : {}),
        })),
        filters,
        alertConfig: {
          scoreThresholds: {
            info: Number(form.scoreThresholdInfo),
            good: Number(form.scoreThresholdGood),
            urgent: Number(form.scoreThresholdUrgent),
          },
          maxPrice: Number(form.maxPrice),
          ...(form.targetPrice !== '' ? { targetPrice: Number(form.targetPrice) } : {}),
          ...(form.dreamPrice !== '' ? { dreamPrice: Number(form.dreamPrice) } : {}),
          currency: form.currency,
        },
        proxyRegions: form.proxyRegions,
        scanIntervalMin: Number(form.scanIntervalMin),
      };

      if (isEdit && searchId) {
        const result = await updateSearch(searchId, payload);
        onUpdated?.(result);
        setSavedMessage('Cambios guardados. Los servicios los aplicarán en el próximo tick.');
        setTimeout(() => setSavedMessage(null), 4000);
      } else {
        const result = await createSearch(payload);
        onCreated?.(result);
      }
    } catch (err: any) {
      setError(err.message ?? (isEdit ? 'Error al guardar la búsqueda' : 'Error al crear búsqueda'));
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 10px', border: '1px solid #d1d5db',
    borderRadius: 4, fontSize: 14, boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, marginBottom: 4, fontWeight: 500 };
  const sectionStyle: React.CSSProperties = { marginBottom: 24 };
  const sectionTitleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 12, borderBottom: '1px solid #e5e7eb', paddingBottom: 6 };
  const rowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 };

  const waypointAnchorStyle: React.CSSProperties = {
    border: '2px solid #2563eb', borderRadius: 8, padding: '8px 16px',
    fontWeight: 700, textAlign: 'center', background: '#eff6ff', color: '#1e40af',
  };
  const waypointCardStyle: React.CSSProperties = {
    border: '1px solid #d1d5db', borderRadius: 8, padding: 12, background: '#fff',
  };
  const connectorStyle: React.CSSProperties = {
    width: 2, height: 16, background: '#cbd5e1', margin: '0 auto',
  };
  const insertButtonStyle: React.CSSProperties = {
    display: 'block', margin: '4px auto', padding: '4px 12px',
    border: '1px dashed #94a3b8', borderRadius: 4, background: '#f8fafc',
    color: '#475569', fontSize: 12, cursor: 'pointer',
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 600 }}>
      {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

      {/* Active toggle — only visible in edit mode, placed at the very top */}
      {isEdit && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 20, padding: '12px 16px', borderRadius: 8,
          background: form.active ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${form.active ? '#bbf7d0' : '#fecaca'}`,
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            <input
              type="checkbox"
              name="active"
              checked={form.active}
              onChange={handleChange}
              style={{ width: 18, height: 18 }}
            />
            {form.active ? 'Búsqueda activa' : 'Búsqueda inactiva (pausada)'}
          </label>
        </div>
      )}

      {/* Section 1 — Información general */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Información general</div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Nombre</label>
          <input name="name" value={form.name} onChange={handleChange} required style={inputStyle} />
        </div>
        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Origen</label>
            <input name="origin" value={form.origin} onChange={handleChange} required style={inputStyle} placeholder="SCL" maxLength={3} />
          </div>
          <div>
            <label style={labelStyle}>Pasajeros</label>
            <input name="passengers" value={form.passengers} onChange={handleChange} type="number" min="1" max="9" required style={inputStyle} />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="radio"
                name="departureDateMode"
                value="range"
                checked={form.departureDateMode === 'range'}
                onChange={() => setForm(prev => ({ ...prev, departureDateMode: 'range' }))}
              />
              Rango de fechas
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="radio"
                name="departureDateMode"
                value="list"
                checked={form.departureDateMode === 'list'}
                onChange={() => setForm(prev => ({ ...prev, departureDateMode: 'list' }))}
              />
              Fechas específicas
            </label>
          </div>
          {form.departureDateMode === 'range' ? (
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>Salida desde</label>
                <input name="departureFrom" value={form.departureFrom} onChange={handleChange} type="date" required style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Salida hasta</label>
                <input name="departureTo" value={form.departureTo} onChange={handleChange} type="date" required style={inputStyle} />
              </div>
            </div>
          ) : (
            <div>
              <label style={labelStyle}>Fechas de salida (separadas por coma, formato YYYY-MM-DD)</label>
              <input
                name="departureDatesText"
                value={form.departureDatesText}
                onChange={handleChange}
                placeholder="2026-07-25, 2026-07-28, 2026-07-31"
                style={inputStyle}
              />
              <span style={{ fontSize: 11, color: '#9ca3af' }}>El scraper buscará solo en estas fechas</span>
            </div>
          )}
        </div>
        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Máx horas de conexión</label>
            <input name="maxConnectionHours" value={form.maxConnectionHours} onChange={handleChange} type="number" min="1" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Fecha máxima de regreso</label>
            <input
              name="returnBy"
              data-testid="return-by"
              value={form.returnBy}
              onChange={handleChange}
              type="date"
              style={inputStyle}
            />
            <span style={{ fontSize: 11, color: '#9ca3af' }}>Vacío = sin límite</span>
          </div>
        </div>
      </div>

      {/* Section 2 — Itinerario */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Itinerario</div>

        {/* Origin anchor */}
        <div style={waypointAnchorStyle}>[ORIGEN] {form.origin || '???'}</div>
        <div style={connectorStyle} />

        {form.waypoints.map((wp, i) => {
          const fromAirport = i === 0 ? (form.origin || '?') : (form.waypoints[i - 1]?.airport || '?');
          return (
            <div key={wp.id}>
              {/* ── Flight connector: fromAirport → wp.airport ── */}
              <div style={connectorStyle} />
              <div style={{
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6,
                padding: '8px 12px', fontSize: 12,
              }}>
                <div style={{ fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                  ✈ {fromAirport} → {wp.airport || '?'}
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    Valijas:
                    <input
                      type="number"
                      data-testid="waypoint-checkedbags"
                      min="0" max="5"
                      value={wp.checkedBags}
                      onChange={e => updateWaypoint(i, { checkedBags: Number(e.target.value) })}
                      style={{ ...inputStyle, width: 50, padding: '2px 6px' }}
                    />
                  </span>
                  <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    Pax:
                    <input
                      type="number"
                      data-testid="waypoint-passengers"
                      min="1" max="9"
                      placeholder={String(form.passengers)}
                      value={wp.passengers}
                      onChange={e => updateWaypoint(i, { passengers: e.target.value === '' ? '' : Number(e.target.value) })}
                      style={{ ...inputStyle, width: 50, padding: '2px 6px' }}
                    />
                  </span>
                </div>
              </div>

              {/* ── City node: stay/connection config ── */}
              <div style={connectorStyle} />
              <div style={waypointCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <input
                    data-testid="waypoint-airport"
                    value={wp.airport}
                    onChange={e => updateWaypoint(i, { airport: e.target.value.toUpperCase() })}
                    placeholder="IATA"
                    maxLength={3}
                    style={{ ...inputStyle, width: 80, textTransform: 'uppercase' }}
                  />
                  <div style={{ display: 'flex', gap: 12, marginLeft: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                      <input type="radio" name={`wp-type-${wp.id}`} value="stay" checked={wp.type === 'stay'} onChange={() => updateWaypoint(i, { type: 'stay' })} />
                      Estadía
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                      <input type="radio" name={`wp-type-${wp.id}`} value="connection" checked={wp.type === 'connection'} onChange={() => updateWaypoint(i, { type: 'connection' })} />
                      Conexión
                    </label>
                  </div>
                  <button type="button" data-testid="waypoint-remove" onClick={() => removeWaypoint(i)}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 16 }}>
                    ✕
                  </button>
                </div>
                {wp.type === 'stay' ? (
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Min noches</label>
                      <input data-testid="waypoint-mindays" type="number" min="0" value={wp.minDays}
                        onChange={e => updateWaypoint(i, { minDays: Number(e.target.value) })} style={{ ...inputStyle, width: 80 }} />
                    </div>
                    <div>
                      <label style={labelStyle}>Max noches</label>
                      <input data-testid="waypoint-maxdays" type="number" min="0" value={wp.maxDays}
                        onChange={e => updateWaypoint(i, { maxDays: Number(e.target.value) })} style={{ ...inputStyle, width: 80 }} />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label style={labelStyle}>Max horas</label>
                    <input data-testid="waypoint-maxhours" type="number" min="0" value={wp.maxHours}
                      onChange={e => updateWaypoint(i, { maxHours: Number(e.target.value) })} style={{ ...inputStyle, width: 80 }} />
                  </div>
                )}
              </div>
              <div style={connectorStyle} />

              <button type="button" style={insertButtonStyle} onClick={() => insertAt(i + 1)}>
                + Insertar parada
              </button>
            </div>
          );
        })}

        {/* ── Return flight connector ── */}
        <div style={connectorStyle} />
        <div style={{
          background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6,
          padding: '8px 12px', fontSize: 12,
        }}>
          <div style={{ fontWeight: 600, color: '#475569', marginBottom: 6 }}>
            ✈ {form.waypoints.length > 0 ? (form.waypoints[form.waypoints.length - 1]?.airport || '?') : '?'} → {form.origin || '?'}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              Valijas:
              <input type="number" data-testid="return-checkedbags" name="returnCheckedBags"
                min="0" max="5" value={form.returnCheckedBags} onChange={handleChange}
                style={{ ...inputStyle, width: 50, padding: '2px 6px' }} />
            </span>
            <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              Pax:
              <input type="number" data-testid="return-passengers" name="returnPassengers"
                min="1" max="9" placeholder={String(form.passengers)} value={form.returnPassengers}
                onChange={handleChange} style={{ ...inputStyle, width: 50, padding: '2px 6px' }} />
            </span>
          </div>
        </div>

        {/* ── Return anchor ── */}
        <div style={connectorStyle} />
        <div style={waypointAnchorStyle}>[REGRESO] {form.origin || '???'}</div>

        <p style={{ fontSize: 12, color: '#64748b', marginTop: 8, fontStyle: 'italic' }}>
          El viaje sigue el orden de arriba a abajo. Para probar otro orden, duplicá la búsqueda y reordená las paradas.
        </p>
      </div>

      {/* Section 3 — Alertas */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Alertas</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Umbral Info</label>
            <input name="scoreThresholdInfo" value={form.scoreThresholdInfo} onChange={handleChange} type="number" min="0" max="100" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Umbral Good</label>
            <input name="scoreThresholdGood" value={form.scoreThresholdGood} onChange={handleChange} type="number" min="0" max="100" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Umbral Urgent</label>
            <input name="scoreThresholdUrgent" value={form.scoreThresholdUrgent} onChange={handleChange} type="number" min="0" max="100" style={inputStyle} />
          </div>
        </div>

        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Precio máx total viaje</label>
            <input name="maxPrice" value={form.maxPrice} onChange={handleChange} type="number" min="0" required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Moneda</label>
            <select name="currency" value={form.currency} onChange={handleChange} style={inputStyle}>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="CLP">CLP</option>
              <option value="ARS">ARS</option>
            </select>
          </div>
        </div>

        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Precio objetivo total</label>
            <input name="targetPrice" value={form.targetPrice} onChange={handleChange} type="number" min="0" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Precio soñado total</label>
            <input name="dreamPrice" value={form.dreamPrice} onChange={handleChange} type="number" min="0" style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Regiones de proxy</label>
          <div style={{ display: 'flex', gap: 16 }}>
            {['CL', 'AR'].map(region => (
              <label key={region} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  value={region}
                  checked={form.proxyRegions.includes(region)}
                  onChange={handleCheckbox}
                />
                {region}
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Intervalo de escaneo (minutos)</label>
          <input name="scanIntervalMin" value={form.scanIntervalMin} onChange={handleChange} type="number" min="5" required style={{ ...inputStyle, width: 120 }} />
        </div>

      </div>

      {/* Section 4 — Filtros del vuelo */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Filtros del vuelo</div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input
              type="checkbox"
              name="requireCarryOn"
              data-testid="filter-carryon"
              checked={form.requireCarryOn}
              onChange={handleChange}
            />
            Exigir que incluya equipaje de mano
          </label>
        </div>

        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Max escalas no planificadas</label>
            <input
              name="maxUnplannedStops"
              data-testid="filter-maxstops"
              value={form.maxUnplannedStops}
              onChange={handleChange}
              type="number"
              min="0"
              max="3"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Aerolíneas a bloquear (separadas por coma)</label>
          <input
            name="airlineBlacklist"
            data-testid="filter-blacklist"
            value={form.airlineBlacklist}
            onChange={handleChange}
            placeholder="ej. JetSMART, Sky Airline"
            style={inputStyle}
          />
        </div>

        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, fontStyle: 'italic' }}>
          El equipaje despachado se configura por tramo en el itinerario de arriba. El carry-on aplica a todos los tramos del viaje. Costo estimado por aerolínea, editable en /system.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="submit"
          disabled={loading}
          style={{ background: '#2563eb', color: '#fff', padding: '10px 24px', borderRadius: 6, border: 'none', fontSize: 15, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
        >
          {loading
            ? (isEdit ? 'Guardando...' : 'Creando...')
            : (isEdit ? 'Guardar cambios' : 'Crear Búsqueda')}
        </button>
        {savedMessage && (
          <span style={{ fontSize: 13, color: '#16a34a' }}>{savedMessage}</span>
        )}
      </div>
    </form>
  );
}
