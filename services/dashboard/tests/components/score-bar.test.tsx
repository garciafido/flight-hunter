import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ScoreBar } from '@/components/score-bar';

afterEach(() => cleanup());

describe('ScoreBar', () => {
  it('renders a bar with green color for score >= 75', () => {
    const { container } = render(<ScoreBar score={80} />);
    const inner = container.querySelectorAll('div')[1];
    expect(inner.style.background).toBe('rgb(34, 197, 94)');
    expect(inner.style.width).toBe('80%');
  });

  it('renders a bar with yellow color for score >= 50', () => {
    const { container } = render(<ScoreBar score={60} />);
    const inner = container.querySelectorAll('div')[1];
    expect(inner.style.background).toBe('rgb(234, 179, 8)');
    expect(inner.style.width).toBe('60%');
  });

  it('renders a bar with red color for score < 50', () => {
    const { container } = render(<ScoreBar score={30} />);
    const inner = container.querySelectorAll('div')[1];
    expect(inner.style.background).toBe('rgb(239, 68, 68)');
    expect(inner.style.width).toBe('30%');
  });

  it('clamps score above 100 to 100%', () => {
    const { container } = render(<ScoreBar score={150} />);
    const inner = container.querySelectorAll('div')[1];
    expect(inner.style.width).toBe('100%');
  });

  it('clamps score below 0 to 0%', () => {
    const { container } = render(<ScoreBar score={-10} />);
    const inner = container.querySelectorAll('div')[1];
    expect(inner.style.width).toBe('0%');
  });

  it('renders exactly at threshold 75 as green', () => {
    const { container } = render(<ScoreBar score={75} />);
    const inner = container.querySelectorAll('div')[1];
    expect(inner.style.background).toBe('rgb(34, 197, 94)');
  });

  it('renders exactly at threshold 50 as yellow', () => {
    const { container } = render(<ScoreBar score={50} />);
    const inner = container.querySelectorAll('div')[1];
    expect(inner.style.background).toBe('rgb(234, 179, 8)');
  });
});
