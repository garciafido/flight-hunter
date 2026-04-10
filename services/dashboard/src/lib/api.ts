const BASE = '/api';

export async function fetchSearches(): Promise<any[]> {
  const res = await fetch(`${BASE}/searches`);
  if (!res.ok) throw new Error('Failed to fetch searches');
  return res.json();
}

export async function fetchSearch(id: string): Promise<any> {
  const res = await fetch(`${BASE}/searches/${id}`);
  if (!res.ok) throw new Error('Failed to fetch search');
  return res.json();
}

export async function createSearch(data: any): Promise<any> {
  const res = await fetch(`${BASE}/searches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create search');
  return res.json();
}

export async function updateSearch(id: string, data: any): Promise<any> {
  const res = await fetch(`${BASE}/searches/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update search');
  return res.json();
}

export async function deleteSearch(id: string): Promise<void> {
  const res = await fetch(`${BASE}/searches/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete search');
}

export async function fetchResults(
  searchId: string,
  params?: { sort?: string; limit?: number; offset?: number }
): Promise<any[]> {
  const qs = new URLSearchParams();
  if (params?.sort) qs.set('sort', params.sort);
  if (params?.limit != null) qs.set('limit', params.limit.toString());
  if (params?.offset != null) qs.set('offset', params.offset.toString());
  const res = await fetch(`${BASE}/searches/${searchId}/results?${qs}`);
  if (!res.ok) throw new Error('Failed to fetch results');
  return res.json();
}

export async function fetchAlerts(params?: {
  searchId?: string;
  limit?: number;
  offset?: number;
}): Promise<any[]> {
  const qs = new URLSearchParams();
  if (params?.searchId) qs.set('searchId', params.searchId);
  if (params?.limit != null) qs.set('limit', params.limit.toString());
  if (params?.offset != null) qs.set('offset', params.offset.toString());
  const res = await fetch(`${BASE}/alerts?${qs}`);
  if (!res.ok) throw new Error('Failed to fetch alerts');
  return res.json();
}

export async function fetchProxies(): Promise<any[]> {
  const res = await fetch(`${BASE}/proxies`);
  if (!res.ok) throw new Error('Failed to fetch proxies');
  return res.json();
}

export async function createProxy(data: any): Promise<any> {
  const res = await fetch(`${BASE}/proxies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create proxy');
  return res.json();
}

export async function fetchSystemStatus(): Promise<any> {
  const res = await fetch(`${BASE}/system`);
  if (!res.ok) throw new Error('Failed to fetch system status');
  return res.json();
}

export async function fetchCombos(searchId: string): Promise<any[]> {
  const res = await fetch(`${BASE}/searches/${searchId}/combos`);
  if (!res.ok) throw new Error('Failed to fetch combos');
  return res.json();
}

export interface SystemSettings {
  emailsPaused: boolean;
  webhookUrl: string | null;
  webhookEnabled: boolean;
  slackWebhookUrl: string | null;
  discordWebhookUrl: string | null;
}

export async function fetchSystemSettings(): Promise<SystemSettings> {
  const res = await fetch(`${BASE}/system/settings`);
  if (!res.ok) throw new Error('Failed to fetch system settings');
  return res.json();
}

export async function updateSystemSettings(data: Partial<SystemSettings>): Promise<SystemSettings> {
  const res = await fetch(`${BASE}/system/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update system settings');
  return res.json();
}

export async function submitAlertFeedback(
  alertId: string,
  value: 'positive' | 'negative',
): Promise<{ id: string; feedback: string; feedbackAt: string }> {
  const res = await fetch(`${BASE}/alerts/${alertId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error('Failed to submit feedback');
  return res.json();
}

export async function promoteResult(resultId: string): Promise<any> {
  const res = await fetch(`${BASE}/results/${resultId}/promote`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to promote result');
  return res.json();
}

export async function fetchSuspiciousResults(searchId: string): Promise<any[]> {
  const res = await fetch(`${BASE}/searches/${searchId}/results?suspicious=true`);
  if (!res.ok) throw new Error('Failed to fetch suspicious results');
  return res.json();
}

export async function snoozeSearch(id: string, until: string): Promise<any> {
  const res = await fetch(`${BASE}/searches/${id}/snooze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ until }),
  });
  if (!res.ok) throw new Error('Failed to snooze search');
  return res.json();
}

export async function unsnoozeSearch(id: string): Promise<any> {
  const res = await fetch(`${BASE}/searches/${id}/unsnooze`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to unsnooze search');
  return res.json();
}

export async function purchaseSearch(
  id: string,
  data: { pricePaid?: number; currency?: string; bookingUrl?: string; travelDate?: string; notes?: string },
): Promise<any> {
  const res = await fetch(`${BASE}/searches/${id}/purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to mark search as purchased');
  return res.json();
}

export async function archiveSearch(id: string): Promise<any> {
  const res = await fetch(`${BASE}/searches/${id}/archive`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to archive search');
  return res.json();
}

export async function reactivateSearch(id: string): Promise<any> {
  const res = await fetch(`${BASE}/searches/${id}/reactivate`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to reactivate search');
  return res.json();
}

export async function fetchCalendar(
  searchId: string,
  month?: string,
): Promise<{ month: string; days: Array<{ date: string; minPrice: number; currency: string; resultCount: number }> }> {
  const qs = month ? `?month=${encodeURIComponent(month)}` : '';
  const res = await fetch(`${BASE}/searches/${searchId}/calendar${qs}`);
  if (!res.ok) throw new Error('Failed to fetch calendar');
  return res.json();
}

export async function fetchHistory(
  searchId: string,
  days?: number,
): Promise<{
  history: Array<{ date: string; minPrice: number; avgPrice: number; maxPrice: number; bestScore: number }>;
  alerts: Array<{ date: string; level: string }>;
}> {
  const qs = days != null ? `?days=${days}` : '';
  const res = await fetch(`${BASE}/searches/${searchId}/history${qs}`);
  if (!res.ok) throw new Error('Failed to fetch history');
  return res.json();
}

export async function fetchDestinations(
  searchId: string,
): Promise<{
  destinations: Array<{ iata: string; minPrice: number; currency: string; resultCount: number; topResultId: string }>;
}> {
  const res = await fetch(`${BASE}/searches/${searchId}/destinations`);
  if (!res.ok) throw new Error('Failed to fetch destinations');
  return res.json();
}

export async function fetchWindows(
  searchId: string,
): Promise<{
  windows: Array<{ start: string; end: string; duration: number; minPrice: number; currency: string; resultCount: number; topResultId: string }>;
}> {
  const res = await fetch(`${BASE}/searches/${searchId}/windows`);
  if (!res.ok) throw new Error('Failed to fetch windows');
  return res.json();
}

export async function fetchPrediction(
  searchId: string,
): Promise<{
  prediction: {
    currentMin: number;
    movingAvg7d: number;
    movingAvg30d: number;
    trendSlope: number;
    predicted7dMin: number;
    predicted14dMin: number;
    confidence: 'low' | 'medium' | 'high';
  } | null;
  recommendation: {
    action: 'buy-now' | 'wait' | 'monitor';
    reason: string;
    predictedSavings?: number;
  } | null;
}> {
  const res = await fetch(`${BASE}/searches/${searchId}/prediction`);
  if (!res.ok) throw new Error('Failed to fetch prediction');
  return res.json();
}
