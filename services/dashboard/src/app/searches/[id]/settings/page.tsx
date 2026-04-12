'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchSearch, createSearch } from '@/lib/api';
import { SearchForm, searchRowToFormState } from '@/components/search-form';
import type { FormState } from '@/components/search-form';

export default function SearchSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [initialState, setInitialState] = useState<Partial<FormState> | null>(null);
  const [searchRow, setSearchRow] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);

  useEffect(() => {
    fetchSearch(id)
      .then((row) => {
        setSearchRow(row);
        setInitialState(searchRowToFormState(row));
      })
      .catch((err) => setError(err?.message ?? 'Error al cargar la búsqueda'));
  }, [id]);

  async function handleDuplicate() {
    if (!searchRow) return;
    setDuplicating(true);
    try {
      const formState = searchRowToFormState(searchRow);
      // Build the payload — same logic as SearchForm submit
      const airlineBlacklist = formState.airlineBlacklist
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
      const payload = {
        active: true,
        name: `${formState.name} II`,
        origin: formState.origin,
        passengers: Number(formState.passengers),
        departureFrom: formState.departureFrom,
        departureTo: formState.departureTo,
        maxConnectionHours: Number(formState.maxConnectionHours),
        returnCheckedBags: Number(formState.returnCheckedBags),
        waypoints: formState.waypoints.map((wp) => ({
          airport: wp.airport,
          gap: wp.type === 'stay'
            ? { type: 'stay' as const, minDays: Number(wp.minDays), maxDays: Number(wp.maxDays) }
            : { type: 'connection' as const, maxHours: Number(wp.maxHours) },
          ...(wp.pin !== 'none' ? { pin: wp.pin } : {}),
          checkedBags: Number(wp.checkedBags) || 0,
        })),
        filters: {
          airlineBlacklist,
          airlinePreferred: [],
          airportPreferred: {},
          airportBlacklist: {},
          maxUnplannedStops: Number(formState.maxUnplannedStops),
          requireCarryOn: formState.requireCarryOn,
          maxTotalTravelTime: Number(formState.maxTotalTravelHours),
        },
        alertConfig: {
          scoreThresholds: {
            info: Number(formState.scoreThresholdInfo),
            good: Number(formState.scoreThresholdGood),
            urgent: Number(formState.scoreThresholdUrgent),
          },
          maxPricePerPerson: Number(formState.maxPricePerPerson),
          ...(formState.targetPricePerPerson !== '' ? { targetPricePerPerson: Number(formState.targetPricePerPerson) } : {}),
          ...(formState.dreamPricePerPerson !== '' ? { dreamPricePerPerson: Number(formState.dreamPricePerPerson) } : {}),
          currency: formState.currency,
        },
        proxyRegions: formState.proxyRegions,
        scanIntervalMin: Number(formState.scanIntervalMin),
      };
      const newSearch = await createSearch(payload);
      router.push(`/searches/${newSearch.id}/settings`);
    } catch (err: any) {
      setError(err?.message ?? 'Error al duplicar');
    } finally {
      setDuplicating(false);
    }
  }

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Link href={`/searches/${id}`} style={{ color: '#2563eb', fontSize: 14 }}>← Volver a la búsqueda</Link>
        <button
          type="button"
          onClick={handleDuplicate}
          disabled={duplicating}
          style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
            border: '1px solid #d1d5db', background: '#fff', color: '#374151',
            opacity: duplicating ? 0.6 : 1,
          }}
        >
          {duplicating ? 'Duplicando...' : '📋 Duplicar como nueva'}
        </button>
      </div>
      <h1 style={{ margin: '12px 0 24px', fontSize: 24 }}>Editar búsqueda</h1>
      <SearchForm
        searchId={id}
        initialState={initialState}
        onUpdated={() => {
          setTimeout(() => router.push(`/searches/${id}`), 1500);
        }}
      />
    </div>
  );
}
