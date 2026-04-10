export interface TelegramChannel {
  send(text: string): Promise<void>;
}

export function createTelegramChannel(botToken: string, chatId: string): TelegramChannel {
  return {
    async send(text: string): Promise<void> {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Telegram API error ${response.status}: ${body}`);
      }
    },
  };
}
