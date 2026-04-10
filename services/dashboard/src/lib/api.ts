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
