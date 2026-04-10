'use client';

import { useRouter } from 'next/navigation';
import { SearchForm } from '@/components/search-form';

export default function NewSearchPage() {
  const router = useRouter();

  return (
    <div>
      <h1 style={{ margin: '0 0 24px', fontSize: 24 }}>Nueva Búsqueda</h1>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 32 }}>
        <SearchForm onCreated={(search) => router.push(`/searches/${search.id}`)} />
      </div>
    </div>
  );
}
