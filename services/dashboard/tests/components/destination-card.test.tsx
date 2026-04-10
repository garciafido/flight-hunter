import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DestinationCard } from '@/components/destination-card';

afterEach(() => cleanup());

const defaultProps = {
  iata: 'CUZ',
  minPrice: 285,
  currency: 'USD',
  resultCount: 12,
};

describe('DestinationCard', () => {
  it('renders the IATA code', () => {
    render(<DestinationCard {...defaultProps} />);
    expect(screen.getByText('CUZ')).toBeDefined();
  });

  it('renders price and currency', () => {
    render(<DestinationCard {...defaultProps} />);
    expect(screen.getByText(/USD 285/)).toBeDefined();
  });

  it('renders result count', () => {
    render(<DestinationCard {...defaultProps} />);
    expect(screen.getByText(/12 resultado/)).toBeDefined();
  });

  it('renders singular "resultado" when count is 1', () => {
    render(<DestinationCard {...defaultProps} resultCount={1} />);
    expect(screen.getByText('1 resultado')).toBeDefined();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<DestinationCard {...defaultProps} onClick={onClick} />);
    const card = screen.getByRole('button');
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('calls onClick when Enter key pressed', () => {
    const onClick = vi.fn();
    render(<DestinationCard {...defaultProps} onClick={onClick} />);
    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not crash without onClick', () => {
    render(<DestinationCard {...defaultProps} />);
    expect(screen.getByText('CUZ')).toBeDefined();
  });

  it('rounds price to integer', () => {
    render(<DestinationCard {...defaultProps} minPrice={285.7} />);
    expect(screen.getByText(/286/)).toBeDefined();
  });
});
