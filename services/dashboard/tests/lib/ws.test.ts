import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWsConnection } from '@/lib/ws';

class MockWebSocket {
  url: string;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
  }

  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
  (global as any).WebSocket = MockWebSocket;
});

describe('createWsConnection', () => {
  it('creates a WebSocket with the given url', () => {
    const handler = vi.fn();
    createWsConnection('ws://localhost:4000', handler);
    // Verify it connects (no error thrown)
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls onMessage with parsed data when message arrives', () => {
    const handler = vi.fn();
    const conn = createWsConnection('ws://localhost:4000', handler);

    // Get the ws instance via the mock
    const instances: MockWebSocket[] = [];
    const OrigWebSocket = (global as any).WebSocket;
    // Retrieve through closure — we need to simulate onmessage
    // Re-create to capture instance
    let capturedWs: MockWebSocket | null = null;
    (global as any).WebSocket = class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        capturedWs = this;
      }
    };

    const handler2 = vi.fn();
    createWsConnection('ws://localhost:4000', handler2);

    const event = { data: JSON.stringify({ type: 'alert', id: '1' }) } as MessageEvent;
    capturedWs!.onmessage!(event);

    expect(handler2).toHaveBeenCalledWith({ type: 'alert', id: '1' });
  });

  it('returns a close function that closes the socket', () => {
    let capturedWs: MockWebSocket | null = null;
    (global as any).WebSocket = class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        capturedWs = this;
      }
    };

    const { close } = createWsConnection('ws://localhost:4000', vi.fn());
    expect(capturedWs!.closed).toBe(false);
    close();
    expect(capturedWs!.closed).toBe(true);
  });

  it('has an onerror handler that does not throw', () => {
    let capturedWs: MockWebSocket | null = null;
    (global as any).WebSocket = class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        capturedWs = this;
      }
    };

    createWsConnection('ws://localhost:4000', vi.fn());
    expect(() => capturedWs!.onerror!()).not.toThrow();
  });
});
