import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDiscordChannel } from '../../../src/channels/discord.js';

describe('DiscordChannel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('sends content to Discord webhook', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const channel = createDiscordChannel('https://discord.com/api/webhooks/123/abc');
    await channel.send('Hello Discord!');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://discord.com/api/webhooks/123/abc');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body as string);
    expect(body.content).toBe('Hello Discord!');
    expect(body.embeds).toBeUndefined();
  });

  it('includes embeds when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const channel = createDiscordChannel('https://discord.com/api/webhooks/123/abc');
    const embeds = [{ title: 'Test', description: 'Hello', color: 0xff0000 }];
    await channel.send('Hello Discord!', embeds);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.embeds).toEqual(embeds);
  });

  it('throws when Discord webhook returns non-ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    vi.stubGlobal('fetch', mockFetch);

    const channel = createDiscordChannel('https://discord.com/api/webhooks/123/abc');
    await expect(channel.send('test')).rejects.toThrow('Discord webhook 429');
  });
});
