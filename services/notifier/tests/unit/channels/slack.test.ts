import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSlackChannel } from '../../../src/channels/slack.js';

describe('SlackChannel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('sends text to Slack webhook', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const channel = createSlackChannel('https://hooks.slack.com/services/test');
    await channel.send('Hello Slack!');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://hooks.slack.com/services/test');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body as string);
    expect(body.text).toBe('Hello Slack!');
    expect(body.blocks).toBeUndefined();
  });

  it('includes blocks when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const channel = createSlackChannel('https://hooks.slack.com/services/test');
    const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello' } }];
    await channel.send('Hello Slack!', blocks);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.blocks).toEqual(blocks);
  });

  it('throws when Slack webhook returns non-ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal('fetch', mockFetch);

    const channel = createSlackChannel('https://hooks.slack.com/services/test');
    await expect(channel.send('test')).rejects.toThrow('Slack webhook 400');
  });
});
