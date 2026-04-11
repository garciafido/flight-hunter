'use client';

import { useEffect, useState } from 'react';

interface BaggagePolicy {
  carryOnUSD: number;
  checkedBagUSD: number;
  note?: string;
}

interface RuntimeConfig {
  baggagePolicies: Record<string, BaggagePolicy>;
  argTaxes: { pais: number; rg5232: number };
  notifierDedupTtlMs: number;
  notifierCooldownMs: number;
  scraperMaxDatesPerPair: number;
  maxWaypoints: number;
}

interface ApiResponse {
  current: RuntimeConfig;
  defaults: RuntimeConfig;
  override: Partial<RuntimeConfig> | null;
}

const sectionStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 20,
  marginBottom: 20,
};

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  fontSize: 14,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  marginBottom: 4,
  fontWeight: 500,
  color: '#374151',
};

const buttonPrimary: React.CSSProperties = {
  padding: '7px 16px',
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
  border: 'none',
  background: '#2563eb',
  color: '#fff',
  fontWeight: 600,
};

const buttonSecondary: React.CSSProperties = {
  padding: '7px 16px',
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#374151',
};

function msToHours(ms: number): number {
  return Math.round((ms / 3_600_000) * 100) / 100;
}

function hoursToMs(h: number): number {
  return Math.round(h * 3_600_000);
}

export function RuntimeConfigSection() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [draft, setDraft] = useState<RuntimeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch('/api/system/runtime-config')
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        setData(d);
        setDraft(structuredClone(d.current));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/system/runtime-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setMessage('Guardado. Los servicios aplicarán los cambios en ≤30 segundos.');
      load();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 5000);
    }
  }

  async function handleResetAll() {
    if (!confirm('¿Restaurar TODOS los valores a los defaults? Esta acción borra los overrides en la base de datos.')) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/system/runtime-config', { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMessage('Defaults restaurados. Los servicios aplicarán los cambios en ≤30 segundos.');
      load();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 5000);
    }
  }

  function resetSection(key: keyof RuntimeConfig) {
    if (!data || !draft) return;
    setDraft({ ...draft, [key]: structuredClone(data.defaults[key]) });
  }

  function updateBaggageRow(airline: string, field: keyof BaggagePolicy, value: string | number) {
    if (!draft) return;
    const policies = { ...draft.baggagePolicies };
    policies[airline] = { ...policies[airline], [field]: field === 'note' ? String(value) : Number(value) };
    setDraft({ ...draft, baggagePolicies: policies });
  }

  function deleteBaggageRow(airline: string) {
    if (!draft) return;
    const policies = { ...draft.baggagePolicies };
    delete policies[airline];
    setDraft({ ...draft, baggagePolicies: policies });
  }

  function addBaggageRow() {
    if (!draft) return;
    const newName = prompt('Nombre de la aerolínea (ej. JetSMART):');
    if (!newName) return;
    if (draft.baggagePolicies[newName]) {
      alert('Ya existe esa aerolínea');
      return;
    }
    setDraft({
      ...draft,
      baggagePolicies: {
        ...draft.baggagePolicies,
        [newName]: { carryOnUSD: 0, checkedBagUSD: 0 },
      },
    });
  }

  if (loading || !draft || !data) return <div>Cargando configuración...</div>;

  const multiplier = 1 + draft.argTaxes.pais + draft.argTaxes.rg5232;

  const sortedAirlines = Object.keys(draft.baggagePolicies).sort();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Configuración</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {message && (
            <span style={{ fontSize: 13, color: message.startsWith('Error') ? '#dc2626' : '#16a34a' }}>
              {message}
            </span>
          )}
          <button onClick={handleSave} disabled={saving} style={{ ...buttonPrimary, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          <button onClick={handleResetAll} disabled={saving} style={{ ...buttonSecondary, color: '#dc2626', borderColor: '#fca5a5' }}>
            Restaurar todo
          </button>
        </div>
      </div>

      {/* AR Taxes */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Impuestos Argentina</h3>
          <button onClick={() => resetSection('argTaxes')} style={{ ...buttonSecondary, fontSize: 11, padding: '4px 10px' }}>
            Restaurar default
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>Impuesto PAIS (%)</label>
            <input
              type="number"
              min="0"
              max="200"
              step="0.5"
              value={draft.argTaxes.pais * 100}
              onChange={(e) => setDraft({ ...draft, argTaxes: { ...draft.argTaxes, pais: Number(e.target.value) / 100 } })}
              style={{ ...inputStyle, width: '100%' }}
            />
            <span style={{ fontSize: 11, color: '#9ca3af' }}>default: {data.defaults.argTaxes.pais * 100}%</span>
          </div>
          <div>
            <label style={labelStyle}>Percepción RG 5232 (%)</label>
            <input
              type="number"
              min="0"
              max="200"
              step="0.5"
              value={draft.argTaxes.rg5232 * 100}
              onChange={(e) => setDraft({ ...draft, argTaxes: { ...draft.argTaxes, rg5232: Number(e.target.value) / 100 } })}
              style={{ ...inputStyle, width: '100%' }}
            />
            <span style={{ fontSize: 11, color: '#9ca3af' }}>default: {data.defaults.argTaxes.rg5232 * 100}%</span>
          </div>
          <div>
            <label style={labelStyle}>Multiplicador resultante</label>
            <div style={{ padding: '6px 10px', fontSize: 14, fontWeight: 700, color: '#1e40af' }}>
              ×{multiplier.toFixed(2)}
            </div>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>1 + PAIS + RG 5232</span>
          </div>
        </div>
      </div>

      {/* Tunables */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Tunables del sistema</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>
              Dedup TTL del notifier (horas){' '}
              <button onClick={() => setDraft({ ...draft, notifierDedupTtlMs: data.defaults.notifierDedupTtlMs })} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 11, cursor: 'pointer' }}>
                ↺
              </button>
            </label>
            <input
              type="number"
              min="0.1"
              step="0.5"
              value={msToHours(draft.notifierDedupTtlMs)}
              onChange={(e) => setDraft({ ...draft, notifierDedupTtlMs: hoursToMs(Number(e.target.value)) })}
              style={{ ...inputStyle, width: '100%' }}
            />
            <span style={{ fontSize: 11, color: '#9ca3af' }}>default: {msToHours(data.defaults.notifierDedupTtlMs)}h — cuánto suprimir re-alertar el mismo vuelo</span>
          </div>
          <div>
            <label style={labelStyle}>
              Cooldown del notifier (horas){' '}
              <button onClick={() => setDraft({ ...draft, notifierCooldownMs: data.defaults.notifierCooldownMs })} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 11, cursor: 'pointer' }}>
                ↺
              </button>
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={msToHours(draft.notifierCooldownMs)}
              onChange={(e) => setDraft({ ...draft, notifierCooldownMs: hoursToMs(Number(e.target.value)) })}
              style={{ ...inputStyle, width: '100%' }}
            />
            <span style={{ fontSize: 11, color: '#9ca3af' }}>default: {msToHours(data.defaults.notifierCooldownMs)}h — pausa mínima entre alertas</span>
          </div>
          <div>
            <label style={labelStyle}>
              Max fechas por par (scraper){' '}
              <button onClick={() => setDraft({ ...draft, scraperMaxDatesPerPair: data.defaults.scraperMaxDatesPerPair })} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 11, cursor: 'pointer' }}>
                ↺
              </button>
            </label>
            <input
              type="number"
              min="1"
              max="60"
              value={draft.scraperMaxDatesPerPair}
              onChange={(e) => setDraft({ ...draft, scraperMaxDatesPerPair: Number(e.target.value) })}
              style={{ ...inputStyle, width: '100%' }}
            />
            <span style={{ fontSize: 11, color: '#9ca3af' }}>default: {data.defaults.scraperMaxDatesPerPair} — cobertura por par origen→destino</span>
          </div>
          <div>
            <label style={labelStyle}>
              Max waypoints permitidos{' '}
              <button onClick={() => setDraft({ ...draft, maxWaypoints: data.defaults.maxWaypoints })} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 11, cursor: 'pointer' }}>
                ↺
              </button>
            </label>
            <input
              type="number"
              min="1"
              max="8"
              value={draft.maxWaypoints}
              onChange={(e) => setDraft({ ...draft, maxWaypoints: Number(e.target.value) })}
              style={{ ...inputStyle, width: '100%' }}
            />
            <span style={{ fontSize: 11, color: '#9ca3af' }}>default: {data.defaults.maxWaypoints} — factorial blowup safety cap</span>
          </div>
        </div>
      </div>

      {/* Baggage policies table */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Política de equipaje por aerolínea</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addBaggageRow} style={{ ...buttonSecondary, fontSize: 11, padding: '4px 10px' }}>
              + Agregar
            </button>
            <button onClick={() => resetSection('baggagePolicies')} style={{ ...buttonSecondary, fontSize: 11, padding: '4px 10px' }}>
              Restaurar default
            </button>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 0, marginBottom: 12 }}>
          Estimación worst-case (tarifa básica) por persona. Editable. Usado por el analyzer para calcular el costo total con equipaje en cada alerta.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Aerolínea</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Carry-on USD</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Valija USD</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Nota</th>
                <th style={{ padding: '8px 10px', width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {sortedAirlines.map((airline) => {
                const p = draft.baggagePolicies[airline];
                return (
                  <tr key={airline} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 500 }}>{airline}</td>
                    <td style={{ padding: '6px 10px' }}>
                      <input
                        type="number"
                        min="0"
                        max="500"
                        value={p.carryOnUSD}
                        onChange={(e) => updateBaggageRow(airline, 'carryOnUSD', e.target.value)}
                        style={{ ...inputStyle, width: 80 }}
                      />
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <input
                        type="number"
                        min="0"
                        max="500"
                        value={p.checkedBagUSD}
                        onChange={(e) => updateBaggageRow(airline, 'checkedBagUSD', e.target.value)}
                        style={{ ...inputStyle, width: 80 }}
                      />
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <input
                        type="text"
                        value={p.note ?? ''}
                        onChange={(e) => updateBaggageRow(airline, 'note', e.target.value)}
                        placeholder="(opcional)"
                        style={{ ...inputStyle, width: '100%', minWidth: 200 }}
                      />
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                      <button
                        onClick={() => deleteBaggageRow(airline)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16 }}
                        title="Eliminar"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
