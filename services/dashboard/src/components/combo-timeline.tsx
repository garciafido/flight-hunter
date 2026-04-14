import React from 'react';

export interface ComboLeg {
  airline?: string;
  currency?: string;
  price?: number;
  departureAirport: string;
  arrivalAirport: string;
  departureTime?: string;
  arrivalTime?: string;
  bookingUrl?: string;
  durationMinutes?: number;
}

interface Props {
  legs: ComboLeg[];
  despegarUrl?: string;
}

interface ParsedTime {
  iso: string;
  date: string; // dd/mm
  hhmm: string | null; // null when midnight UTC (no real time)
}

function parseTime(iso: string | undefined): ParsedTime | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hasRealTime = !(d.getUTCHours() === 0 && d.getUTCMinutes() === 0);
  // Manual padding so the format is consistent across Node ICU builds and browsers
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const date = `${dd}/${mm}`;
  const hhmm = hasRealTime
    ? `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
    : null;
  return { iso, date, hhmm };
}

function formatDuration(minutes: number | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function flightDuration(leg: ComboLeg): string | null {
  // Only use the scraped duration (from Google Flights text "X hr Y min").
  // NEVER compute from timestamps — they're wall-clock in different timezones
  // so the diff gives wrong results (e.g., 16h instead of 7h for BUE→CUZ).
  return formatDuration(leg.durationMinutes);
}

function stayDays(prevArrival: string | undefined, nextDeparture: string | undefined): number | null {
  if (!prevArrival || !nextDeparture) return null;
  const a = new Date(prevArrival);
  const b = new Date(nextDeparture);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  if (b.getTime() <= a.getTime()) return null;
  // Count calendar-day difference (UTC) so e.g. arriving 28/07 13:00 and
  // departing 31/07 09:00 yields "3 días" (matches the user's mental model
  // of 3 nights), not floor(67h/24h)=2.
  const aDay = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bDay = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((bDay - aDay) / 86400000);
}

const dotStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: '50%',
  background: '#2563eb',
  flexShrink: 0,
  marginTop: 4,
};

const lineStyle: React.CSSProperties = {
  width: 2,
  background: '#cbd5e1',
  flexShrink: 0,
  marginLeft: 5,
};

const dottedStyle: React.CSSProperties = {
  width: 0,
  borderLeft: '2px dotted #cbd5e1',
  flexShrink: 0,
  marginLeft: 5,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6b7280',
  fontStyle: 'italic',
  marginLeft: 8,
};

const cityStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#0f172a',
};

const dateTimeStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#475569',
  marginLeft: 8,
};

export function ComboTimeline({ legs, despegarUrl }: Props) {
  if (!legs || legs.length === 0) return null;

  const rows: React.ReactNode[] = [];
  let anyRealTime = false;

  legs.forEach((leg, i) => {
    const dep = parseTime(leg.departureTime);
    const arr = parseTime(leg.arrivalTime);
    if (dep?.hhmm || arr?.hhmm) anyRealTime = true;

    const duration = flightDuration(leg);
    const airline = leg.airline && leg.airline !== 'Unknown' ? leg.airline : null;

    // Departure node
    rows.push(
      <div key={`dep-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
        <div style={dotStyle} />
        <div style={{ flex: 1 }}>
          <span style={cityStyle}>{leg.departureAirport}</span>
          <span style={dateTimeStyle}>
            {dep?.date ?? '—'}
            {dep?.hhmm && <> · {dep.hhmm}</>}
          </span>
        </div>
      </div>,
    );

    // Solid line connector with flight info
    rows.push(
      <div key={`line-${i}`} style={{ display: 'flex', alignItems: 'center', minHeight: 24 }}>
        <div style={{ ...lineStyle, height: 24 }} />
        <span style={labelStyle}>
          ✈ {airline ?? 'Vuelo'}
          {duration && <> · {duration}</>}
          {leg.price != null && (
            <> · {leg.currency ?? ''} {leg.price}/persona</>
          )}
          {leg.bookingUrl && (
            <>
              {' · '}
              {leg.bookingUrl.includes('/booking') || !leg.bookingUrl.includes('google.com/travel/flights?q=') ? (
                <>
                  <a
                    href={leg.bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#2563eb', textDecoration: 'underline', fontWeight: 600 }}
                  >
                    reservar
                  </a>
                </>
              ) : (
                <a
                  href={leg.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#2563eb', textDecoration: 'underline' }}
                  title={`Buscar en Google Flights: ${leg.airline ?? 'vuelo'} a las ${dep?.hhmm ?? ''}`}
                >
                  buscar en GF
                </a>
              )}
            </>
          )}
        </span>
      </div>,
    );

    // Arrival node
    rows.push(
      <div key={`arr-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
        <div style={dotStyle} />
        <div style={{ flex: 1 }}>
          <span style={cityStyle}>{leg.arrivalAirport}</span>
          <span style={dateTimeStyle}>
            {arr?.date ?? '—'}
            {arr?.hhmm && <> · {arr.hhmm}</>}
          </span>
        </div>
      </div>,
    );

    // If there's a next leg, add a stay separator
    const next = legs[i + 1];
    if (next) {
      const days = stayDays(leg.arrivalTime, next.departureTime);
      if (days != null) {
        const emoji = days <= 4 ? '🏨' : '🏖';
        const stayLabel =
          days === 0
            ? 'conexión'
            : `${days} ${days === 1 ? 'noche' : 'noches'} (${days + 1} días) en`;
        rows.push(
          <div key={`stay-${i}`} style={{ display: 'flex', alignItems: 'center', minHeight: 28 }}>
            <div style={{ ...dottedStyle, height: 28 }} />
            <span style={labelStyle}>
              {emoji} {stayLabel} {leg.arrivalAirport}
            </span>
          </div>,
        );
      }
    }
  });

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>{rows}</div>
      {despegarUrl && (
        <div style={{ marginTop: 8 }}>
          <a
            href={despegarUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#2563eb', textDecoration: 'underline', fontWeight: 600, fontSize: 13 }}
          >
            Buscar combo en Despegar.com
          </a>
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
        {anyRealTime && <>Horarios en hora local de cada aeropuerto · </>}
        Los links abren Google Flights en esa fecha — buscá el vuelo por aerolínea y horario
      </div>
    </div>
  );
}
