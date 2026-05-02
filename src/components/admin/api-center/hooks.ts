/**
 * hooks.ts
 *
 * React Query hooks for the API Command Center. All requests are authenticated
 * with the current session's access token (same pattern as PlatformSettings).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import { API_ENDPOINTS } from '../../../services/apiConfig';

export type Provider = 'openai' | 'gemini' | 'google_maps' | 'supabase' | 'uber';

const BASE = `${API_ENDPOINTS.admin}/api-center`;

function authHeaders(token: string | undefined, json = true): HeadersInit {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function readJsonOrThrow(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || body?.detail || `HTTP ${res.status}`);
  return body;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
export interface ProviderSummary {
  provider: Provider;
  today:  { calls: number; errors: number; costUSD: number };
  month:  { calls: number; errors: number; costUSD: number };
  range:  { label: string; calls: number; errors: number; costUSD: number; inputTokens: number; outputTokens: number; requests: number };
  budget: { monthlyBudgetUSD: number; dailyBudgetUSD: number; hardStop: boolean; monthlyUtilization: number } | null;
  killswitch: { disabled: boolean; reason?: string; by?: string; at?: string };
}

export function useApiSummary(range: 'today' | '7d' | '30d' | 'mtd' = 'mtd') {
  const { session } = useAuth();
  const token = session?.access_token;
  return useQuery({
    queryKey: ['api-center', 'summary', range, !!token],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(`${BASE}/summary?range=${range}`, { headers: authHeaders(token, false) });
      const body = await readJsonOrThrow(res);
      return body.providers as ProviderSummary[];
    },
    staleTime: 30 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------
export interface UsagePoint { date: string; calls: number; errors: number; costUSD: number; inputTokens: number; outputTokens: number; requests: number }
export interface TopRoute   { route: string; calls: number; costUSD: number }

export function useApiUsage(provider: Provider, range: '7d' | '30d' | 'mtd' = '30d') {
  const { session } = useAuth();
  const token = session?.access_token;
  return useQuery({
    queryKey: ['api-center', 'usage', provider, range, !!token],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(`${BASE}/usage?provider=${provider}&range=${range}`, { headers: authHeaders(token, false) });
      const body = await readJsonOrThrow(res);
      return { series: body.series as UsagePoint[], topRoutes: body.topRoutes as TopRoute[] };
    },
    staleTime: 30 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------
export interface CallLogRow {
  provider: Provider;
  service?: string;
  route?: string;
  model?: string;
  status: 'success' | 'error';
  httpStatus?: number;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUSD?: number;
  requestId?: string;
  errorCode?: string;
  errorMessage?: string;
  timestamp: string;
}

export function useApiLogs(filters: { provider?: string; status?: string; q?: string; limit?: number } = {}) {
  const { session } = useAuth();
  const token = session?.access_token;
  const params = new URLSearchParams();
  if (filters.provider) params.set('provider', filters.provider);
  if (filters.status) params.set('status', filters.status);
  if (filters.q) params.set('q', filters.q);
  if (filters.limit) params.set('limit', String(filters.limit));
  return useQuery({
    queryKey: ['api-center', 'logs', filters, !!token],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(`${BASE}/logs?${params.toString()}`, { headers: authHeaders(token, false) });
      const body = await readJsonOrThrow(res);
      return body.rows as CallLogRow[];
    },
    staleTime: 15 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------
export interface ApiKeyMeta {
  provider: Provider;
  envVarName: string;
  configured: boolean;
  maskedKey: string;
  lastRotatedAt: string | null;
  lastRotatedBy: string | null;
}

export function useApiKeys() {
  const { session } = useAuth();
  const token = session?.access_token;
  return useQuery({
    queryKey: ['api-center', 'keys', !!token],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(`${BASE}/keys`, { headers: authHeaders(token, false) });
      const body = await readJsonOrThrow(res);
      return body.keys as ApiKeyMeta[];
    },
    staleTime: 60 * 1000,
  });
}

export function useRotateKey() {
  const { session } = useAuth();
  const token = session?.access_token;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { provider: Provider; newKey: string; reason?: string }) => {
      const res = await fetch(`${BASE}/keys/rotate`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(input),
      });
      return readJsonOrThrow(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-center', 'keys'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------
export interface BudgetRow {
  provider: Provider;
  monthlyBudgetUSD: number;
  dailyBudgetUSD: number;
  hardStop: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export function useBudgets() {
  const { session } = useAuth();
  const token = session?.access_token;
  return useQuery({
    queryKey: ['api-center', 'budgets', !!token],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(`${BASE}/budgets`, { headers: authHeaders(token, false) });
      const body = await readJsonOrThrow(res);
      return body.budgets as BudgetRow[];
    },
  });
}

export function useSaveBudget() {
  const { session } = useAuth();
  const token = session?.access_token;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BudgetRow) => {
      const res = await fetch(`${BASE}/budgets`, {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify(input),
      });
      return readJsonOrThrow(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-center', 'budgets'] });
      qc.invalidateQueries({ queryKey: ['api-center', 'summary'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Kill-switch
// ---------------------------------------------------------------------------
export interface KillswitchRow {
  provider: Provider;
  disabled: boolean;
  reason?: string;
  by?: string;
  at?: string;
}

export function useKillswitches() {
  const { session } = useAuth();
  const token = session?.access_token;
  return useQuery({
    queryKey: ['api-center', 'killswitch', !!token],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(`${BASE}/killswitch`, { headers: authHeaders(token, false) });
      const body = await readJsonOrThrow(res);
      return body.killswitches as KillswitchRow[];
    },
  });
}

export function useSaveKillswitch() {
  const { session } = useAuth();
  const token = session?.access_token;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { provider: Provider; disabled: boolean; reason?: string }) => {
      const res = await fetch(`${BASE}/killswitch`, {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify(input),
      });
      return readJsonOrThrow(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-center', 'killswitch'] });
      qc.invalidateQueries({ queryKey: ['api-center', 'summary'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Provider billing (scaffold)
// ---------------------------------------------------------------------------
export function useBillingStatus() {
  const { session } = useAuth();
  const token = session?.access_token;
  return useQuery({
    queryKey: ['api-center', 'billing-status', !!token],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(`${BASE}/billing/status`, { headers: authHeaders(token, false) });
      return readJsonOrThrow(res);
    },
  });
}

export function useRunBillingSync() {
  const { session } = useAuth();
  const token = session?.access_token;
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/billing/sync`, {
        method: 'POST',
        headers: authHeaders(token),
      });
      return readJsonOrThrow(res);
    },
  });
}
