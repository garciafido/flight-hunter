import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FlightCard } from '@/components/flight-card';

afterEach(() => cleanup());

const defaultProps = {
  airline: 'LATAM',
  departureAirport: 'SCL',
  arrivalAirport: 'MAD',
  departureTime: '2026-06-01T08:00:00Z',
  returnTime: '2026-06-20T18:00:00Z',
  price: 850,
  currency: 'USD',
  score: 72,
  bookingUrl: 'https://example.com/book',
};

describe('FlightCard', () => {
  it('renders airline and route', () => {
    render(<FlightCard {...defaultProps} />);
    expect(screen.getByText(/LATAM/)).toBeDefined();
    expect(screen.getByText(/SCL/)).toBeDefined();
    expect(screen.getByText(/MAD/)).toBeDefined();
  });

  it('renders price and currency', () => {
    render(<FlightCard {...defaultProps} />);
    expect(screen.getByText(/USD 850/)).toBeDefined();
  });

  it('renders score', () => {
    render(<FlightCard {...defaultProps} />);
    expect(screen.getByText('Score: 72/100')).toBeDefined();
  });

  it('renders booking link', () => {
    render(<FlightCard {...defaultProps} />);
    const link = screen.getByRole('link', { name: /reservar/i });
    expect(link.getAttribute('href')).toBe('https://example.com/book');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('renders departure and return dates', () => {
    render(<FlightCard {...defaultProps} />);
    expect(screen.getByText(/2026-06-01/)).toBeDefined();
    expect(screen.getByText(/2026-06-20/)).toBeDefined();
  });

  it('renders alert badge when alertLevel is provided', () => {
    render(<FlightCard {...defaultProps} alertLevel="urgent" />);
    expect(screen.getByText('URGENT')).toBeDefined();
  });

  it('does not render alert badge when alertLevel is omitted', () => {
    render(<FlightCard {...defaultProps} />);
    expect(screen.queryByText('URGENT')).toBeNull();
    expect(screen.queryByText('GOOD')).toBeNull();
  });

  it('renders stopover info when provided', () => {
    render(<FlightCard {...defaultProps} stopoverAirport="LHR" stopoverDays={3} />);
    expect(screen.getByText(/Escala LHR: 3 días/)).toBeDefined();
  });

  it('does not render stopover when not provided', () => {
    render(<FlightCard {...defaultProps} />);
    expect(screen.queryByText(/Escala/)).toBeNull();
  });
});
