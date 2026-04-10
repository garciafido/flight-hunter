'use client';

import { useState } from 'react';
import { createSearch } from '@/lib/api';

interface SearchFormProps {
  onCreated?: (search: any) => void;
}

export function SearchForm({ onCreated }: SearchFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    origin: '',
    destination: '',
    stopoverAirport: '',
    stopoverMinDays: '',
    stopoverMaxDays: '',
    departureFrom: '',
    departureTo: '',
    returnMinDays: '',
    returnMaxDays: '',
    passengers: '1',
    filters: '{}',
    scoreThresholdInfo: '30',
    scoreThresholdGood: '60',
    scoreThresholdUrgent: '80',
    maxPricePerPerson: '',
    targetPricePerPerson: '',
    dreamPricePerPerson: '',
    currency: 'USD',
    proxyRegions: [] as string[],
    scanIntervalMin: '60',
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let filters: any = {};
      try { filters = JSON.parse(form.filters); } catch { filters = {}; }

      const payload: any = {
        name: form.name,
        origin: form.origin,
        destination: form.destination,
        departureFrom: form.departureFrom,
        departureTo: form.departureTo,
        returnMinDays: parseInt(form.returnMinDays, 10),
        returnMaxDays: parseInt(form.returnMaxDays, 10),
        passengers: parseInt(form.passengers, 10),
        filters,
        alertConfig: {
          scoreThresholds: {
            info: parseInt(form.scoreThresholdInfo, 10),
            good: parseInt(form.scoreThresholdGood, 10),
            urgent: parseInt(form.scoreThresholdUrgent, 10),
          },
          maxPricePerPerson: parseFloat(form.maxPricePerPerson),
          targetPricePerPerson: form.targetPricePerPerson ? parseFloat(form.targetPricePerPerson) : undefined,
          dreamPricePerPerson: form.dreamPricePerPerson ? parseFloat(form.dreamPricePerPerson) : undefined,
          currency: form.currency,
        },
        proxyRegions: form.proxyRegions,
        scanIntervalMin: parseInt(form.scanIntervalMin, 10),
      };

      if (form.stopoverAirport) {
        payload.stopover = {
          airport: form.stopoverAirport,
          minDays: parseInt(form.stopoverMinDays, 10),
          maxDays: parseInt(form.stopoverMaxDays, 10),
        };
      }

      const result = await createSearch(payload);
      onCreated?.(result);
    } catch (err: any) {
      setError(err.message ?? 'Error al crear búsqueda');
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

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 600 }}>
      {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Información General</div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Nombre</label>
          <input name="name" value={form.name} onChange={handleChange} required style={inputStyle} />
        </div>
        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Origen</label>
            <input name="origin" value={form.origin} onChange={handleChange} required style={inputStyle} placeholder="SCL" />
          </div>
          <div>
            <label style={labelStyle}>Destino</label>
            <input name="destination" value={form.destination} onChange={handleChange} required style={inputStyle} placeholder="MAD" />
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Escala (Opcional)</div>
        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Aeropuerto de Escala</label>
            <input name="stopoverAirport" value={form.stopoverAirport} onChange={handleChange} style={inputStyle} placeholder="LHR" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={labelStyle}>Min Días</label>
              <input name="stopoverMinDays" value={form.stopoverMinDays} onChange={handleChange} type="number" min="0" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Max Días</label>
              <input name="stopoverMaxDays" value={form.stopoverMaxDays} onChange={handleChange} type="number" min="0" style={inputStyle} />
            </div>
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Fechas y Estadía</div>
        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Salida Desde</label>
            <input name="departureFrom" value={form.departureFrom} onChange={handleChange} type="date" required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Salida Hasta</label>
            <input name="departureTo" value={form.departureTo} onChange={handleChange} type="date" required style={inputStyle} />
          </div>
        </div>
        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Mín Días de Retorno</label>
            <input name="returnMinDays" value={form.returnMinDays} onChange={handleChange} type="number" min="1" required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Máx Días de Retorno</label>
            <input name="returnMaxDays" value={form.returnMaxDays} onChange={handleChange} type="number" min="1" required style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Pasajeros</label>
          <input name="passengers" value={form.passengers} onChange={handleChange} type="number" min="1" max="9" required style={{ ...inputStyle, width: 80 }} />
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Filtros (JSON)</div>
        <textarea name="filters" value={form.filters} onChange={handleChange} rows={4}
          style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }} />
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Configuración de Alertas</div>
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
            <label style={labelStyle}>Precio Máx / Persona</label>
            <input name="maxPricePerPerson" value={form.maxPricePerPerson} onChange={handleChange} type="number" min="0" required style={inputStyle} />
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
            <label style={labelStyle}>Precio Objetivo / Persona</label>
            <input name="targetPricePerPerson" value={form.targetPricePerPerson} onChange={handleChange} type="number" min="0" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Precio Soñado / Persona</label>
            <input name="dreamPricePerPerson" value={form.dreamPricePerPerson} onChange={handleChange} type="number" min="0" style={inputStyle} />
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Regiones de Proxy</div>
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

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Escaneo</div>
        <label style={labelStyle}>Intervalo de Escaneo (minutos)</label>
        <input name="scanIntervalMin" value={form.scanIntervalMin} onChange={handleChange} type="number" min="5" required style={{ ...inputStyle, width: 120 }} />
      </div>

      <button type="submit" disabled={loading}
        style={{ background: '#2563eb', color: '#fff', padding: '10px 24px', borderRadius: 6, border: 'none', fontSize: 15, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
        {loading ? 'Creando...' : 'Crear Búsqueda'}
      </button>
    </form>
  );
}
