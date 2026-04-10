export interface WebhookChannel {
  send(payload: unknown): Promise<void>;
}

export function createWebhookChannel(url: string): WebhookChannel {
  return {
    async send(payload: unknown): Promise<void> {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }
    },
  };
}
