/**
 * gateway.ts — thin client for the Bxdc.ai backend API.
 *
 * All calls are fire-and-forget safe: if the backend is unreachable, the
 * error is logged to console but the UI continues working with localStorage.
 */

const BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ApiKeyRecord {
  id: string;
  name: string;
  authId: string;
  projectName: string;
  projectDesc?: string;
  department: string;
  models: string[];
  apiKey: string;
  grantedAt: string;
  revoked: boolean;
}

export interface ApplicationPayload {
  name: string;
  authId: string;
  department: string;
  projectName: string;
  projectDesc?: string;
  models: string[];
  reason?: string;
}

export interface AdminLoginResponse {
  token: string;
  expiresIn: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function authHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, init);
    if (!res.ok) {
      console.warn(`[gateway] ${init?.method ?? 'GET'} ${path} → ${res.status}`);
      return null;
    }
    return res.json() as Promise<T>;
  } catch (err) {
    console.warn('[gateway] backend unreachable:', err);
    return null;
  }
}

// ── Admin auth ─────────────────────────────────────────────────────────────

export async function adminLogin(
  password: string,
): Promise<AdminLoginResponse | null> {
  return apiFetch<AdminLoginResponse>('/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

// ── API key management ─────────────────────────────────────────────────────

export async function listApiKeys(token: string): Promise<ApiKeyRecord[]> {
  const data = await apiFetch<ApiKeyRecord[]>('/admin/keys', {
    headers: authHeaders(token),
  });
  return data ?? [];
}

export async function createApiKey(
  token: string,
  record: Omit<ApiKeyRecord, 'id'>,
): Promise<ApiKeyRecord | null> {
  return apiFetch<ApiKeyRecord>('/admin/keys', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(record),
  });
}

export async function revokeApiKey(
  token: string,
  id: string,
): Promise<boolean> {
  const res = await apiFetch<{ ok: boolean }>(`/admin/keys/${id}/revoke`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  return res?.ok ?? false;
}

export async function deleteApiKey(
  token: string,
  id: string,
): Promise<boolean> {
  const res = await apiFetch<{ ok: boolean }>(`/admin/keys/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  return res?.ok ?? false;
}

// ── Bulk sync from localStorage → backend ──────────────────────────────────

export async function syncKeysToBackend(
  token: string,
  records: ApiKeyRecord[],
): Promise<boolean> {
  const res = await apiFetch<{ synced: number }>('/admin/keys/sync', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ records }),
  });
  return res !== null;
}

// ── Application submission ─────────────────────────────────────────────────

export async function submitApplication(
  payload: ApplicationPayload,
): Promise<{ id: string } | null> {
  return apiFetch<{ id: string }>('/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ── Model registry sync ────────────────────────────────────────────────────

export async function syncModels(
  token: string,
  models: unknown[],
): Promise<boolean> {
  const res = await apiFetch<{ ok: boolean }>('/admin/models/sync', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ models }),
  });
  return res?.ok ?? false;
}

// ── Proxy endpoint base (for code examples in the UI) ─────────────────────

export const PROXY_BASE =
  (import.meta.env.VITE_PROXY_BASE as string) || '/v1';
