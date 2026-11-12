/**
 * Week Reconciliation landing API (P1 sources visibility).
 */
import type { DeliveryReconReadinessItem } from '@roam/finance-core';
import { requireAuthHeaders } from '../utils/authHeaders';
import { fetchWithRetry } from './api';
import { API_ENDPOINTS } from './apiConfig';

// fleet-core kernel maps /fleet-core/X → /make-server-37f42386/X — do not
// insert the legacy make-server segment again (double prefix → 404).
const BASE = `${API_ENDPOINTS.fleetCore}/recon`;
const IMPORTS_BASE = `${BASE}/imports`;

export type ReconImportPreview = {
  new: Array<{ rowIndex: number; rowId: string; classification: string; payload: Record<string, unknown> }>;
  duplicate: {
    byRef: Array<{ rowIndex: number; rowId: string; classification: string; payload: Record<string, unknown> }>;
    byFingerprint: Array<{ rowIndex: number; rowId: string; classification: string; payload: Record<string, unknown> }>;
  };
  rejected: unknown[];
  spill: unknown[];
  totals_minor: number;
  coverage_start: string | null;
  coverage_end: string | null;
  data_start?: string | null;
  data_end?: string | null;
  saved_start?: string | null;
  saved_end?: string | null;
};

export type ReconWeekSource = {
  requirement?: string;
  id: string;
  status: string;
  coverage: Record<string, string>;
};

export type ReconWeekSummary = {
  weekKey: string;
  line: string;
  state: string;
  progress: { done: number; total: number };
  nextAction: { kind: string; targetId: string; label: string };
  blockers: number;
  sources: ReconWeekSource[];
};

/** WRA-16: on every Week Reconciliation payload. */
export type ReconCalculatorStatus = {
  paused: boolean;
  pausedSince: string | null;
  pendingUnits: number;
  oldestPendingAgeSeconds: number | null;
  lastComputedAt: string | null;
};

/** One week on the list (stored rows only, Round 2a). */
export type ReconWeekListEntry = ReconWeekSummary & {
  closedAt: string | null;
  closedBy: string | null;
  requiredSourcesMissing: number;
  /** WRA-40: the earliest open week before this one. */
  earlierOpenWeek: string | null;
};

export type ReconWeekListKpis = {
  openWeeks: number;
  reconciledWeeks: number;
  requiredSourcesMissing: number;
  oldestOpenWeek: string | null;
  oldestOpenNextAction: string | null;
};

export type ReconWeekList = {
  weeks: ReconWeekListEntry[];
  kpis: ReconWeekListKpis;
  calculator: ReconCalculatorStatus | null;
  deliveryActive: boolean;
  nextCursor: string | null;
};

/** WRA-12: the whole stored week list for a line, 26 at a time. */
export async function fetchWeekList(
  line: 'rideshare' | 'rush_delivery',
  opts?: { year?: number | null; status?: 'outstanding' | 'completed'; cursor?: string | null; limit?: number },
): Promise<ReconWeekList> {
  const qs = new URLSearchParams({ line, limit: String(opts?.limit ?? 26) });
  if (opts?.year != null) qs.set('year', String(opts.year));
  if (opts?.status) qs.set('status', opts.status);
  if (opts?.cursor) qs.set('cursor', opts.cursor);
  const response = await fetchWithRetry(`${BASE}/weeks?${qs.toString()}`, {
    headers: await requireAuthHeaders(null),
  });
  if (!response.ok) {
    let message = 'Failed to load reconciliation weeks';
    try {
      const j = await response.json();
      if (j && typeof (j as { message?: string }).message === 'string') message = (j as { message: string }).message;
    } catch {
      /* ignore */
    }
    throw new ReconApiError(message, response.status);
  }
  const body = (await response.json()) as Partial<ReconWeekList>;
  return {
    weeks: (body.weeks ?? []) as ReconWeekListEntry[],
    kpis: body.kpis ?? { openWeeks: 0, reconciledWeeks: 0, requiredSourcesMissing: 0, oldestOpenWeek: null, oldestOpenNextAction: null },
    calculator: body.calculator ?? null,
    deliveryActive: Boolean(body.deliveryActive),
    nextCursor: body.nextCursor ?? null,
  };
}

export class ReconApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ReconApiError';
    this.status = status;
  }
}

/** True when recon routes are not deployed yet. */
export function isReconUnavailable(err: unknown): boolean {
  if (err instanceof ReconApiError) return err.status === 404 || err.status === 501;
  if (err instanceof TypeError) return true;
  return false;
}

export type ReconRunSource = {
  id: string;
  label: string;
  kind?: string;
  requirement: string;
  status: string;
  coverage: Record<string, string>;
  inputHash?: string;
};

export type ReconExternalQueueItem = {
  organizationId: string;
  organizationName: string | null;
  serviceLine: string;
  weekKey: string;
  sourceId: string;
  runId: string | null;
  runSourceStatus: string | null;
  requestId: string | null;
  requestedAt: string | null;
  requestedBy: string | null;
  note: string | null;
};

export type ReconRunStep = {
  id: string;
  actionable: number;
  informational: number;
  completedAt?: string | null;
  completedBy?: string | null;
  inputsHashAtComplete?: string | null;
  gateStatus?: string;
};

export type ReconAttributionSummary = {
  rowCount: number;
  amountMajor: number;
  rows?: Array<{ id: string; entity: 'toll' | 'fuel'; amountMajor: number }>;
  truncated?: boolean;
};

/** A saved close blocker (recon.week_blockers). The steps and the close workflow read the same rows. */
export type ReconStoredBlocker = {
  code: string;
  severity: string;
  driver_id: string | null;
  source_id: string | null;
  message: string | null;
  persisted: number | null;
  expected: number | null;
  delta: number | null;
};

/** "none" = not calculated yet (use the live preview); "error" = read failed (Close stays locked). */
export type ReconCloseCheck =
  | { status: 'ok'; blockers: ReconStoredBlocker[] }
  | { status: 'none' }
  | { status: 'error' };

export type ReconRunPayload = {
  deskReady?: boolean;
  /** True when an admin has stopped the week calculator, so the desk will not fill in. */
  calculatorPaused?: boolean;
  /** WRA-16: calculator state and how fresh the saved numbers are. */
  calculator?: ReconCalculatorStatus | null;
  closeCheck?: ReconCloseCheck;
  run: {
    id: string;
    organizationId: string;
    serviceLine: string;
    weekKey: string;
    state: string;
    version: number;
  };
  evaluation: {
    stage: string;
    steps: Array<{ id: string; status: string; lockedBy?: unknown; hidden?: boolean }>;
    nextAction: { kind: string; targetId: string; label: string };
  };
  attribution?: ReconAttributionSummary;
  sources: ReconRunSource[];
  steps: ReconRunStep[];
};

export type DeliveryReconReadinessResponse = {
  weekKey: string;
  weekEnd: string;
  ready: boolean;
  items: DeliveryReconReadinessItem[];
};

export async function fetchWeeks(
  line: 'rideshare' | 'rush_delivery' = 'rideshare',
  opts?: { status?: string; year?: number },
): Promise<ReconWeekSummary[]> {
  const qs = new URLSearchParams({ line });
  if (opts?.status) qs.set('status', opts.status);
  if (opts?.year != null) qs.set('year', String(opts.year));

  const response = await fetchWithRetry(`${BASE}/weeks?${qs.toString()}`, {
    headers: await requireAuthHeaders(null),
  });
  if (!response.ok) {
    let message = 'Failed to load reconciliation weeks';
    try {
      const j = await response.json();
      if (j && typeof (j as { message?: string }).message === 'string') {
        message = (j as { message: string }).message;
      }
    } catch {
      /* ignore */
    }
    throw new ReconApiError(message, response.status);
  }
  const body = (await response.json()) as { weeks?: ReconWeekSummary[] };
  return body.weeks ?? [];
}

async function reconFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetchWithRetry(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(await requireAuthHeaders(null)),
      ...(init?.headers ?? {}),
    },
  });
}

export async function fetchRun(
  line: 'rideshare' | 'rush_delivery',
  weekKey: string,
): Promise<ReconRunPayload> {
  const response = await reconFetch(
    `/runs/${encodeURIComponent(line)}/${encodeURIComponent(weekKey)}`,
  );
  if (!response.ok) {
    throw new ReconApiError('Failed to load reconciliation run', response.status);
  }
  const body = (await response.json()) as ReconRunPayload & { success?: boolean };
  return body;
}

export async function attestSourceNone(
  line: 'rideshare' | 'rush_delivery',
  weekKey: string,
  sourceId: string,
  body: { days: string[]; expectedVersion: number; reason?: string },
): Promise<ReconRunPayload> {
  const response = await reconFetch(
    `/runs/${encodeURIComponent(line)}/${encodeURIComponent(weekKey)}/sources/${encodeURIComponent(sourceId)}/attest-none`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  if (!response.ok) {
    throw new ReconApiError('Attestation failed', response.status);
  }
  return (await response.json()) as ReconRunPayload;
}

export async function waiveSource(
  line: 'rideshare' | 'rush_delivery',
  weekKey: string,
  sourceId: string,
  body: { reason: string; expectedVersion: number },
): Promise<ReconRunPayload> {
  const response = await reconFetch(
    `/runs/${encodeURIComponent(line)}/${encodeURIComponent(weekKey)}/sources/${encodeURIComponent(sourceId)}/waive`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  if (!response.ok) {
    throw new ReconApiError('Waive failed', response.status);
  }
  return (await response.json()) as ReconRunPayload;
}

export async function requestExternalSource(
  line: 'rideshare' | 'rush_delivery',
  weekKey: string,
  sourceId: string,
  body?: { note?: string; expectedVersion?: number },
): Promise<ReconRunPayload & { requestId?: string }> {
  const response = await reconFetch(
    `/runs/${encodeURIComponent(line)}/${encodeURIComponent(weekKey)}/sources/${encodeURIComponent(sourceId)}/request`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    },
  );
  if (!response.ok) {
    throw new ReconApiError('External source request failed', response.status);
  }
  return (await response.json()) as ReconRunPayload & { requestId?: string };
}

/** Soft-fail: returns null on 403 / missing permission. */
export async function fetchExternalQueue(): Promise<ReconExternalQueueItem[] | null> {
  const response = await reconFetch('/external-queue');
  if (response.status === 403) return null;
  if (!response.ok) {
    throw new ReconApiError('Failed to load external queue', response.status);
  }
  const body = (await response.json()) as { items?: ReconExternalQueueItem[] };
  return body.items ?? [];
}

export type TagAccountRollForwardPayload = {
  weekKey: string;
  priorWeekKey: string | null;
  openingMinor: number;
  topUpsMinor: number;
  tagUsageMinor: number;
  statementClosingMinor: number | null;
  expectedClosingMinor: number;
  varianceMinor: number | null;
  ties: boolean;
};

export async function fetchTagAccountRollForward(
  line: 'rideshare' | 'rush_delivery',
  weekKey: string,
): Promise<TagAccountRollForwardPayload> {
  const response = await reconFetch(
    `/runs/${encodeURIComponent(line)}/${encodeURIComponent(weekKey)}/tag-account`,
  );
  if (!response.ok) {
    throw new ReconApiError('Failed to load tag account roll-forward', response.status);
  }
  return (await response.json()) as TagAccountRollForwardPayload;
}

export async function postRunEvent(
  line: 'rideshare' | 'rush_delivery',
  weekKey: string,
  body: { kind: string; payload?: Record<string, unknown>; expectedVersion: number },
): Promise<ReconRunPayload> {
  const response = await reconFetch(
    `/runs/${encodeURIComponent(line)}/${encodeURIComponent(weekKey)}/events`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  if (!response.ok) {
    const err = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    // Keep the server's code (WEEK_CHANGED / WEEK_CLOSED) so the step can show the right message.
    throw new ReconApiError(err?.message || err?.error || 'Run event failed', response.status);
  }
  return (await response.json()) as ReconRunPayload;
}

export async function postReconAttribution(
  line: 'rideshare' | 'rush_delivery',
  weekKey: string,
  body: {
    rows: Array<{ id: string; entity?: string; serviceLine: 'rideshare' | 'rush_delivery' }>;
    expectedVersion: number;
  },
): Promise<ReconRunPayload> {
  const response = await reconFetch(
    `/runs/${encodeURIComponent(line)}/${encodeURIComponent(weekKey)}/attribution`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  if (!response.ok) {
    throw new ReconApiError('Attribution update failed', response.status);
  }
  return (await response.json()) as ReconRunPayload;
}

export async function fetchDeliveryReconReadiness(
  weekKey: string,
): Promise<DeliveryReconReadinessResponse> {
  const qs = new URLSearchParams({ weekKey });
  const response = await fetchWithRetry(
    `${API_ENDPOINTS.fleetCore}/rush/delivery-recon-readiness?${qs.toString()}`,
    { headers: await requireAuthHeaders(null) },
  );
  if (!response.ok) {
    throw new ReconApiError('Failed to load delivery readiness', response.status);
  }
  return (await response.json()) as DeliveryReconReadinessResponse;
}

export async function completeRunStep(
  line: 'rideshare' | 'rush_delivery',
  weekKey: string,
  stepId: string,
  body: { expectedInputsHash?: string; expectedVersion: number },
): Promise<ReconRunPayload> {
  const response = await reconFetch(
    `/runs/${encodeURIComponent(line)}/${encodeURIComponent(weekKey)}/steps/${encodeURIComponent(stepId)}/complete`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  if (!response.ok) {
    let message = 'Step complete failed';
    try {
      const j = (await response.json()) as { message?: string };
      if (typeof j?.message === 'string' && j.message.trim()) message = j.message;
    } catch {
      /* ignore */
    }
    throw new ReconApiError(message, response.status);
  }
  const payload = (await response.json()) as ReconRunPayload & { ok?: boolean };
  if (payload.run && Array.isArray(payload.sources)) return payload;
  return fetchRun(line, weekKey);
}

export type WeekProjectionStatus = {
  pendingDrivers: number;
  failedDrivers: number;
  totalDrivers: number;
  line: string | null;
};

export async function fetchWeekProjectionStatus(
  line: 'rideshare' | 'rush_delivery',
  weekKey: string,
): Promise<WeekProjectionStatus> {
  const response = await reconFetch(
    `/runs/${encodeURIComponent(line)}/${encodeURIComponent(weekKey)}/status`,
  );
  if (!response.ok) {
    return { pendingDrivers: 0, failedDrivers: 0, totalDrivers: 0, line: null };
  }
  return (await response.json()) as WeekProjectionStatus;
}

export async function retryFailedProjection(
  line: 'rideshare' | 'rush_delivery',
  weekKey: string,
): Promise<WeekProjectionStatus> {
  const response = await reconFetch(
    `/runs/${encodeURIComponent(line)}/${encodeURIComponent(weekKey)}/retry-failed`,
    { method: 'POST' },
  );
  if (!response.ok) {
    throw new ReconApiError('Could not retry the update', response.status);
  }
  return (await response.json()) as WeekProjectionStatus;
}

async function reconImportFetch(
  path: string,
  init: RequestInit,
): Promise<Response> {
  return fetchWithRetry(`${IMPORTS_BASE}${path}`, {
    ...init,
    headers: {
      ...(await requireAuthHeaders(null)),
      ...(init.headers || {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

export async function createReconImport(input: {
  sourceId: string;
  weekKey?: string;
  fileName: string;
  sha256?: string;
}): Promise<{ importId: string }> {
  const response = await reconImportFetch('', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new ReconApiError('Failed to create recon import', response.status);
  }
  const body = (await response.json()) as { importId: string };
  return { importId: body.importId };
}

export async function parseReconImport(
  importId: string,
  input: {
    mode: 'usage' | 'topup' | 'fuel';
    weekKey?: string;
    csvText?: string;
    rows: Record<string, unknown>[];
  },
): Promise<{ preview: ReconImportPreview }> {
  const response = await reconImportFetch(`/${importId}/parse`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new ReconApiError('Failed to parse recon import', response.status);
  }
  const body = (await response.json()) as { preview: ReconImportPreview };
  return { preview: body.preview };
}

export type ReconImportCommitResult = {
  success: boolean;
  partial?: boolean;
  batchId: string;
  committed: number;
  moneyFailed?: number;
  skippedRef?: number;
  skippedFp?: number;
  rejected?: number;
  message?: string;
};

export async function commitReconImport(
  importId: string,
  input: {
    idempotencyKey: string;
    overrideFingerprintDupRowIds?: string[];
    coverageStart?: string | null;
    coverageEnd?: string | null;
  },
): Promise<ReconImportCommitResult> {
  const response = await reconImportFetch(`/${importId}/commit`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => ({}))) as Partial<ReconImportCommitResult> & {
    error?: string;
    message?: string;
  };
  // R5-01: 422 partial = rows may be in ledger but money events failed — surface clearly.
  if (response.status === 422 && body.partial) {
    return {
      success: false,
      partial: true,
      batchId: String(body.batchId || ''),
      committed: Number(body.committed) || 0,
      moneyFailed: Number(body.moneyFailed) || 0,
      skippedRef: Number(body.skippedRef) || 0,
      skippedFp: Number(body.skippedFp) || 0,
      rejected: Number(body.rejected) || 0,
      message:
        body.message ||
        'Some toll rows were saved but money events failed. Retry commit or contact support.',
    };
  }
  if (!response.ok) {
    throw new ReconApiError(
      body.message || body.error || 'Failed to commit recon import',
      response.status,
    );
  }
  return {
    success: body.success !== false,
    batchId: String(body.batchId || ''),
    committed: Number(body.committed) || 0,
    moneyFailed: Number(body.moneyFailed) || 0,
    skippedRef: Number(body.skippedRef) || 0,
    skippedFp: Number(body.skippedFp) || 0,
    rejected: Number(body.rejected) || 0,
  };
}

export async function registerReconImport(
  importId: string,
  input: Record<string, unknown>,
): Promise<void> {
  const response = await reconImportFetch(`/${importId}/register`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    // Pass the server's reason through (e.g. which day the coverage has to include).
    const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
    throw new ReconApiError(body.message || body.error || 'Failed to register recon import', response.status);
  }
}

// ── Round 4c: steps 6–8 on saved data, approvals, History, alerts ──────────

/** Error with the server's code (WEEK_CHANGED, APPROVAL_GONE, …) so screens can react. */
export class ReconActionError extends ReconApiError {
  readonly code: string | null;
  constructor(message: string, status: number, code: string | null) {
    super(message, status);
    this.name = 'ReconActionError';
    this.code = code;
  }
}

async function reconJson<T>(path: string, init: RequestInit | undefined, fallback: string): Promise<T> {
  const response = await reconFetch(path, init);
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    /* empty body */
  }
  if (!response.ok) {
    const b = (body ?? {}) as { message?: string; error?: string };
    throw new ReconActionError(String(b.message || fallback), response.status, b.error ? String(b.error) : null);
  }
  return body as T;
}

function postJson(body: unknown, idempotencyKey?: string): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body ?? {}),
  };
}

/** One key per click, so a double-click or a retry runs once (WRA-28). */
export function newIdempotencyKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function runPath(line: string, weekKey: string, tail: string): string {
  return `/runs/${encodeURIComponent(line)}/${encodeURIComponent(weekKey)}${tail}`;
}

export type ReconCashMismatch = {
  driverId: string;
  driverName: string | null;
  weekKey: string;
  uberCash: number;
  uberTripCash: number;
  mismatch: number;
  accepted: boolean;
};

/** WRA-21: per-driver hours from the week's Uber upload (step 6 Activity vs trips). */
export type ReconWeekActivity =
  | { status: 'no_upload' }
  | { status: 'not_recorded'; uploadedAt: string | null }
  | {
      status: 'ok';
      uploadedAt: string | null;
      drivers: Array<{
        driverId: string;
        name: string;
        tripsCompleted: number;
        onlineHours: number;
        onTripHours: number;
        onTripPct: number | null;
      }>;
    };

export async function fetchWeekActivity(
  line: 'rideshare' | 'rush_delivery',
  weekKey: string,
): Promise<ReconWeekActivity> {
  const res = await reconJson<{ activity: ReconWeekActivity }>(
    runPath(line, weekKey, '/activity'),
    undefined,
    'Could not load activity',
  );
  return res.activity;
}

/** Step 6: statement cash vs trip cash, from saved driver weeks (no live calculation). */
export async function fetchWeekMoney(
  line: 'rideshare' | 'rush_delivery',
  weekKey: string,
): Promise<{ cashSourceMismatches: ReconCashMismatch[]; drivers: Array<{ driverId: string; driverName: string | null }> }> {
  return reconJson(runPath(line, weekKey, '/money'), undefined, 'Could not load the cash check');
}

/** Step 6: Seal earnings / Reseal — a change, through the week wrapper. */
export async function sealEarnings(
  line: 'rideshare' | 'rush_delivery',
  weekKey: string,
  expectedVersion: number,
): Promise<ReconRunPayload> {
  return reconJson(
    runPath(line, weekKey, '/seal-earnings'),
    postJson({ expectedVersion }, newIdempotencyKey()),
    'Could not seal earnings',
  );
}

export type ReconHistoryItem = {
  id: string;
  at: string;
  step: string | null;
  label: string;
  reason: string | null;
  by: string;
  approval: string | null;
  selfApproved: boolean;
  status: string;
  system: boolean;
};

export async function fetchWeekHistory(
  line: 'rideshare' | 'rush_delivery',
  weekKey: string,
): Promise<ReconHistoryItem[]> {
  const body = await reconJson<{ items?: ReconHistoryItem[] }>(
    runPath(line, weekKey, '/history'),
    undefined,
    'Could not load the history',
  );
  return body.items ?? [];
}

export type ReconApprovalAction = 'waive' | 'accept_statement_cash' | 'close' | 'reopen' | 'sign_restatement';

export type ReconApprovalItem = {
  requestId: string | number;
  weekKey: string;
  line: 'rideshare' | 'rush_delivery';
  action: ReconApprovalAction;
  label: string;
  params: Record<string, unknown>;
  reason: string | null;
  preparedBy: string | null;
  sentAt: string;
  status: 'pending_approval' | 'stale';
};

export async function fetchApprovals(): Promise<{ items: ReconApprovalItem[]; me: string | null; otherApprovers: number }> {
  const body = await reconJson<{ items?: ReconApprovalItem[]; me?: string; otherApprovers?: number }>(
    '/approvals',
    undefined,
    'Could not load approvals',
  );
  return { items: body.items ?? [], me: body.me ?? null, otherApprovers: Number(body.otherApprovers ?? 1) };
}

export async function sendForApproval(input: {
  line: 'rideshare' | 'rush_delivery';
  weekKey: string;
  action: ReconApprovalAction;
  params?: Record<string, unknown>;
  reason: string;
  expectedVersion: number;
}): Promise<{ requestId: string | number; status: string }> {
  return reconJson('/approvals', postJson(input, newIdempotencyKey()), 'Could not send for approval');
}

export async function approveRequest(id: string | number, reason?: string): Promise<unknown> {
  return reconJson(`/approvals/${encodeURIComponent(String(id))}/approve`, postJson({ reason }, newIdempotencyKey()), 'Could not approve');
}

export async function rejectRequest(id: string | number, reason: string): Promise<unknown> {
  return reconJson(`/approvals/${encodeURIComponent(String(id))}/reject`, postJson({ reason }, newIdempotencyKey()), 'Could not reject');
}

export async function withdrawRequest(id: string | number): Promise<unknown> {
  return reconJson(`/approvals/${encodeURIComponent(String(id))}/withdraw`, postJson({}, newIdempotencyKey()), 'Could not withdraw');
}

export type ReconAlert = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  raisedAt: string;
  acknowledgedAt: string | null;
};

export async function fetchReconAlerts(): Promise<ReconAlert[]> {
  const body = await reconJson<{ items?: Array<Record<string, unknown>> }>("/alerts", undefined, "Could not load alerts");
  return (body.items ?? []).map((r) => ({
    id: String(r.id),
    kind: String(r.kind ?? ""),
    title: String(r.title ?? ""),
    detail: r.detail == null ? null : typeof r.detail === "string" ? r.detail : JSON.stringify(r.detail),
    raisedAt: String(r.raised_at ?? ""),
    acknowledgedAt: r.acknowledged_at == null ? null : String(r.acknowledged_at),
  }));
}

export async function acknowledgeReconAlert(id: string): Promise<unknown> {
  return reconJson(`/alerts/${encodeURIComponent(id)}/acknowledge`, postJson({}), 'Could not acknowledge');
}

/** Switch-over (§9): is the rebuilt Week Reconciliation on for this company? Off unless the server says on. */
export async function fetchReconV2Switch(): Promise<boolean> {
  try {
    const res = await reconJson<{ reconV2?: boolean }>('/switch', undefined, 'Could not read the Week Reconciliation switch');
    return res.reconV2 === true;
  } catch {
    return false;
  }
}
