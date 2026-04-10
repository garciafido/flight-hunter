'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchSearches, deleteSearch } from '@/lib/api';

export default function SearchesPage() {
  const [searches, setSearches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

      {searches.length === 0 && (
        <div style={{ color: '#6b7280', textAlign: 'center', paddingTop: 64 }}>
          No hay búsquedas activas.{' '}
          <Link href="/searches/new" style={{ color: '#2563eb' }}>Crea una nueva</Link>
        </div>
      )}

      {searches.map((s: any) => (
        <div key={s.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <Link href={`/searches/${s.id}`} style={{ color: '#1e293b', fontWeight: 600, fontSize: 16, textDecoration: 'none' }}>
                {s.name}
              </Link>
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
      ))}
    </div>
  );
}
