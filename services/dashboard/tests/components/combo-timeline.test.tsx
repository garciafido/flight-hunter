import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ComboTimeline, type ComboLeg } from '@/components/combo-timeline';

afterEach(() => cleanup());

describe('ComboTimeline', () => {
  it('renders nothing when legs array is empty', () => {
    const { container } = render(<ComboTimeline legs={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a single leg with departure and arrival airports', () => {
    const legs: ComboLeg[] = [
      {
        airline: 'JetSMART',
        currency: 'USD',
        price: 139,
        departureAirport: 'AEP',
        arrivalAirport: 'LIM',
        departureTime: '2026-07-28T08:40:00.000Z',
        arrivalTime: '2026-07-28T13:00:00.000Z',
        durationMinutes: 260,
      },
    ];
    render(<ComboTimeline legs={legs} />);
    expect(screen.getByText('AEP')).toBeDefined();
    expect(screen.getByText('LIM')).toBeDefined();
  });

  it('formats real times as HH:mm in UTC and shows duration', () => {
    const legs: ComboLeg[] = [
      {
        airline: 'JetSMART',
        currency: 'USD',
        price: 139,
        departureAirport: 'AEP',
        arrivalAirport: 'LIM',
        departureTime: '2026-07-28T08:40:00.000Z',
        arrivalTime: '2026-07-28T13:00:00.000Z',
        durationMinutes: 260,
      },
    ];
    const { container } = render(<ComboTimeline legs={legs} />);
    const text = container.textContent ?? '';
    expect(text).toContain('08:40');
    expect(text).toContain('13:00');
    expect(text).toContain('4h 20m');
    expect(text).toContain('JetSMART');
    expect(text).toContain('USD 139');
  });

  it('omits time and flight duration when times are midnight UTC', () => {
    const legs: ComboLeg[] = [
      {
        airline: 'LATAM',
        currency: 'USD',
        price: 200,
        departureAirport: 'AEP',
        arrivalAirport: 'LIM',
        departureTime: '2026-07-28T00:00:00.000Z',
        arrivalTime: '2026-07-28T00:00:00.000Z',
        durationMinutes: 0,
      },
    ];
    const { container } = render(<ComboTimeline legs={legs} />);
    const text = container.textContent ?? '';
    // No HH:mm rendered
    expect(text).not.toMatch(/\d{2}:\d{2}/);
    // Date is still rendered (28/07)
    expect(text).toContain('28/07');
    // No "hora local" footer when no real times
    expect(text).not.toContain('Horarios en hora local');
  });

  it('shows the local-time footer when at least one leg has real times', () => {
    const legs: ComboLeg[] = [
      {
        airline: 'JetSMART',
        currency: 'USD',
        price: 139,
        departureAirport: 'AEP',
        arrivalAirport: 'LIM',
        departureTime: '2026-07-28T08:40:00.000Z',
        arrivalTime: '2026-07-28T13:00:00.000Z',
        durationMinutes: 260,
      },
    ];
    render(<ComboTimeline legs={legs} />);
    expect(screen.getByText(/Horarios en hora local/)).toBeDefined();
  });

  it('renders a stay separator with hotel emoji for short stopovers (≤4 days)', () => {
    const legs: ComboLeg[] = [
      {
        airline: 'JetSMART',
        currency: 'USD',
        price: 139,
        departureAirport: 'AEP',
        arrivalAirport: 'LIM',
        departureTime: '2026-07-28T08:40:00.000Z',
        arrivalTime: '2026-07-28T13:00:00.000Z',
        durationMinutes: 260,
      },
      {
        airline: 'Sky Airline',
        currency: 'USD',
        price: 90,
        departureAirport: 'LIM',
        arrivalAirport: 'CUZ',
        departureTime: '2026-07-31T09:00:00.000Z',
        arrivalTime: '2026-07-31T10:30:00.000Z',
        durationMinutes: 90,
      },
    ];
    const { container } = render(<ComboTimeline legs={legs} />);
    const text = container.textContent ?? '';
    expect(text).toContain('🏨');
    expect(text).toContain('3 días en LIM');
  });

  it('renders a beach emoji for long stays (>4 days)', () => {
    const legs: ComboLeg[] = [
      {
        airline: 'JetSMART',
        currency: 'USD',
        price: 139,
        departureAirport: 'AEP',
        arrivalAirport: 'CUZ',
        departureTime: '2026-07-28T08:40:00.000Z',
        arrivalTime: '2026-07-28T15:00:00.000Z',
        durationMinutes: 380,
      },
      {
        airline: 'JetSMART',
        currency: 'USD',
        price: 139,
        departureAirport: 'CUZ',
        arrivalAirport: 'AEP',
        departureTime: '2026-08-09T14:00:00.000Z',
        arrivalTime: '2026-08-09T19:45:00.000Z',
        durationMinutes: 345,
      },
    ];
    const { container } = render(<ComboTimeline legs={legs} />);
    const text = container.textContent ?? '';
    expect(text).toContain('🏖');
    expect(text).toContain('12 días en CUZ');
  });

  it('renders a connection label for same-day stays (0 days)', () => {
    const legs: ComboLeg[] = [
      {
        airline: 'LATAM',
        currency: 'USD',
        price: 100,
        departureAirport: 'BUE',
        arrivalAirport: 'LIM',
        departureTime: '2026-07-28T08:00:00.000Z',
        arrivalTime: '2026-07-28T13:00:00.000Z',
        durationMinutes: 300,
      },
      {
        airline: 'LATAM',
        currency: 'USD',
        price: 100,
        departureAirport: 'LIM',
        arrivalAirport: 'CUZ',
        departureTime: '2026-07-28T16:00:00.000Z',
        arrivalTime: '2026-07-28T17:30:00.000Z',
        durationMinutes: 90,
      },
    ];
    const { container } = render(<ComboTimeline legs={legs} />);
    const text = container.textContent ?? '';
    expect(text).toContain('conexión');
  });

  it('renders a 3-leg combo with two stay separators', () => {
    const legs: ComboLeg[] = [
      {
        airline: 'JetSMART',
        currency: 'USD',
        price: 139,
        departureAirport: 'AEP',
        arrivalAirport: 'LIM',
        departureTime: '2026-07-28T08:40:00.000Z',
        arrivalTime: '2026-07-28T13:00:00.000Z',
        durationMinutes: 260,
      },
      {
        airline: 'Sky',
        currency: 'USD',
        price: 90,
        departureAirport: 'LIM',
        arrivalAirport: 'CUZ',
        departureTime: '2026-07-31T09:00:00.000Z',
        arrivalTime: '2026-07-31T10:30:00.000Z',
        durationMinutes: 90,
      },
      {
        airline: 'LATAM',
        currency: 'USD',
        price: 200,
        departureAirport: 'CUZ',
        arrivalAirport: 'BUE',
        departureTime: '2026-08-09T14:00:00.000Z',
        arrivalTime: '2026-08-09T19:45:00.000Z',
        durationMinutes: 345,
      },
    ];
    const { container } = render(<ComboTimeline legs={legs} />);
    const text = container.textContent ?? '';
    // First stay (LIM, 3 days)
    expect(text).toContain('3 días en LIM');
    // Second stay (CUZ, 9 days)
    expect(text).toContain('9 días en CUZ');
  });

  it('falls back to "Vuelo" label when airline is missing or "Unknown"', () => {
    const legs: ComboLeg[] = [
      {
        airline: 'Unknown',
        currency: 'USD',
        price: 100,
        departureAirport: 'AEP',
        arrivalAirport: 'LIM',
        departureTime: '2026-07-28T08:00:00.000Z',
        arrivalTime: '2026-07-28T12:00:00.000Z',
        durationMinutes: 240,
      },
    ];
    render(<ComboTimeline legs={legs} />);
    expect(screen.getByText(/Vuelo/)).toBeDefined();
  });

  it('renders a booking link when bookingUrl is provided', () => {
    const legs: ComboLeg[] = [
      {
        airline: 'JetSMART',
        currency: 'USD',
        price: 139,
        departureAirport: 'AEP',
        arrivalAirport: 'LIM',
        departureTime: '2026-07-28T08:40:00.000Z',
        arrivalTime: '2026-07-28T13:00:00.000Z',
        durationMinutes: 260,
        bookingUrl: 'https://example.com/booking/abc',
      },
    ];
    render(<ComboTimeline legs={legs} />);
    const link = screen.getByText('reservar') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('https://example.com/booking/abc');
  });

  it('falls back to derived duration when durationMinutes is missing', () => {
    const legs: ComboLeg[] = [
      {
        airline: 'JetSMART',
        currency: 'USD',
        price: 139,
        departureAirport: 'AEP',
        arrivalAirport: 'LIM',
        departureTime: '2026-07-28T08:00:00.000Z',
        arrivalTime: '2026-07-28T11:30:00.000Z',
        // durationMinutes intentionally omitted
      },
    ];
    const { container } = render(<ComboTimeline legs={legs} />);
    expect(container.textContent).toContain('3h 30m');
  });

  it('omits flight duration when both times are midnight UTC', () => {
    const legs: ComboLeg[] = [
      {
        airline: 'JetSMART',
        currency: 'USD',
        price: 139,
        departureAirport: 'AEP',
        arrivalAirport: 'LIM',
        departureTime: '2026-07-28T00:00:00.000Z',
        arrivalTime: '2026-07-28T00:00:00.000Z',
      },
    ];
    const { container } = render(<ComboTimeline legs={legs} />);
    const text = container.textContent ?? '';
    // Should not invent any "Xh Xm" duration
    expect(text).not.toMatch(/\d+h \d+m/);
    expect(text).not.toMatch(/\d+h(?!\d)/);
  });
});
