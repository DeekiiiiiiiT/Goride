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

/** Thrown by settlement command POSTs so callers can distinguish business vs cutover. */
export class SettlementCommandApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'SettlementCommandApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * True only when the command endpoint is genuinely absent / unreachable.
 * Business 4xx (403, 409, caps, freeze) must NOT fall back to legacy writes.
 */
export function isSettlementCommandUnavailable(err: unknown): boolean {
  if (err instanceof SettlementCommandApiError) {
    return err.status === 404 || err.status === 501;
  }
  // Network / fetch failure (no Response)
  if (err instanceof TypeError) return true;
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network request failed')) {
      return true;
    }
  }
  return false;
}

/** Close Week freeze — show Open Close Week dialog, not a raw toast. */
export function isPeriodFrozenError(err: unknown): boolean {
  if (err instanceof SettlementCommandApiError && err.code === 'PERIOD_FROZEN') return true;
  if (err instanceof Error) {
    const m = err.message || '';
    return m.includes('PERIOD_FROZEN') || /settlement week is closed/i.test(m);
  }
  return typeof err === 'string' && (err.includes('PERIOD_FROZEN') || /settlement week is closed/i.test(err));
}

/** Fuel/toll not cleared — show MoneyLockedDialog, not a raw MONEY_LOCKED toast. */
export function isMoneyLockedError(err: unknown): boolean {
  if (err instanceof SettlementCommandApiError && err.code === 'MONEY_LOCKED') return true;
  if (err instanceof Error) {
    const m = err.message || '';
    return m.includes('MONEY_LOCKED') || /money is (still )?locked/i.test(m);
  }
  return typeof err === 'string' && (err.includes('MONEY_LOCKED') || /money is (still )?locked/i.test(err));
}

export type SettlementCollectBody = {
  driverId: string;
  weekAnchor: string;
  amount: number;
  method?: string;
  reference?: string;
  note?: string;
  /** First-class over-collection / write reason (N-4). */
  reason?: string;
  allowOverCollect?: boolean;
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
  /** Preferred: reverse by movement UUID. */
  movementId?: string;
  /** Legacy bridge: reverse dual-write / pre-migration tx by transaction id. */
  sourceTransactionId?: string;
  reason: string;
  idempotencyKey: string;
  expectedOutstanding?: number;
};

export type SettlementVerifyBody = {
  /** Prefer movement id when available. */
  movementId?: string;
  /** Legacy awaiting-clear txs. */
  sourceTransactionId?: string;
  idempotencyKey: string;
  note?: string;
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
  /** Optional batch reference (bank / mobile). */
  reference?: string;
  idempotencyKey: string;
  /** Batch-level expected total; per-row expectedOutstanding is authoritative. */
  expectedOutstanding: number;
};

export type SettlementApproveBody = {
  /** Server expects approved | rejected. */
  decision: 'approved' | 'rejected';
  note?: string;
  idempotencyKey?: string;
};

async function parseErrorBody(
  response: Response,
  fallback: string,
): Promise<{ message: string; code?: string }> {
  try {
    const j = await response.json();
    if (j && typeof j === 'object') {
      const code = typeof (j as { code?: string }).code === 'string' ? (j as { code: string }).code : undefined;
      if (typeof (j as { error?: string }).error === 'string') {
        return { message: (j as { error: string }).error, code };
      }
      if (typeof (j as { message?: string }).message === 'string') {
        return { message: (j as { message: string }).message, code };
      }
    }
  } catch {
    /* ignore */
  }
  return { message: fallback };
}

async function parseError(response: Response, fallback: string): Promise<string> {
  return (await parseErrorBody(response, fallback)).message;
}

async function postJson<T>(path: string, body: unknown, fallback: string): Promise<T> {
  const response = await fetchWithRetry(`${BASE}${path}`, {
    method: 'POST',
    headers: await requireAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const { message, code } = await parseErrorBody(response, fallback);
    throw new SettlementCommandApiError(message, response.status, code);
  }
  return response.json() as Promise<T>;
}

function majorToMinor(n: number): number {
  return Math.round((Number(n) || 0) * 100);
}

function numField(r: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    if (r[k] != null && Number.isFinite(Number(r[k]))) return Number(r[k]);
  }
  return 0;
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
    cashReturned: Number(r.cashReturned) || 0,
    cashStillHeld: Number(r.cashStillHeld) || 0,
    tripCount: Number(r.tripCount) || 0,
    settlementStatus: r.settlementStatus != null ? String(r.settlementStatus) : undefined,
    fuelFinalized: r.fuelFinalized === true,
    collectKind,
    overpaidAmount: Number(r.overpaidAmount) || undefined,
    cashSourceMismatch: Number(r.cashSourceMismatch) || undefined,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    // Reconciled list extras (legacy reconciled endpoint)
    earningsGross: numField(r, 'earningsGross'),
    driverShare: numField(r, 'driverShare'),
    fleetShare: numField(r, 'fleetShare'),
    driverSharePercent: numField(r, 'driverSharePercent'),
    fuelDeduction: numField(r, 'fuelDeduction'),
    fuelFleetShare: numField(r, 'fuelFleetShare'),
    tollChargedToDriver: numField(r, 'tollChargedToDriver'),
    tollCashSpend: numField(r, 'tollCashSpend'),
    cashWrittenOff: numField(r, 'cashWrittenOff'),
    payoutNet: numField(r, 'payoutNet'),
    tipsPaidToDriver: numField(r, 'tipsPaidToDriver'),
    tipsWithheld: numField(r, 'tipsWithheld'),
  };
}

/** Legacy period list APIs return `{ data }` (and sometimes `{ rows }`). */
function legacyPeriodList(res: { data?: unknown[]; rows?: unknown[] } | null | undefined): Record<string, unknown>[] {
  const list = res?.data ?? res?.rows ?? [];
  return (Array.isArray(list) ? list : []) as Record<string, unknown>[];
}

/** Until GET /settlements/queue ships, stitch legacy period list endpoints. */
async function getQueueLegacy(params: SettlementQueueParams): Promise<SettlementQueueResponse> {
  const serviceLine: 'rideshare' | 'rush_delivery' | undefined =
    params.scope === 'rideshare' || params.scope === 'rush_delivery' ? params.scope : undefined;
  const periodOpts = {
    periodStart: params.weekFrom,
    periodEnd: params.weekTo,
    minAmount: params.minAmount,
    serviceLine,
    limit: 2000,
  };

  let rows: SettlementQueueRow[] = [];

  if (params.view === 'pay') {
    const res = await api.getCompanyOwesPeriods(periodOpts);
    rows = legacyPeriodList(res).map((r) => mapLegacyPeriodRow(r));
  } else if (params.view === 'reconciled') {
    const res = await api.getReconciledPeriods(periodOpts);
    rows = legacyPeriodList(res).map((r) => mapLegacyPeriodRow(r));
  } else {
    // collect: driver_owes + cash_held (prefer driver_owes when both exist)
    const [owes, held] = await Promise.all([
      api.getDriverOwesPeriods(periodOpts),
      api.getCashHeldPeriods(periodOpts),
    ]);
    const byKey = new Map<string, SettlementQueueRow>();
    for (const r of legacyPeriodList(held)) {
      const mapped = mapLegacyPeriodRow(r, 'cash_held');
      byKey.set(`${mapped.driverId}|${mapped.periodAnchor}`, mapped);
    }
    for (const r of legacyPeriodList(owes)) {
      const mapped = mapLegacyPeriodRow(r, 'driver_owes');
      byKey.set(`${mapped.driverId}|${mapped.periodAnchor}`, mapped);
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

  async verify(body: SettlementVerifyBody) {
    return postJson('/verify', body, 'Verify failed');
  },

  async createRun(body: SettlementRunBody) {
    return postJson<{
      runId: string;
      status?: string;
      summary?: { posted: number; failed: number; total: number };
      rows?: Array<{
        id?: string;
        driver_id?: string;
        period_anchor?: string;
        status?: string;
        error_message?: string | null;
        movement_id?: string | null;
      }>;
    }>('/runs', body, 'Payment run failed');
  },

  async getRun(id: string) {
    const response = await fetchWithRetry(`${BASE}/runs/${encodeURIComponent(id)}`, {
      headers: await requireAuthHeaders(null),
    });
    if (!response.ok) {
      const { message, code } = await parseErrorBody(response, 'Failed to load settlement run');
      throw new SettlementCommandApiError(message, response.status, code);
    }
    return response.json();
  },

  async approve(movementId: string, body: SettlementApproveBody) {
    return postJson(`/${encodeURIComponent(movementId)}/approve`, body, 'Approval failed');
  },

  async getMovements(params: {
    weekFrom?: string;
    weekTo?: string;
    kind?: string;
    approvalState?: string;
    pageSize?: number;
  } = {}) {
    const qs = new URLSearchParams();
    if (params.weekFrom) qs.set('weekFrom', params.weekFrom);
    if (params.weekTo) qs.set('weekTo', params.weekTo);
    if (params.kind) qs.set('kind', params.kind);
    if (params.approvalState) qs.set('approvalState', params.approvalState);
    if (params.pageSize != null) qs.set('pageSize', String(params.pageSize));
    const response = await fetchWithRetry(`${BASE}/movements?${qs.toString()}`, {
      headers: await requireAuthHeaders(null),
    });
    if (!response.ok) {
      const { message, code } = await parseErrorBody(response, 'Failed to load movements');
      throw new SettlementCommandApiError(message, response.status, code);
    }
    return response.json() as Promise<{
      success: boolean;
      rows: Array<{
        id: string;
        kind: string;
        driverId: string;
        driverName?: string;
        periodAnchor: string;
        amount: number;
        amountMinor: number;
        method?: string | null;
        reference?: string | null;
        reason?: string | null;
        status?: string;
        approvalState?: string;
        sourceTransactionId?: string | null;
        createdAt?: string;
      }>;
      page: { total: number; hasMore: boolean };
    }>;
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

  /** N-6: NULL-org period health for desk alert. */
  async getHealth(): Promise<{
    success: boolean;
    nullOrgPeriodCount: number;
    totalPeriods: number;
    sampleDriverIds: string[];
  }> {
    const response = await fetchWithRetry(`${BASE}/health`, {
      headers: await requireAuthHeaders(null),
    });
    if (!response.ok) {
      const { message, code } = await parseErrorBody(response, 'Failed to load settlement health');
      throw new SettlementCommandApiError(message, response.status, code);
    }
    return response.json();
  },
};
