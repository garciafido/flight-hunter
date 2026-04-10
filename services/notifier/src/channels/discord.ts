export interface DiscordChannel {
  send(content: string, embeds?: unknown[]): Promise<void>;
}

export function createDiscordChannel(webhookUrl: string): DiscordChannel {
  return {
    async send(content: string, embeds?: unknown[]): Promise<void> {
      const body: Record<string, unknown> = { content };
      if (embeds) body.embeds = embeds;
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(`Discord webhook ${response.status}`);
      }
    },
  };
}
