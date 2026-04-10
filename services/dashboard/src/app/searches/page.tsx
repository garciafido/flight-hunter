'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchSearches, deleteSearch } from '@/lib/api';

type StatusFilter = 'all' | 'active' | 'snoozed' | 'purchased' | 'archived';

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'Todas' },
  { key: 'active', label: 'Activas' },
  { key: 'snoozed', label: 'Pausadas' },
  { key: 'purchased', label: 'Compradas' },
  { key: 'archived', label: 'Archivadas' },
];

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  active: { label: 'Activa', bg: '#dcfce7', color: '#15803d' },
  snoozed: { label: 'Pausada', bg: '#fef9c3', color: '#854d0e' },
  purchased: { label: 'Comprada', bg: '#dbeafe', color: '#1d4ed8' },
  archived: { label: 'Archivada', bg: '#f3f4f6', color: '#6b7280' },
};

export default function SearchesPage() {
  const [searches, setSearches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    fetchSearches()
      .then(setSearches)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    if (!confirm('¿Desactivar esta búsqueda?')) return;
    await deleteSearch(id);
    setSearches(prev => prev.filter(s => s.id !== id));
  }

  const filtered = statusFilter === 'all'
    ? searches
    : searches.filter(s => (s.status ?? 'active') === statusFilter);

  if (loading) return <div>Cargando...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Búsquedas</h1>
        <Link href="/searches/new" style={{
          background: '#2563eb', color: '#fff', padding: '8px 18px',
          borderRadius: 6, textDecoration: 'none', fontSize: 14,
        }}>
          + Nueva Búsqueda
        </Link>
      </div>

      {/* Status filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
              border: statusFilter === key ? '2px solid #2563eb' : '1px solid #d1d5db',
              background: statusFilter === key ? '#eff6ff' : '#fff',
              color: statusFilter === key ? '#2563eb' : '#374151',
              fontWeight: statusFilter === key ? 600 : 400,
            }}
          >
            {label}
            {key !== 'all' && (
              <span style={{ marginLeft: 6, color: '#9ca3af', fontSize: 12 }}>
                ({searches.filter(s => (s.status ?? 'active') === key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ color: '#6b7280', textAlign: 'center', paddingTop: 64 }}>
          {statusFilter === 'all'
            ? <>No hay búsquedas. <Link href="/searches/new" style={{ color: '#2563eb' }}>Crea una nueva</Link></>
            : `No hay búsquedas con estado "${STATUS_FILTERS.find(f => f.key === statusFilter)?.label}".`}
        </div>
      )}

      {filtered.map((s: any) => {
        const status = s.status ?? 'active';
        const badge = STATUS_BADGE[status] ?? STATUS_BADGE.active;
        const tooltip =
          status === 'snoozed' && s.snoozedUntil
            ? `hasta ${new Date(s.snoozedUntil).toLocaleDateString('es')}`
            : undefined;

        return (
          <div key={s.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Link href={`/searches/${s.id}`} style={{ color: '#1e293b', fontWeight: 600, fontSize: 16, textDecoration: 'none' }}>
                    {s.name}
                  </Link>
                  <span
                    title={tooltip}
                    style={{
                      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: badge.bg, color: badge.color,
                    }}
                  >
                    {badge.label}
                  </span>
                </div>
                <div style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>
                  {s.origin} → {s.destination} · {s.passengers} pasajero(s) · c/d {s.scanIntervalMin} min
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Link href={`/searches/${s.id}/settings`} style={{
                  padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6,
                  fontSize: 13, color: '#374151', textDecoration: 'none',
                }}>
                  Editar
                </Link>
                <button onClick={() => handleDelete(s.id)} style={{
                  padding: '6px 14px', background: '#fef2f2', border: '1px solid #fca5a5',
                  borderRadius: 6, fontSize: 13, color: '#dc2626', cursor: 'pointer',
                }}>
                  Desactivar
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
