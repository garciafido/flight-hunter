export type WsMessageHandler = (data: any) => void;

export function createWsConnection(
  url: string,
  onMessage: WsMessageHandler
): { close: () => void } {
  const ws = new WebSocket(url);
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onMessage(data);
  };
  ws.onerror = () => { /* silent reconnect handled by caller */ };
  return {
    close: () => ws.close(),
  };
}
