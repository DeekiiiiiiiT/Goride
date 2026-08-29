import { projectId } from '../utils/supabase/info';
import { supabase } from '../utils/supabase/client';

const BASE = `https://${projectId}.supabase.co/functions/v1/gct-admin`;

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token || ''}`,
    'Content-Type': 'application/json',
  };
}

async function gctFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(await authHeaders()), ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `GCT request failed (${res.status})`);
  }
  return data as T;
}

export type GctHealth = {
  ok: boolean;
  effectiveRatePercent: number;
  gctEnabled: boolean;
  fromDb: boolean;
  sourceDisagreement: boolean;
  kvRatePercent: number | null;
  dbStandardRatePercent: number | null;
  resolverFlags: Record<string, unknown> | null;
  needsReviewEntities: Array<Record<string, unknown>>;
  openPeriodCount: number;
  orphanOutputCount?: number;
  orphanInputCount?: number;
};

export const gctAdminService = {
  health: () => gctFetch<GctHealth>('/health'),
  rates: () => gctFetch<{ rates: Array<Record<string, unknown>>; classes: Array<Record<string, unknown>> }>('/rates'),
  appendRate: (body: {
    supplyClass: string;
    ratePercent: number;
    effectiveFrom: string;
    effectiveTo?: string | null;
    authority?: string;
  }) =>
    gctFetch('/rates', {
      method: 'POST',
      body: JSON.stringify({
        supply_class: body.supplyClass,
        rate_percent: body.ratePercent,
        effective_from: body.effectiveFrom,
        effective_to: body.effectiveTo ?? null,
        authority: body.authority ?? '',
      }),
    }),
  entities: (needsReview = false) =>
    gctFetch<{ entities: Array<Record<string, unknown>> }>(
      `/entities${needsReview ? '?needs_review=1' : ''}`,
    ),
  patchEntity: (id: string, body: Record<string, unknown>) =>
    gctFetch(`/entities/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  watchlist: () =>
    gctFetch<{ watchlist: Array<Record<string, unknown>>; thresholdJmd: number }>(
      '/threshold-watchlist',
    ),
  ledger: (kind: 'output' | 'input' = 'output', periodId?: string) => {
    const q = new URLSearchParams({ kind });
    if (periodId) q.set('period_id', periodId);
    return gctFetch<{ rows: Array<Record<string, unknown>> }>(`/ledger?${q}`);
  },
  periods: () => gctFetch<{ periods: Array<Record<string, unknown>> }>('/periods'),
  ensureMonth: (year?: number, month?: number) =>
    gctFetch('/periods/ensure-month', {
      method: 'POST',
      body: JSON.stringify({ year, month }),
    }),
  closePeriod: (id: string) =>
    gctFetch(`/periods/${id}/close`, { method: 'POST', body: '{}' }),
  recordInputTax: (body: Record<string, unknown>) =>
    gctFetch('/input-tax', { method: 'POST', body: JSON.stringify(body) }),
  importInputTaxBatch: (rows: Array<Record<string, unknown>>, periodId?: string) =>
    gctFetch('/input-tax/batch', {
      method: 'POST',
      body: JSON.stringify({ rows, period_id: periodId }),
    }),
  orphans: () =>
    gctFetch<{
      output: Array<Record<string, unknown>>;
      input: Array<Record<string, unknown>>;
      outputCount: number;
      inputCount: number;
    }>('/orphans'),
  assignOrphans: (periodId: string) =>
    gctFetch('/orphans/assign', {
      method: 'POST',
      body: JSON.stringify({ period_id: periodId }),
    }),
  setResolverFlags: (flags: {
    prefer_db?: boolean;
    gct_enabled?: boolean;
  }) => gctFetch('/resolver-flags', { method: 'POST', body: JSON.stringify(flags) }),
};
