export interface CircuitState {
  status: 'closed' | 'open' | 'half-open';
  consecutiveFailures: number;
  openedAt?: Date;
}

export class CircuitBreaker {
  constructor(
    private readonly threshold: number = 5,
    private readonly cooldownMs: number = 5 * 60_000,
  ) {}

  async execute<T>(
    _sourceName: string,
    state: CircuitState,
    fn: () => Promise<T>,
  ): Promise<{ result: T | null; newState: CircuitState; skipped: boolean }> {
    // If open and cooldown not elapsed, skip
    if (state.status === 'open') {
      const elapsed = Date.now() - (state.openedAt?.getTime() ?? 0);
      if (elapsed < this.cooldownMs) {
        return { result: null, newState: state, skipped: true };
      }
      // Move to half-open to allow a probe request
      state = { ...state, status: 'half-open' };
    }

    try {
      const result = await fn();
      // Success: reset
      return {
        result,
        newState: { status: 'closed', consecutiveFailures: 0 },
        skipped: false,
      };
    } catch (err) {
      const failures = state.consecutiveFailures + 1;
      const shouldOpen = failures >= this.threshold;
      return {
        result: null,
        newState: {
          status: shouldOpen ? 'open' : state.status,
          consecutiveFailures: failures,
          openedAt: shouldOpen ? new Date() : state.openedAt,
        },
        skipped: false,
      };
    }
  }
}
