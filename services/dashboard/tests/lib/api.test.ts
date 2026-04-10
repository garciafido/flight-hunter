import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchSearches, fetchSearch, createSearch, updateSearch, deleteSearch,
  fetchResults, fetchAlerts, fetchProxies, createProxy, fetchSystemStatus,
} from '@/lib/api';

function mockFetch(ok: boolean, data: any) {
  return vi.fn().mockResolvedValue({
    ok,
    json: async () => data,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('fetchSearches', () => {
  it('returns data on success', async () => {
    global.fetch = mockFetch(true, [{ id: '1' }]);
    const result = await fetchSearches();
    expect(fetch).toHaveBeenCalledWith('/api/searches');
    expect(result).toEqual([{ id: '1' }]);
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(fetchSearches()).rejects.toThrow('Failed to fetch searches');
  });
});

describe('fetchSearch', () => {
  it('returns single search', async () => {
    global.fetch = mockFetch(true, { id: 'abc' });
    const result = await fetchSearch('abc');
    expect(fetch).toHaveBeenCalledWith('/api/searches/abc');
    expect(result).toEqual({ id: 'abc' });
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(fetchSearch('x')).rejects.toThrow('Failed to fetch search');
  });
});

describe('createSearch', () => {
  it('posts data and returns result', async () => {
    global.fetch = mockFetch(true, { id: 'new' });
    const result = await createSearch({ name: 'Test' });
    expect(fetch).toHaveBeenCalledWith('/api/searches', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' }),
    }));
    expect(result).toEqual({ id: 'new' });
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(createSearch({})).rejects.toThrow('Failed to create search');
  });
});

describe('updateSearch', () => {
  it('puts data and returns result', async () => {
    global.fetch = mockFetch(true, { id: 'abc', name: 'Updated' });
    const result = await updateSearch('abc', { name: 'Updated' });
    expect(fetch).toHaveBeenCalledWith('/api/searches/abc', expect.objectContaining({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' }),
    }));
    expect(result).toEqual({ id: 'abc', name: 'Updated' });
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(updateSearch('x', {})).rejects.toThrow('Failed to update search');
  });
});

describe('deleteSearch', () => {
  it('sends DELETE request', async () => {
    global.fetch = mockFetch(true, {});
    await deleteSearch('abc');
    expect(fetch).toHaveBeenCalledWith('/api/searches/abc', { method: 'DELETE' });
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(deleteSearch('x')).rejects.toThrow('Failed to delete search');
  });
});

describe('fetchResults', () => {
  it('fetches with no params', async () => {
    global.fetch = mockFetch(true, []);
    await fetchResults('abc');
    expect(fetch).toHaveBeenCalledWith('/api/searches/abc/results?');
  });
  it('fetches with all params', async () => {
    global.fetch = mockFetch(true, [{ id: 'r1' }]);
    const result = await fetchResults('abc', { sort: 'price', limit: 10, offset: 5 });
    const url = (fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('sort=price');
    expect(url).toContain('limit=10');
    expect(url).toContain('offset=5');
    expect(result).toEqual([{ id: 'r1' }]);
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(fetchResults('x')).rejects.toThrow('Failed to fetch results');
  });
});

describe('fetchAlerts', () => {
  it('fetches with no params', async () => {
    global.fetch = mockFetch(true, []);
    await fetchAlerts();
    expect(fetch).toHaveBeenCalledWith('/api/alerts?');
  });
  it('fetches with searchId and pagination', async () => {
    global.fetch = mockFetch(true, []);
    await fetchAlerts({ searchId: 'abc', limit: 10, offset: 0 });
    const url = (fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('searchId=abc');
    expect(url).toContain('limit=10');
    expect(url).toContain('offset=0');
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(fetchAlerts()).rejects.toThrow('Failed to fetch alerts');
  });
});

describe('fetchProxies', () => {
  it('returns data on success', async () => {
    global.fetch = mockFetch(true, [{ id: 'p1' }]);
    const result = await fetchProxies();
    expect(fetch).toHaveBeenCalledWith('/api/proxies');
    expect(result).toEqual([{ id: 'p1' }]);
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(fetchProxies()).rejects.toThrow('Failed to fetch proxies');
  });
});

describe('createProxy', () => {
  it('posts and returns result', async () => {
    global.fetch = mockFetch(true, { id: 'np' });
    const result = await createProxy({ label: 'CL-1' });
    expect(fetch).toHaveBeenCalledWith('/api/proxies', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'CL-1' }),
    }));
    expect(result).toEqual({ id: 'np' });
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(createProxy({})).rejects.toThrow('Failed to create proxy');
  });
});

describe('fetchSystemStatus', () => {
  it('returns status data', async () => {
    global.fetch = mockFetch(true, { postgres: 'ok', redis: 'ok' });
    const result = await fetchSystemStatus();
    expect(fetch).toHaveBeenCalledWith('/api/system');
    expect(result).toEqual({ postgres: 'ok', redis: 'ok' });
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(fetchSystemStatus()).rejects.toThrow('Failed to fetch system status');
  });
});
