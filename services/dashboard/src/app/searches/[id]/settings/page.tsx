'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function SearchSettingsPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div style={{ padding: 32, maxWidth: 600 }}>
      <Link href={`/searches/${id}`} style={{ color: '#2563eb', fontSize: 14 }}>← Volver a la búsqueda</Link>
      <h1 style={{ margin: '12px 0 24px', fontSize: 24 }}>Configuración</h1>
      <div style={{
        background: '#fef3c7',
        border: '1px solid #fcd34d',
        borderRadius: 8,
        padding: 16,
        color: '#78350f',
      }}>
        <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Edición no disponible en el modelo waypoints</p>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          Esta vista todavía no fue adaptada al nuevo modelo de waypoints. Para modificar
          una búsqueda existente, borrala desde el listado y volvé a crearla desde{' '}
          <Link href="/searches/new" style={{ color: '#92400e', textDecoration: 'underline' }}>
            /searches/new
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
