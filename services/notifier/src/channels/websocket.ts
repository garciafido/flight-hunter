import type WebSocket from 'ws';

export interface WebSocketBroadcaster {
  addClient(ws: WebSocket): void;
  removeClient(ws: WebSocket): void;
  broadcast(data: unknown): void;
}

export function createWebSocketBroadcaster(): WebSocketBroadcaster {
  const clients = new Set<WebSocket>();

  return {
    addClient(ws: WebSocket): void {
      clients.add(ws);
    },

    removeClient(ws: WebSocket): void {
      clients.delete(ws);
    },

    broadcast(data: unknown): void {
      const message = JSON.stringify(data);
      for (const client of clients) {
        if (client.readyState === 1) {
          client.send(message);
        }
      }
    },
  };
}
