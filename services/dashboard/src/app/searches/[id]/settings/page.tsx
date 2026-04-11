'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchSearch } from '@/lib/api';
import { SearchForm, searchRowToFormState } from '@/components/search-form';
import type { FormState } from '@/components/search-form';

export default function SearchSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [initialState, setInitialState] = useState<Partial<FormState> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSearch(id)
      .then((row) => setInitialState(searchRowToFormState(row)))
      .catch((err) => setError(err?.message ?? 'Error al cargar la búsqueda'));
  }, [id]);

  if (error) {
    return (
      <div style={{ padding: 32, maxWidth: 700 }}>
        <Link href={`/searches/${id}`} style={{ color: '#2563eb', fontSize: 14 }}>← Volver a la búsqueda</Link>
        <h1 style={{ margin: '12px 0 24px', fontSize: 24 }}>Configuración</h1>
        <div style={{ color: '#dc2626' }}>{error}</div>
      </div>
    );
  }

  if (!initialState) {
    return (
      <div style={{ padding: 32, maxWidth: 700 }}>
        <Link href={`/searches/${id}`} style={{ color: '#2563eb', fontSize: 14 }}>← Volver a la búsqueda</Link>
        <h1 style={{ margin: '12px 0 24px', fontSize: 24 }}>Configuración</h1>
        <div>Cargando...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 700 }}>
      <Link href={`/searches/${id}`} style={{ color: '#2563eb', fontSize: 14 }}>← Volver a la búsqueda</Link>
      <h1 style={{ margin: '12px 0 24px', fontSize: 24 }}>Editar búsqueda</h1>
      <SearchForm
        searchId={id}
        initialState={initialState}
        onUpdated={() => {
          // Optionally bounce back to detail page after a moment
          setTimeout(() => router.push(`/searches/${id}`), 1500);
        }}
      />
    </div>
  );
}
