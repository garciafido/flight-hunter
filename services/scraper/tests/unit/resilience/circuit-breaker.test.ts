import { describe, it, expect, vi } from 'vitest';
import { CircuitBreaker } from '../../../src/resilience/circuit-breaker.js';

describe('CircuitBreaker', () => {
  it('executes function and returns result when closed', async () => {
    const cb = new CircuitBreaker(3, 60_000);
    const state = { status: 'closed' as const, consecutiveFailures: 0 };

    const { result, newState, skipped } = await cb.execute('test', state, async () => 42);

    expect(result).toBe(42);
    expect(skipped).toBe(false);
    expect(newState.status).toBe('closed');
    expect(newState.consecutiveFailures).toBe(0);
  });

  it('increments failure count on error', async () => {
    const cb = new CircuitBreaker(3, 60_000);
    const state = { status: 'closed' as const, consecutiveFailures: 0 };

    const { result, newState, skipped } = await cb.execute('test', state, async () => {
      throw new Error('Oops');
    });

    expect(result).toBeNull();
    expect(skipped).toBe(false);
    expect(newState.consecutiveFailures).toBe(1);
    expect(newState.status).toBe('closed');
  });

  it('opens circuit after reaching threshold', async () => {
    const cb = new CircuitBreaker(3, 60_000);
    let state = { status: 'closed' as const, consecutiveFailures: 2 };

    const { newState } = await cb.execute('test', state, async () => {
      throw new Error('fail');
    });

    expect(newState.status).toBe('open');
    expect(newState.consecutiveFailures).toBe(3);
    expect(newState.openedAt).toBeInstanceOf(Date);
  });

  it('skips execution when circuit is open and cooldown not elapsed', async () => {
    const cb = new CircuitBreaker(3, 60_000);
    const state = {
      status: 'open' as const,
      consecutiveFailures: 3,
      openedAt: new Date(), // just opened
    };

    const fn = vi.fn(async () => 'result');
    const { result, skipped } = await cb.execute('test', state, fn);

    expect(skipped).toBe(true);
    expect(result).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it('moves to half-open after cooldown and tries again', async () => {
    const cb = new CircuitBreaker(3, 1000);
    const state = {
      status: 'open' as const,
      consecutiveFailures: 3,
      openedAt: new Date(Date.now() - 2000), // elapsed > cooldown
    };

    const { result, newState, skipped } = await cb.execute('test', state, async () => 'ok');

    expect(skipped).toBe(false);
    expect(result).toBe('ok');
    expect(newState.status).toBe('closed');
    expect(newState.consecutiveFailures).toBe(0);
  });

  it('stays open if half-open probe fails', async () => {
    const cb = new CircuitBreaker(3, 1000);
    const state = {
      status: 'open' as const,
      consecutiveFailures: 3,
      openedAt: new Date(Date.now() - 2000),
    };

    const { newState } = await cb.execute('test', state, async () => {
      throw new Error('still broken');
    });

    expect(newState.status).toBe('open');
    expect(newState.consecutiveFailures).toBe(4);
  });

  it('resets failures on success from half-open', async () => {
    const cb = new CircuitBreaker(3, 60_000);
    const state = { status: 'half-open' as const, consecutiveFailures: 3 };

    const { newState } = await cb.execute('test', state, async () => true);

    expect(newState.status).toBe('closed');
    expect(newState.consecutiveFailures).toBe(0);
  });
});
