import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { ServiceWorkerRegister } from '../../src/components/sw-register';

describe('ServiceWorkerRegister', () => {
  let registerMock: ReturnType<typeof vi.fn>;
  let originalSW: typeof navigator.serviceWorker | undefined;

  beforeEach(() => {
    registerMock = vi.fn().mockResolvedValue({});
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: registerMock },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders null (no visible output)', () => {
    const { container } = render(<ServiceWorkerRegister />);
    expect(container.firstChild).toBeNull();
  });

  it('registers service worker on mount', async () => {
    render(<ServiceWorkerRegister />);
    // Let useEffect run
    await vi.waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith('/sw.js');
    });
  });

  it('does not throw when serviceWorker is not supported', () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(() => render(<ServiceWorkerRegister />)).not.toThrow();
  });
});
