import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AlertBadge } from '@/components/alert-badge';

afterEach(() => cleanup());

describe('AlertBadge', () => {
  it('renders urgent level with correct colors', () => {
    render(<AlertBadge level="urgent" />);
    const badge = screen.getByText('URGENT');
    expect(badge.style.background).toBe('rgb(254, 242, 242)');
    expect(badge.style.color).toBe('rgb(220, 38, 38)');
  });

  it('renders good level with correct colors', () => {
    render(<AlertBadge level="good" />);
    const badge = screen.getByText('GOOD');
    expect(badge.style.background).toBe('rgb(240, 253, 244)');
    expect(badge.style.color).toBe('rgb(22, 163, 74)');
  });

  it('renders info level with correct colors', () => {
    render(<AlertBadge level="info" />);
    const badge = screen.getByText('INFO');
    expect(badge.style.background).toBe('rgb(239, 246, 255)');
    expect(badge.style.color).toBe('rgb(37, 99, 235)');
  });

  it('falls back to info style for unknown level', () => {
    render(<AlertBadge level="unknown" />);
    const badge = screen.getByText('UNKNOWN');
    expect(badge.style.background).toBe('rgb(239, 246, 255)');
    expect(badge.style.color).toBe('rgb(37, 99, 235)');
  });

  it('displays the level text in uppercase', () => {
    render(<AlertBadge level="good" />);
    expect(screen.getByText('GOOD')).toBeDefined();
  });
});
