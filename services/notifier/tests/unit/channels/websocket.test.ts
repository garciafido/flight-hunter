import { describe, it, expect, vi } from 'vitest';
import { createWebSocketBroadcaster } from '../../../src/channels/websocket.js';

function makeMockWs(readyState: number) {
  return {
    readyState,
    send: vi.fn(),
  };
}

describe('WebSocketBroadcaster', () => {
  it('broadcasts to OPEN clients', () => {
    const broadcaster = createWebSocketBroadcaster();
    const ws = makeMockWs(1);
    broadcaster.addClient(ws as never);
    broadcaster.broadcast({ type: 'alert', data: {} });
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'alert', data: {} }));
  });

  it('does not broadcast to non-OPEN clients', () => {
    const broadcaster = createWebSocketBroadcaster();
    const ws = makeMockWs(3); // CLOSED
    broadcaster.addClient(ws as never);
    broadcaster.broadcast({ type: 'alert' });
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('does not broadcast to connecting clients (readyState 0)', () => {
    const broadcaster = createWebSocketBroadcaster();
    const ws = makeMockWs(0);
    broadcaster.addClient(ws as never);
    broadcaster.broadcast({ msg: 'test' });
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('removes client and stops broadcasting to it', () => {
    const broadcaster = createWebSocketBroadcaster();
    const ws = makeMockWs(1);
    broadcaster.addClient(ws as never);
    broadcaster.removeClient(ws as never);
    broadcaster.broadcast({ type: 'alert' });
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('broadcasts to multiple OPEN clients', () => {
    const broadcaster = createWebSocketBroadcaster();
    const ws1 = makeMockWs(1);
    const ws2 = makeMockWs(1);
    const ws3 = makeMockWs(3); // CLOSED
    broadcaster.addClient(ws1 as never);
    broadcaster.addClient(ws2 as never);
    broadcaster.addClient(ws3 as never);
    broadcaster.broadcast({ hello: 'world' });
    expect(ws1.send).toHaveBeenCalledOnce();
    expect(ws2.send).toHaveBeenCalledOnce();
    expect(ws3.send).not.toHaveBeenCalled();
  });
});
