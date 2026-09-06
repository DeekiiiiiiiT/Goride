/**
 * Settlement desk command + queue client (Phase 3–4).
 * Base: API_ENDPOINTS.financial → /settlements/*
 */
import { requireAuthHeaders } from '../utils/authHeaders';
import { api, fetchWithRetry } from './api';
import { API_ENDPOINTS } from './apiConfig';
import type {
  SettlementQueueParams,
  SettlementQueueResponse,
  SettlementQueueRow,
} from '../hooks/useSettlementQueue';

const BASE = `${API_ENDPOINTS.financial}/settlements`;

export type SettlementCollectBody = {
  driverId: string;
  weekAnchor: string;
  amount: number;
  method?: string;
  reference?: string;
  note?: string;
  idempotencyKey: string;
  expectedOutstanding: number;
};

export type SettlementPayBody = {
  driverId: string;
  weekAnchor: string;
  amount: number;
  method?: string;
  reference?: string;
  note?: string;
  idempotencyKey: string;
  expectedOutstanding: number;
};

export type SettlementWriteOffBody = {
  driverId: string;
  weekAnchor: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
  expectedOutstanding: number;
};

export type SettlementReverseBody = {
  movementId: string;
  reason: string;
  idempotencyKey: string;
  expectedOutstanding: number;
};

export type SettlementRunRow = {
  driverId: string;
  weekAnchor: string;
  amount: number;
  expectedOutstanding: number;
};

export type SettlementRunBody = {
  rows: SettlementRunRow[];
  method?: string;
  effectiveDate?: string;
  kind?: 'collect' | 'pay';
  idempotencyKey: string;
  /** Batch-level expected total; per-row expectedOutstanding is authoritative. */
  expectedOutstanding: number;
};

export type SettlementApproveBody = {
  decision: 'approve' | 'reject';
  note?: string;
  idempotencyKey?: string;
};

async function parseError(response: Response, fallback: string): Promise<string> {
  try {
    const j = await response.json();
    if (j && typeof j.error === 'string') return j.error;
    if (j && typeof j.message === 'string') return j.message;
  } catch {
    /* ignore */
  }
  return fallback;
}

async function postJson<T>(path: string, body: unknown, fallback: string): Promise<T> {
  const response = await fetchWithRetry(`${BASE}${path}`, {
    method: 'POST',
    headers: await requireAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, fallback));
  }
  return response.json() as Promise<T>;
}

function majorToMinor(n: number): number {
  return Math.round((Number(n) || 0) * 100);
}

function mapLegacyPeriodRow(r: Record<string, unknown>, collectKind?: 'driver_owes' | 'cash_held'): SettlementQueueRow {
  const periodAnchor = String(r.periodAnchor || r.period_anchor || '').slice(0, 10);
  const periodEnd = String(r.periodEnd || r.period_end || periodAnchor).slice(0, 10);
  const amountOwed =
    Number(r.amountOwed) ||
    Math.abs(Number(r.settlementAmount) || 0) ||
    Math.abs(Number(r.cashStillHeld) || 0) ||
    0;
  return {
    driverId: String(r.driverId || r.driver_id || ''),
    driverName: r.driverName != null ? String(r.driverName) : undefined,
    periodAnchor,
    periodEnd,
    amountOwedMinor: majorToMinor(amountOwed),
    amountOwed,
    settlementAmount: Number(r.settlementAmount) || 0,
    settlementPaid: Number(r.settlementPaid) || 0,
    cashCollected: Number(r.cashCollected) || 0,
    cashStillHeld: Number(r.cashStillHeld) || 0,
    tripCount: Number(r.tripCount) || 0,
    settlementStatus: r.settlementStatus != null ? String(r.settlementStatus) : undefined,
    fuelFinalized: r.fuelFinalized === true,
    collectKind,
    overpaidAmount: Number(r.overpaidAmount) || undefined,
    cashSourceMismatch: Number(r.cashSourceMismatch) || undefined,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
  };
}

/** Until GET /settlements/queue ships, stitch legacy period list endpoints. */
async function getQueueLegacy(params: SettlementQueueParams): Promise<SettlementQueueResponse> {
  const periodOpts = {
    periodStart: params.weekFrom,
    periodEnd: params.weekTo,
    minAmount: params.minAmount,
    serviceLine: params.scope === 'rideshare' || params.scope === 'rush_delivery' ? params.scope : undefined,
    limit: 2000,
  };

  let rows: SettlementQueueRow[] = [];

  if (params.view === 'pay') {
    const res = await api.getCompanyOwesPeriods(periodOpts);
    rows = (res?.rows || []).map((r: Record<string, unknown>) => mapLegacyPeriodRow(r));
  } else if (params.view === 'reconciled') {
    const res = await api.getReconciledPeriods(periodOpts);
    rows = (res?.rows || []).map((r: Record<string, unknown>) => mapLegacyPeriodRow(r));
  } else {
    // collect: driver_owes + cash_held
    const [owes, held] = await Promise.all([
      api.getDriverOwesPeriods(periodOpts),
      api.getCashHeldPeriods(periodOpts),
    ]);
    const byKey = new Map<string, SettlementQueueRow>();
    for (const r of owes?.rows || []) {
      const mapped = mapLegacyPeriodRow(r as Record<string, unknown>, 'driver_owes');
      byKey.set(`${mapped.driverId}|${mapped.periodAnchor}`, mapped);
    }
    for (const r of held?.rows || []) {
      const mapped = mapLegacyPeriodRow(r as Record<string, unknown>, 'cash_held');
      const k = `${mapped.driverId}|${mapped.periodAnchor}`;
      if (!byKey.has(k)) byKey.set(k, mapped);
    }
    rows = [...byKey.values()];
  }

  const q = (params.search || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (r) =>
        (r.driverName || '').toLowerCase().includes(q) ||
        r.driverId.toLowerCase().includes(q) ||
        r.periodAnchor.includes(q),
    );
  }

  rows.sort((a, b) => {
    const week = String(b.periodAnchor).localeCompare(String(a.periodAnchor));
    if (week) return week;
    return String(a.driverName || a.driverId).localeCompare(String(b.driverName || b.driverId), undefined, {
      sensitivity: 'base',
    });
  });

  const pageSize = params.pageSize ?? 100;
  const page = Math.max(1, params.page ?? 1);
  const total = rows.length;
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  const amountOwedMinor = rows.reduce((s, r) => s + (r.amountOwedMinor || 0), 0);
  const amountDisplayedMinor = pageRows.reduce((s, r) => s + (r.amountOwedMinor || 0), 0);

  return {
    rows: pageRows,
    totals: {
      amountOwedMinor,
      amountDisplayedMinor,
      rowCount: total,
    },
    page: {
      total,
      hasMore: start + pageSize < total,
      truncated: total >= 2000,
      page,
      pageSize,
    },
  };
}

export const settlementCommandsApi = {
  async collect(body: SettlementCollectBody) {
    return postJson('/collect', body, 'Collect failed');
  },

  async pay(body: SettlementPayBody) {
    return postJson('/pay', body, 'Pay failed');
  },

  async writeOff(body: SettlementWriteOffBody) {
    return postJson('/write-off', body, 'Write-off failed');
  },

  async reverse(body: SettlementReverseBody) {
    return postJson('/reverse', body, 'Reverse failed');
  },

  async createRun(body: SettlementRunBody) {
    return postJson<{ runId: string; status?: string }>('/runs', body, 'Payment run failed');
  },

  async getRun(id: string) {
    const response = await fetchWithRetry(`${BASE}/runs/${encodeURIComponent(id)}`, {
      headers: await requireAuthHeaders(null),
    });
    if (!response.ok) throw new Error(await parseError(response, 'Failed to load settlement run'));
    return response.json();
  },

  async approve(movementId: string, body: SettlementApproveBody) {
    return postJson(`/${encodeURIComponent(movementId)}/approve`, body, 'Approval failed');
  },

  /**
   * Prefer GET /settlements/queue; on 404 fall back to legacy period endpoints
   * so Phase 5 UI can land before Phase 4 server ships.
   */
  async getQueue(params: SettlementQueueParams): Promise<SettlementQueueResponse> {
    const qs = new URLSearchParams();
    qs.set('view', params.view);
    if (params.weekFrom) qs.set('weekFrom', params.weekFrom);
    if (params.weekTo) qs.set('weekTo', params.weekTo);
    if (params.minAmount != null) qs.set('minAmount', String(params.minAmount));
    if (params.scope) qs.set('serviceLine', params.scope);
    if (params.search) qs.set('search', params.search);
    if (params.page != null) qs.set('page', String(params.page));
    if (params.pageSize != null) qs.set('pageSize', String(params.pageSize));
    if (params.groupBy) qs.set('groupBy', params.groupBy);
    if (params.ageBucket) qs.set('ageBucket', params.ageBucket);
    if (params.sort) qs.set('sort', params.sort);

    let response: Response;
    try {
      response = await fetchWithRetry(`${BASE}/queue?${qs.toString()}`, {
        headers: await requireAuthHeaders(null),
      });
    } catch {
      // Route not deployed yet — use legacy period endpoints
      return getQueueLegacy(params);
    }
    if (response.ok) return response.json() as Promise<SettlementQueueResponse>;
    if (response.status === 404) return getQueueLegacy(params);
    throw new Error(await parseError(response, 'Failed to load settlement queue'));
  },
};
