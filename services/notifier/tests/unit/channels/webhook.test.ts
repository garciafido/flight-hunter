import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWebhookChannel } from '../../../src/channels/webhook.js';

describe('WebhookChannel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('sends a POST request with JSON payload', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const channel = createWebhookChannel('https://example.com/hook');
    await channel.send({ level: 'urgent', price: 350 });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.com/hook');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });

    const body = JSON.parse(options.body as string);
    expect(body.level).toBe('urgent');
    expect(body.price).toBe(350);
  });

  it('throws when response is not ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', mockFetch);

    const channel = createWebhookChannel('https://example.com/hook');
    await expect(channel.send({ test: true })).rejects.toThrow('Webhook returned 503');
  });

  it('sends null/undefined payloads as JSON', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const channel = createWebhookChannel('https://example.com/hook');
    await channel.send(null);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(options.body).toBe('null');
  });
});
