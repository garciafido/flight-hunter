import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTelegramChannel } from '../../../src/channels/telegram.js';

describe('TelegramChannel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('sends a POST request to the Telegram API', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'OK',
    });
    vi.stubGlobal('fetch', mockFetch);

    const channel = createTelegramChannel('bot-token-123', 'chat-456');
    await channel.send('Hello from test');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.telegram.org/botbot-token-123/sendMessage');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.chat_id).toBe('chat-456');
    expect(body.text).toBe('Hello from test');
    expect(body.parse_mode).toBe('Markdown');
  });

  it('throws when API returns non-ok response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });
    vi.stubGlobal('fetch', mockFetch);

    const channel = createTelegramChannel('bad-token', 'chat-id');
    await expect(channel.send('test')).rejects.toThrow('Telegram API error 400: Bad Request');
  });
});
