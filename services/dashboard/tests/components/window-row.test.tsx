import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { WindowRow } from '@/components/window-row';

afterEach(() => cleanup());

const defaultProps = {
  start: '2026-07-05',
  end: '2026-07-19',
  duration: 14,
  minPrice: 380,
  currency: 'USD',
  resultCount: 5,
};

describe('WindowRow', () => {
  it('renders start and end dates', () => {
    render(<WindowRow {...defaultProps} />);
    expect(screen.getByText(/2026-07-05/)).toBeDefined();
    expect(screen.getByText(/2026-07-19/)).toBeDefined();
  });

  it('renders duration', () => {
    render(<WindowRow {...defaultProps} />);
    expect(screen.getByText(/14 días/)).toBeDefined();
  });

  it('renders singular "día" when duration is 1', () => {
    render(<WindowRow {...defaultProps} duration={1} />);
    expect(screen.getByText(/1 día/)).toBeDefined();
  });

  it('renders price and currency', () => {
    render(<WindowRow {...defaultProps} />);
    expect(screen.getByText(/USD 380/)).toBeDefined();
  });

  it('renders result count', () => {
    render(<WindowRow {...defaultProps} />);
    expect(screen.getByText(/5 resultado/)).toBeDefined();
  });

  it('renders booking link when bookingUrl is provided', () => {
    render(<WindowRow {...defaultProps} bookingUrl="https://example.com/book" />);
    const link = screen.getByRole('link', { name: /Reservar/i });
    expect(link.getAttribute('href')).toBe('https://example.com/book');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('renders Ver button when onBook is provided', () => {
    const onBook = vi.fn();
    render(<WindowRow {...defaultProps} onBook={onBook} />);
    const btn = screen.getByRole('button', { name: /Ver/i });
    fireEvent.click(btn);
    expect(onBook).toHaveBeenCalledOnce();
  });

  it('renders no action button when neither bookingUrl nor onBook provided', () => {
    render(<WindowRow {...defaultProps} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
