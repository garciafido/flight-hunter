import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchSearches, fetchSearch, createSearch, updateSearch, deleteSearch,
  fetchResults, fetchAlerts, fetchProxies, createProxy, fetchSystemStatus,
  fetchSystemSettings, updateSystemSettings, promoteResult, fetchSuspiciousResults,
  snoozeSearch, unsnoozeSearch, purchaseSearch, archiveSearch, reactivateSearch,
  fetchCalendar, fetchHistory, fetchDestinations, fetchWindows, fetchPrediction,
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

describe('fetchSystemSettings', () => {
  it('returns settings data', async () => {
    global.fetch = mockFetch(true, { emailsPaused: false });
    const result = await fetchSystemSettings();
    expect(fetch).toHaveBeenCalledWith('/api/system/settings');
    expect(result).toEqual({ emailsPaused: false });
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(fetchSystemSettings()).rejects.toThrow('Failed to fetch system settings');
  });
});

describe('updateSystemSettings', () => {
  it('sends PUT request with settings', async () => {
    global.fetch = mockFetch(true, { emailsPaused: true });
    const result = await updateSystemSettings({ emailsPaused: true });
    expect(result).toEqual({ emailsPaused: true });
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toBe('/api/system/settings');
    expect((call[1] as RequestInit).method).toBe('PUT');
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(updateSystemSettings({ emailsPaused: true })).rejects.toThrow('Failed to update system settings');
  });
});

describe('promoteResult', () => {
  it('sends POST request to promote endpoint', async () => {
    global.fetch = mockFetch(true, { success: true });
    const result = await promoteResult('result-123');
    expect(fetch).toHaveBeenCalledWith('/api/results/result-123/promote', { method: 'POST' });
    expect(result).toEqual({ success: true });
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(promoteResult('result-123')).rejects.toThrow('Failed to promote result');
  });
});

describe('fetchSuspiciousResults', () => {
  it('fetches suspicious results for a search', async () => {
    const mockResults = [{ id: 'r1', suspicious: true, suspicionReason: 'outlier price' }];
    global.fetch = mockFetch(true, mockResults);
    const result = await fetchSuspiciousResults('search-abc');
    expect(fetch).toHaveBeenCalledWith('/api/searches/search-abc/results?suspicious=true');
    expect(result).toEqual(mockResults);
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(fetchSuspiciousResults('search-abc')).rejects.toThrow('Failed to fetch suspicious results');
  });
});

describe('snoozeSearch', () => {
  it('sends POST to snooze endpoint', async () => {
    global.fetch = mockFetch(true, { id: 's1', status: 'snoozed' });
    const result = await snoozeSearch('s1', '1day');
    expect(fetch).toHaveBeenCalledWith('/api/searches/s1/snooze', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ until: '1day' }),
    }));
    expect(result).toEqual({ id: 's1', status: 'snoozed' });
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(snoozeSearch('s1', '1day')).rejects.toThrow('Failed to snooze search');
  });
});

describe('unsnoozeSearch', () => {
  it('sends POST to unsnooze endpoint', async () => {
    global.fetch = mockFetch(true, { id: 's1', status: 'active' });
    const result = await unsnoozeSearch('s1');
    expect(fetch).toHaveBeenCalledWith('/api/searches/s1/unsnooze', { method: 'POST' });
    expect(result).toEqual({ id: 's1', status: 'active' });
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(unsnoozeSearch('s1')).rejects.toThrow('Failed to unsnooze search');
  });
});

describe('purchaseSearch', () => {
  it('sends POST to purchase endpoint', async () => {
    global.fetch = mockFetch(true, { search: { id: 's1' }, purchaseRecord: { id: 'pr1' } });
    const result = await purchaseSearch('s1', { pricePaid: 350, currency: 'USD' });
    expect(fetch).toHaveBeenCalledWith('/api/searches/s1/purchase', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ pricePaid: 350, currency: 'USD' }),
    }));
    expect(result.search.id).toBe('s1');
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(purchaseSearch('s1', {})).rejects.toThrow('Failed to mark search as purchased');
  });
});

describe('archiveSearch', () => {
  it('sends POST to archive endpoint', async () => {
    global.fetch = mockFetch(true, { id: 's1', status: 'archived' });
    const result = await archiveSearch('s1');
    expect(fetch).toHaveBeenCalledWith('/api/searches/s1/archive', { method: 'POST' });
    expect(result).toEqual({ id: 's1', status: 'archived' });
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(archiveSearch('s1')).rejects.toThrow('Failed to archive search');
  });
});

describe('reactivateSearch', () => {
  it('sends POST to reactivate endpoint', async () => {
    global.fetch = mockFetch(true, { id: 's1', status: 'active' });
    const result = await reactivateSearch('s1');
    expect(fetch).toHaveBeenCalledWith('/api/searches/s1/reactivate', { method: 'POST' });
    expect(result).toEqual({ id: 's1', status: 'active' });
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(reactivateSearch('s1')).rejects.toThrow('Failed to reactivate search');
  });
});

describe('fetchCalendar', () => {
  it('fetches calendar without month param', async () => {
    global.fetch = mockFetch(true, { month: '2026-07', days: [] });
    const result = await fetchCalendar('s1');
    expect(fetch).toHaveBeenCalledWith('/api/searches/s1/calendar');
    expect(result.month).toBe('2026-07');
  });
  it('fetches calendar with month param', async () => {
    global.fetch = mockFetch(true, { month: '2026-07', days: [{ date: '2026-07-25', minPrice: 285, currency: 'USD', resultCount: 3 }] });
    const result = await fetchCalendar('s1', '2026-07');
    expect(fetch).toHaveBeenCalledWith('/api/searches/s1/calendar?month=2026-07');
    expect(result.days).toHaveLength(1);
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(fetchCalendar('s1')).rejects.toThrow('Failed to fetch calendar');
  });
});

describe('fetchHistory', () => {
  it('fetches history without days param', async () => {
    global.fetch = mockFetch(true, { history: [], alerts: [] });
    const result = await fetchHistory('s1');
    expect(fetch).toHaveBeenCalledWith('/api/searches/s1/history');
    expect(result.history).toEqual([]);
  });
  it('fetches history with days param', async () => {
    global.fetch = mockFetch(true, { history: [{ date: '2026-04-01', minPrice: 280, avgPrice: 350, maxPrice: 450, bestScore: 75 }], alerts: [] });
    const result = await fetchHistory('s1', 30);
    expect(fetch).toHaveBeenCalledWith('/api/searches/s1/history?days=30');
    expect(result.history).toHaveLength(1);
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(fetchHistory('s1')).rejects.toThrow('Failed to fetch history');
  });
});

describe('fetchDestinations', () => {
  it('fetches destinations for a search', async () => {
    const data = {
      destinations: [
        { iata: 'CUZ', minPrice: 285, currency: 'USD', resultCount: 12, topResultId: 'r1' },
        { iata: 'LIM', minPrice: 310, currency: 'USD', resultCount: 18, topResultId: 'r2' },
      ],
    };
    global.fetch = mockFetch(true, data);
    const result = await fetchDestinations('s1');
    expect(fetch).toHaveBeenCalledWith('/api/searches/s1/destinations');
    expect(result.destinations).toHaveLength(2);
    expect(result.destinations[0].iata).toBe('CUZ');
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(fetchDestinations('s1')).rejects.toThrow('Failed to fetch destinations');
  });
});

describe('fetchWindows', () => {
  it('fetches windows for a search', async () => {
    const data = {
      windows: [
        { start: '2026-07-05', end: '2026-07-19', duration: 14, minPrice: 380, currency: 'USD', resultCount: 5, topResultId: 'r1' },
        { start: '2026-07-12', end: '2026-07-26', duration: 14, minPrice: 360, currency: 'USD', resultCount: 3, topResultId: 'r2' },
      ],
    };
    global.fetch = mockFetch(true, data);
    const result = await fetchWindows('s1');
    expect(fetch).toHaveBeenCalledWith('/api/searches/s1/windows');
    expect(result.windows).toHaveLength(2);
    expect(result.windows[0].start).toBe('2026-07-05');
  });
  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(fetchWindows('s1')).rejects.toThrow('Failed to fetch windows');
  });
});

describe('fetchPrediction', () => {
  it('fetches prediction for a search', async () => {
    const data = {
      prediction: {
        currentMin: 400, movingAvg7d: 390, movingAvg30d: 420,
        trendSlope: -2, predicted7dMin: 386, predicted14dMin: 372, confidence: 'high',
      },
      recommendation: { action: 'wait', reason: 'Bajista', predictedSavings: 14 },
    };
    global.fetch = mockFetch(true, data);
    const result = await fetchPrediction('s1');
    expect(fetch).toHaveBeenCalledWith('/api/searches/s1/prediction');
    expect(result.prediction!.currentMin).toBe(400);
    expect(result.recommendation!.action).toBe('wait');
  });

  it('returns null prediction and recommendation when no history', async () => {
    global.fetch = mockFetch(true, { prediction: null, recommendation: null });
    const result = await fetchPrediction('s1');
    expect(result.prediction).toBeNull();
    expect(result.recommendation).toBeNull();
  });

  it('throws on failure', async () => {
    global.fetch = mockFetch(false, {});
    await expect(fetchPrediction('s1')).rejects.toThrow('Failed to fetch prediction');
  });
});
