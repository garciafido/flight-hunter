export interface SlackChannel {
  send(text: string, blocks?: unknown[]): Promise<void>;
}

export function createSlackChannel(webhookUrl: string): SlackChannel {
  return {
    async send(text: string, blocks?: unknown[]): Promise<void> {
      const body: Record<string, unknown> = { text };
      if (blocks) body.blocks = blocks;
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(`Slack webhook ${response.status}`);
      }
    },
  };
}
