/**
 * Week Reconciliation landing API (P1 sources visibility).
 */
import { requireAuthHeaders } from '../utils/authHeaders';
import { fetchWithRetry } from './api';
import { API_ENDPOINTS } from './apiConfig';

const BASE = `${API_ENDPOINTS.fleetCore}/make-server-37f42386/recon`;
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
};

export type ReconWeekSource = {
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

export type ReconRunPayload = {
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
    steps: Array<{ id: string; status: string; lockedBy?: unknown }>;
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
  items: Array<{ id: string; label: string; ok: boolean; detail: string }>;
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
  body: { days: string[]; reason: string; expectedVersion: number },
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
    throw new ReconApiError('Run event failed', response.status);
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
    throw new ReconApiError('Step complete failed', response.status);
  }
  return (await response.json()) as ReconRunPayload;
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

export async function commitReconImport(
  importId: string,
  input: {
    idempotencyKey: string;
    overrideFingerprintDupRowIds?: string[];
  },
): Promise<{ batchId: string; committed: number }> {
  const response = await reconImportFetch(`/${importId}/commit`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new ReconApiError('Failed to commit recon import', response.status);
  }
  const body = (await response.json()) as { batchId: string; committed: number };
  return { batchId: body.batchId, committed: body.committed };
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
    throw new ReconApiError('Failed to register recon import', response.status);
  }
}
