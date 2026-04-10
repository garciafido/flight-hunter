'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchSearch, updateSearch } from '@/lib/api';
import { REGION_PRESETS } from '@flight-hunter/shared';

function toDateInput(d: any): string {
  if (!d) return '';
  return new Date(d).toISOString().split('T')[0];
}

export default function SearchSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [search, setSearch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchSearch(id)
      .then(setSearch)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  function update(path: string, value: any) {
    setSearch((prev: any) => {
      const next = { ...prev };
      const parts = path.split('.');
      let target = next;
      for (let i = 0; i < parts.length - 1; i++) {
        target[parts[i]] = { ...target[parts[i]] };
        target = target[parts[i]];
      }
      target[parts[parts.length - 1]] = value;
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateSearch(id, {
        name: search.name,
        origin: search.origin,
        destination: search.destination,
        stopover: search.stopover,
        departureFrom: search.departureFrom,
        departureTo: search.departureTo,
        returnMinDays: search.returnMinDays,
        returnMaxDays: search.returnMaxDays,
        passengers: search.passengers,
        filters: search.filters,
        alertConfig: search.alertConfig,
        proxyRegions: search.proxyRegions,
        scanIntervalMin: search.scanIntervalMin,
        active: search.active,
        mode: search.mode ?? 'roundtrip',
        legs: (search.mode ?? 'roundtrip') === 'split' ? (search.legs ?? []) : null,
        destinationMode: search.destinationMode ?? 'single',
        destinationCandidates: search.destinationMode === 'flexible' ? (search.destinationCandidates ?? []) : null,
        windowMode: search.windowMode ?? false,
        windowDuration: search.windowMode ? (search.windowDuration ?? null) : null,
        windowFlexibility: search.windowMode ? (search.windowFlexibility ?? 0) : 0,
        maxCombos: search.maxCombos ?? 100,
      });
      router.push(`/searches/${id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function addLeg() {
    update('legs', [...(search.legs ?? []), {
      origin: '',
      destination: '',
      departureFrom: '',
      departureTo: '',
      stopover: null,
    }]);
  }

  function removeLeg(idx: number) {
    update('legs', (search.legs ?? []).filter((_: any, i: number) => i !== idx));
  }

  function updateLeg(idx: number, field: string, value: any) {
    const legs = [...(search.legs ?? [])];
    legs[idx] = { ...legs[idx], [field]: value };
    update('legs', legs);
  }

  function updateLegStopover(idx: number, field: string, value: any) {
    const legs = [...(search.legs ?? [])];
    legs[idx] = { ...legs[idx], stopover: { ...(legs[idx].stopover ?? {}), [field]: value } };
    update('legs', legs);
  }

  if (loading) return <div>Cargando...</div>;
  if (!search) return <div>Búsqueda no encontrada</div>;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 10px', border: '1px solid #d1d5db',
    borderRadius: 4, fontSize: 14, boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, marginBottom: 4, fontWeight: 500 };
  const sectionStyle: React.CSSProperties = {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
    padding: 24, marginBottom: 16,
  };
  const sectionTitle: React.CSSProperties = { margin: '0 0 16px', fontSize: 16, fontWeight: 600 };
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/searches/${id}`} style={{ color: '#2563eb', fontSize: 14 }}>← Volver</Link>
        <h1 style={{ margin: '4px 0 0', fontSize: 24 }}>Configuración: {search.name}</h1>
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div style={sectionStyle}>
          <h2 style={sectionTitle}>General</h2>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Nombre</label>
            <input value={search.name} onChange={e => update('name', e.target.value)} required style={inputStyle} />
          </div>
          <div style={grid2}>
            <div>
              <label style={labelStyle}>Intervalo de Escaneo (min)</label>
              <input type="number" min={5} value={search.scanIntervalMin}
                onChange={e => update('scanIntervalMin', parseInt(e.target.value, 10))} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={search.active}
                  onChange={e => update('active', e.target.checked)} />
                Búsqueda activa
              </label>
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={sectionTitle}>Modo de búsqueda</h2>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Tipo</label>
            <select
              value={search.mode ?? 'roundtrip'}
              onChange={e => update('mode', e.target.value)}
              style={inputStyle}
            >
              <option value="roundtrip">Round trip (ida y vuelta)</option>
              <option value="split">Split (vuelos separados por tramo)</option>
            </select>
          </div>
        </div>

        {/* Section A: Destination mode */}
        <div style={sectionStyle}>
          <h2 style={sectionTitle}>Modo de destino</h2>
          <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
              <input
                type="radio"
                name="destinationMode"
                value="single"
                checked={(search.destinationMode ?? 'single') === 'single'}
                onChange={() => update('destinationMode', 'single')}
              />
              Destino fijo
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
              <input
                type="radio"
                name="destinationMode"
                value="flexible"
                checked={search.destinationMode === 'flexible'}
                onChange={() => update('destinationMode', 'flexible')}
              />
              Flexible (varios candidatos)
            </label>
          </div>
          {search.destinationMode === 'flexible' && (
            <div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Códigos IATA (separados por coma)</label>
                <input
                  value={(search.destinationCandidates ?? []).filter((c: string) => !Object.keys(REGION_PRESETS).includes(c)).join(', ')}
                  onChange={e => {
                    const iatas = e.target.value.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean);
                    const regions = (search.destinationCandidates ?? []).filter((c: string) => Object.keys(REGION_PRESETS).includes(c));
                    update('destinationCandidates', [...regions, ...iatas]);
                  }}
                  placeholder="CUZ, LIM, BOG"
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Presets de región</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.keys(REGION_PRESETS).map(preset => {
                    const selected = (search.destinationCandidates ?? []).includes(preset);
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          const current: string[] = search.destinationCandidates ?? [];
                          update('destinationCandidates', selected
                            ? current.filter((c: string) => c !== preset)
                            : [...current, preset]);
                        }}
                        style={{
                          padding: '4px 12px',
                          borderRadius: 16,
                          border: `1px solid ${selected ? '#2563eb' : '#d1d5db'}`,
                          background: selected ? '#eff6ff' : '#fff',
                          color: selected ? '#2563eb' : '#374151',
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                Total destinos expandidos: <strong>{
                  (search.destinationCandidates ?? []).reduce((acc: number, c: string) => {
                    return acc + (REGION_PRESETS[c] ? REGION_PRESETS[c].length : 1);
                  }, 0)
                }</strong>
              </div>
            </div>
          )}
        </div>

        {/* Section B: Window mode */}
        {(search.mode ?? 'roundtrip') === 'roundtrip' && (
          <div style={sectionStyle}>
            <h2 style={sectionTitle}>Modo de fechas</h2>
            <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="windowMode"
                  value="fixed"
                  checked={!search.windowMode}
                  onChange={() => update('windowMode', false)}
                />
                Fechas fijas
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="windowMode"
                  value="window"
                  checked={!!search.windowMode}
                  onChange={() => update('windowMode', true)}
                />
                Ventana flexible
              </label>
            </div>
            {search.windowMode && (
              <div style={grid2}>
                <div>
                  <label style={labelStyle}>Duración del viaje (días)</label>
                  <input
                    type="number"
                    min={1}
                    value={search.windowDuration ?? ''}
                    onChange={e => update('windowDuration', parseInt(e.target.value, 10))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Flexibilidad (± días)</label>
                  <input
                    type="number"
                    min={0}
                    value={search.windowFlexibility ?? 0}
                    onChange={e => update('windowFlexibility', parseInt(e.target.value, 10))}
                    style={inputStyle}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section C: Advanced — combo cap for split mode */}
        {(search.mode ?? 'roundtrip') === 'split' && (
          <div style={sectionStyle}>
            <h2 style={sectionTitle}>Avanzado</h2>
            <div style={{ maxWidth: 240 }}>
              <label style={labelStyle}>Cap de combinaciones (maxCombos)</label>
              <input
                type="number"
                min={10}
                max={1000}
                value={search.maxCombos ?? 100}
                onChange={e => update('maxCombos', parseInt(e.target.value, 10))}
                style={inputStyle}
              />
              <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>
                Límite de combos split generados. Mín 10, máx 1000.
              </p>
            </div>
          </div>
        )}

        {(search.mode ?? 'roundtrip') === 'split' && (
          <div style={sectionStyle}>
            <h2 style={sectionTitle}>Tramos (Split)</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
              Cada tramo es un vuelo de ida independiente. El sistema buscará la combinación más barata respetando el orden temporal.
            </p>
            {(search.legs ?? []).map((leg: any, idx: number) => (
              <div key={idx} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <strong style={{ fontSize: 14 }}>Tramo {idx + 1}</strong>
                  <button type="button" onClick={() => removeLeg(idx)}
                    style={{ background: 'transparent', border: '1px solid #fca5a5', color: '#dc2626', padding: '2px 8px', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
                    Eliminar
                  </button>
                </div>
                <div style={grid2}>
                  <div>
                    <label style={labelStyle}>Origen (IATA)</label>
                    <input value={leg.origin ?? ''} onChange={e => updateLeg(idx, 'origin', e.target.value.toUpperCase())} style={inputStyle} placeholder="BUE" />
                  </div>
                  <div>
                    <label style={labelStyle}>Destino (IATA)</label>
                    <input value={leg.destination ?? ''} onChange={e => updateLeg(idx, 'destination', e.target.value.toUpperCase())} style={inputStyle} placeholder="CUZ" />
                  </div>
                  <div>
                    <label style={labelStyle}>Salida desde</label>
                    <input type="date" value={toDateInput(leg.departureFrom)} onChange={e => updateLeg(idx, 'departureFrom', e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Salida hasta</label>
                    <input type="date" value={toDateInput(leg.departureTo)} onChange={e => updateLeg(idx, 'departureTo', e.target.value)} style={inputStyle} />
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <strong style={{ fontSize: 13 }}>Escala extendida (opcional)</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginTop: 8 }}>
                    <div>
                      <label style={labelStyle}>Aeropuerto</label>
                      <input value={leg.stopover?.airport ?? ''} onChange={e => updateLegStopover(idx, 'airport', e.target.value.toUpperCase())} placeholder="LIM" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Días mín.</label>
                      <input type="number" min={0} value={leg.stopover?.minDays ?? ''} onChange={e => updateLegStopover(idx, 'minDays', parseInt(e.target.value, 10))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Días máx.</label>
                      <input type="number" min={0} value={leg.stopover?.maxDays ?? ''} onChange={e => updateLegStopover(idx, 'maxDays', parseInt(e.target.value, 10))} style={inputStyle} />
                    </div>
                  </div>
                  {leg.stopover?.airport && (
                    <button type="button" onClick={() => updateLeg(idx, 'stopover', null)}
                      style={{ marginTop: 6, background: 'transparent', border: '1px solid #e5e7eb', padding: '3px 8px', borderRadius: 4, fontSize: 12, color: '#6b7280', cursor: 'pointer' }}>
                      Sin escala
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button type="button" onClick={addLeg}
              style={{ background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1', padding: '8px 16px', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}>
              + Agregar tramo
            </button>
          </div>
        )}

        {(search.mode ?? 'roundtrip') === 'roundtrip' && (
        <div style={sectionStyle}>
          <h2 style={sectionTitle}>Ruta</h2>
          <div style={grid2}>
            <div>
              <label style={labelStyle}>Origen (IATA)</label>
              <input value={search.origin} onChange={e => update('origin', e.target.value.toUpperCase())} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Destino (IATA)</label>
              <input value={search.destination} onChange={e => update('destination', e.target.value.toUpperCase())} style={inputStyle} />
            </div>
          </div>
        </div>
        )}

        {(search.mode ?? 'roundtrip') === 'roundtrip' && (<>
        <div style={sectionStyle}>
          <h2 style={sectionTitle}>Fechas</h2>
          <div style={grid2}>
            <div>
              <label style={labelStyle}>Salida desde</label>
              <input type="date" value={toDateInput(search.departureFrom)}
                onChange={e => update('departureFrom', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Salida hasta</label>
              <input type="date" value={toDateInput(search.departureTo)}
                onChange={e => update('departureTo', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Días de viaje (mínimo)</label>
              <input type="number" min={1} value={search.returnMinDays}
                onChange={e => update('returnMinDays', parseInt(e.target.value, 10))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Días de viaje (máximo)</label>
              <input type="number" min={1} value={search.returnMaxDays}
                onChange={e => update('returnMaxDays', parseInt(e.target.value, 10))} style={inputStyle} />
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={sectionTitle}>Escala extendida (stopover)</h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>
            Quedarse algunos días en una ciudad intermedia. Ejemplo: vuelta por Lima, 3 a 4 días.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Aeropuerto (IATA)</label>
              <input value={search.stopover?.airport ?? ''}
                onChange={e => update('stopover', { ...(search.stopover ?? {}), airport: e.target.value.toUpperCase() })}
                placeholder="LIM" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Días mín.</label>
              <input type="number" min={0} value={search.stopover?.minDays ?? ''}
                onChange={e => update('stopover', { ...(search.stopover ?? {}), minDays: parseInt(e.target.value, 10) })}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Días máx.</label>
              <input type="number" min={0} value={search.stopover?.maxDays ?? ''}
                onChange={e => update('stopover', { ...(search.stopover ?? {}), maxDays: parseInt(e.target.value, 10) })}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>En qué tramo</label>
              <select value={search.stopover?.leg ?? 'any'}
                onChange={e => update('stopover', { ...(search.stopover ?? {}), leg: e.target.value })}
                style={inputStyle}>
                <option value="any">Cualquiera</option>
                <option value="outbound">Solo ida</option>
                <option value="inbound">Solo vuelta</option>
              </select>
            </div>
          </div>
          <button type="button"
            onClick={() => update('stopover', null)}
            style={{
              marginTop: 8, background: 'transparent', border: '1px solid #e5e7eb',
              padding: '4px 10px', borderRadius: 4, fontSize: 12, color: '#6b7280', cursor: 'pointer',
            }}>
            Sin escala extendida
          </button>
        </div>
        </>)}

        <div style={sectionStyle}>
          <h2 style={sectionTitle}>Pasajeros</h2>
          <div style={{ width: 120 }}>
            <input type="number" min={1} max={9} value={search.passengers}
              onChange={e => update('passengers', parseInt(e.target.value, 10))} style={inputStyle} />
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={sectionTitle}>Alertas — Precios (USD por persona)</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Máximo (descartar)</label>
              <input type="number" value={search.alertConfig?.maxPricePerPerson ?? ''}
                onChange={e => update('alertConfig.maxPricePerPerson', parseFloat(e.target.value))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Target (good)</label>
              <input type="number" value={search.alertConfig?.targetPricePerPerson ?? ''}
                onChange={e => update('alertConfig.targetPricePerPerson', parseFloat(e.target.value))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Dream (urgent)</label>
              <input type="number" value={search.alertConfig?.dreamPricePerPerson ?? ''}
                onChange={e => update('alertConfig.dreamPricePerPerson', parseFloat(e.target.value))} style={inputStyle} />
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={sectionTitle}>Filtros</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Máx. escalas no planificadas</label>
              <input type="number" min={0} value={search.filters?.maxUnplannedStops ?? 1}
                onChange={e => update('filters.maxUnplannedStops', parseInt(e.target.value, 10))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Máx. tiempo de viaje por tramo (horas, 0 = sin límite)</label>
              <input type="number" min={0} value={search.filters?.maxTotalTravelTime ?? 0}
                onChange={e => update('filters.maxTotalTravelTime', parseInt(e.target.value, 10))} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={search.filters?.requireCarryOn ?? false}
                  onChange={e => update('filters.requireCarryOn', e.target.checked)} />
                Requiere carry-on incluido
              </label>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Aerolíneas en blacklist (separadas por coma)</label>
              <input value={(search.filters?.airlineBlacklist ?? []).join(', ')}
                onChange={e => update('filters.airlineBlacklist', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
                placeholder="Spirit, Frontier" style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Aerolíneas preferidas (separadas por coma)</label>
              <input value={(search.filters?.airlinePreferred ?? []).join(', ')}
                onChange={e => update('filters.airlinePreferred', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
                placeholder="LATAM, Aerolineas Argentinas" style={inputStyle} />
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving} style={{
          background: '#2563eb', color: '#fff', padding: '12px 32px',
          borderRadius: 6, border: 'none', fontSize: 15, cursor: 'pointer',
          opacity: saving ? 0.6 : 1, fontWeight: 600,
        }}>
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </form>
    </div>
  );
}
