import { API_ENDPOINTS } from "../../../../services/apiConfig";
import { publicAnonKey } from "../../../../utils/supabase/info";
import { supabase } from "../../../../utils/supabase/client";
import { humanizeHttpErrorText, importErrorMessage } from "./importErrorMessage";

async function authHeaders(): Promise<HeadersInit> {
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
  return {
    Authorization: token ? `Bearer ${token}` : "",
    apikey: publicAnonKey,
  };
}

const base = `${API_ENDPOINTS.admin}/admin/parts-import`;

async function readApiErrorBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return humanizeHttpErrorText(text, res.status) || text;
  }
}

function apiErrorPayload(body: unknown): unknown {
  if (body && typeof body === "object" && "error" in body) {
    return (body as { error: unknown }).error ?? body;
  }
  return body;
}

function apiError(body: unknown, fallback: string, status?: number): Error {
  const fromBody = importErrorMessage(body);
  const msg =
    fromBody ||
    (typeof body === "string" ? humanizeHttpErrorText(body, status) : "") ||
    (status === 504 ? "Gateway timed out — wait a moment and try again." : fallback);
  return new Error(msg);
}

export type ImportPromoteResult = {
  partsCreated?: number;
  partsUpdated?: number;
  fitsCreated?: number;
  fitsUpdated?: number;
  refreshWarning?: string | null;
  rowsImported?: number;
  ledgerHash?: string;
};

export type ImportBatchSummary = {
  statusCounts?: Record<string, number>;
  issueCounts?: Array<{ code: string; count: number }>;
  actions?: Record<string, number>;
  importableCount?: number;
  engineVersion?: string;
  checkedAt?: string | null;
  rowsTotal?: number;
  rowsError?: number;
  rowsDuplicate?: number;
  rowsUnchanged?: number;
};

export type ImportAreaSummary = {
  id: string;
  name: string;
  opCode: string | null;
  iconKey: string | null;
  partsOnFile: number;
  fitsOnFile: number;
  partTypes: string[];
  needsChecking: number;
  lastImportAt: string | null;
  templateVersion: number;
  sortOrder?: number;
};

export async function fetchImportAreas() {
  const res = await fetch(`${base}/areas`, { headers: await authHeaders() });
  const body = await readApiErrorBody(res);
  if (!res.ok) throw apiError(apiErrorPayload(body), "Could not load import areas", res.status);
  return body as { areas: ImportAreaSummary[] };
}

export type ImportTemplateColumnDef = {
  name: string;
  required?: boolean;
  type?: string;
  required_for?: string[];
};

export async function fetchImportTemplateSchema(areaId: string) {
  const res = await fetch(`${base}/areas/${areaId}/template-schema`, { headers: await authHeaders() });
  const body = await readApiErrorBody(res);
  if (!res.ok) throw apiError(apiErrorPayload(body), "Could not load template", res.status);
  return body as { columns: ImportTemplateColumnDef[] };
}

export async function createImportBatch(areaId: string, fileName: string) {
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${base}/batches`, {
    method: "POST",
    headers,
    body: JSON.stringify({ area_id: areaId, file_name: fileName }),
  });
  const body = await readApiErrorBody(res);
  if (!res.ok) throw apiError(apiErrorPayload(body), "Could not start import", res.status);
  return body as { batch: Record<string, unknown>; path: string };
}

export async function uploadImportBatchSource(batchId: string, file: File) {
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", file.type || "text/csv; charset=utf-8");
  const res = await fetch(`${base}/batches/${batchId}/source`, {
    method: "POST",
    headers,
    body: file,
  });
  const body = await readApiErrorBody(res);
  if (!res.ok) {
    const payload = body as { error?: unknown; hexPrefix?: string; detectedType?: string };
    const err = apiError(apiErrorPayload(body), "Could not upload file", res.status);
    (err as Error & { status?: number; hexPrefix?: string; detectedType?: string }).status = res.status;
    if (payload.hexPrefix) (err as Error & { hexPrefix?: string }).hexPrefix = payload.hexPrefix;
    if (payload.detectedType) (err as Error & { detectedType?: string }).detectedType = payload.detectedType;
    throw err;
  }
  return body as { ok: boolean; bytes: number; path: string };
}

export type ImportCheckResult =
  | { async: true; status: string; batchId?: string; priorImport?: Record<string, unknown> | null }
  | { async: false; batch?: Record<string, unknown>; priorImport?: Record<string, unknown> | null };

export async function runImportCheck(batchId: string): Promise<ImportCheckResult> {
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${base}/batches/${batchId}/check`, { method: "POST", headers, body: "{}" });
  const body = await readApiErrorBody(res);
  if (res.status === 202) {
    return { async: true, ...(body as { status: string; batchId?: string; priorImport?: Record<string, unknown> | null }) };
  }
  if (!res.ok) throw apiError(apiErrorPayload(body), "Check failed", res.status);
  const sync = body as { batch?: Record<string, unknown>; priorImport?: Record<string, unknown> | null };
  return { async: false, batch: sync.batch, priorImport: sync.priorImport ?? null };
}

export async function fetchImportBatchProgress(batchId: string) {
  const res = await fetch(`${base}/batches/${batchId}/progress`, { headers: await authHeaders() });
  const body = await readApiErrorBody(res);
  if (!res.ok) throw apiError(apiErrorPayload(body), "Could not load progress", res.status);
  return body as { batch: Record<string, unknown> };
}

export async function fetchImportBatchSummary(batchId: string) {
  const res = await fetch(`${base}/batches/${batchId}/summary`, { headers: await authHeaders() });
  const body = await readApiErrorBody(res);
  if (!res.ok) throw apiError(apiErrorPayload(body), "Could not load summary", res.status);
  return body as ImportBatchSummary;
}

export async function fetchImportRowInspect(batchId: string, lineNo: number) {
  const res = await fetch(`${base}/batches/${batchId}/rows/${lineNo}/inspect`, { headers: await authHeaders() });
  const body = await readApiErrorBody(res);
  if (!res.ok) throw apiError(apiErrorPayload(body), "Could not inspect row", res.status);
  return body as Record<string, unknown>;
}

export async function patchImportRowsBulk(batchId: string, accepted: boolean, all = true) {
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${base}/batches/${batchId}/rows`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ accepted, all }),
  });
  const body = await readApiErrorBody(res);
  if (!res.ok) throw apiError(apiErrorPayload(body), "Could not update rows", res.status);
  return body as { updated?: number };
}

export async function fetchImportMeta() {
  const res = await fetch(`${base}/meta`, { headers: await authHeaders() });
  const body = await readApiErrorBody(res);
  if (!res.ok) throw apiError(apiErrorPayload(body), "Could not load import meta", res.status);
  return body as { engineVersion?: string; integrityRatio?: number | null; workspaceId?: string | null };
}

export async function pollImportBatchUntilChecked(
  batchId: string,
  opts?: { intervalMs?: number; maxWaitMs?: number; onProgress?: (batch: Record<string, unknown>) => void },
) {
  const intervalMs = opts?.intervalMs ?? 1500;
  const maxWaitMs = opts?.maxWaitMs ?? 120_000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const { batch } = await fetchImportBatchProgress(batchId);
    opts?.onProgress?.(batch);
    const status = String(batch.status ?? "");
    if (status === "checked" || status === "failed") {
      return fetchImportBatch(batchId, { limit: 1, offset: 0 });
    }
    if (status !== "checking") {
      return fetchImportBatch(batchId, { limit: 1, offset: 0 });
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Check timed out — try View background jobs or Check again");
}

export async function fetchImportBatch(
  batchId: string,
  params?: { status?: string; issue?: string; q?: string; limit?: number; offset?: number },
) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.issue) q.set("issue", params.issue);
  if (params?.q) q.set("q", params.q);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  const res = await fetch(`${base}/batches/${batchId}?${q}`, { headers: await authHeaders() });
  const body = await readApiErrorBody(res);
  if (!res.ok) throw apiError(apiErrorPayload(body), "Could not load batch", res.status);
  return body as { batch: Record<string, unknown>; rows: Array<Record<string, unknown>>; total?: number };
}

export async function fetchImportBatchChanges(batchId: string) {
  const res = await fetch(`${base}/batches/${batchId}/changes`, { headers: await authHeaders() });
  const body = await readApiErrorBody(res);
  if (!res.ok) throw apiError(apiErrorPayload(body), "Could not load changes", res.status);
  return body as { parts: Array<Record<string, unknown>>; fits: Array<Record<string, unknown>>; leftOut: Array<Record<string, unknown>> };
}

export async function fetchUndoPreflight(batchId: string) {
  const res = await fetch(`${base}/batches/${batchId}/undo-preflight`, { headers: await authHeaders() });
  const body = await readApiErrorBody(res);
  if (!res.ok) throw apiError(apiErrorPayload(body), "Could not run undo preflight", res.status);
  return body as Record<string, unknown>;
}

export async function refreshImportReadiness(batchId?: string) {
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${base}/refresh`, {
    method: "POST",
    headers,
    body: JSON.stringify(batchId ? { batch_id: batchId } : {}),
  });
  const body = await readApiErrorBody(res);
  if (!res.ok) throw apiError(apiErrorPayload(body), "Refresh failed", res.status);
  return body as { ok?: boolean };
}

export async function patchImportRow(
  batchId: string,
  lineNo: number,
  patch: { column?: string; value?: string; vehicle?: string; accepted?: boolean },
) {
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${base}/batches/${batchId}/rows/${lineNo}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(patch),
  });
  const body = await readApiErrorBody(res);
  if (!res.ok) throw apiError(apiErrorPayload(body), "Could not update row", res.status);
  return body as { row: Record<string, unknown>; result?: unknown };
}

export async function promoteImportBatch(batchId: string) {
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${base}/batches/${batchId}/promote`, { method: "POST", headers, body: "{}" });
  const body = await readApiErrorBody(res);
  if (!res.ok) throw apiError(apiErrorPayload(body), "Import failed", res.status);
  return body as { result?: ImportPromoteResult };
}

export async function cancelImportCheck(batchId: string) {
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${base}/batches/${batchId}/cancel`, { method: "POST", headers, body: "{}" });
  const body = await readApiErrorBody(res);
  if (!res.ok) throw apiError(apiErrorPayload(body), "Could not cancel check", res.status);
  return body as { ok?: boolean };
}

export async function undoImportBatch(batchId: string) {
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${base}/batches/${batchId}/undo`, { method: "POST", headers, body: "{}" });
  const body = await readApiErrorBody(res);
  if (!res.ok) throw apiError(apiErrorPayload(body), "Undo failed", res.status);
  return body;
}

export async function fetchImportLedger(areaId?: string, params?: { limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (areaId) q.set("area", areaId);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  const qs = q.toString();
  const res = await fetch(`${base}/ledger${qs ? `?${qs}` : ""}`, { headers: await authHeaders() });
  const body = await readApiErrorBody(res);
  if (!res.ok) throw apiError(apiErrorPayload(body), "Could not load ledger", res.status);
  return body as { items: Array<Record<string, unknown>>; total?: number; perArea?: Record<string, number> };
}

export async function requestImportAccess() {
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${base}/request-access`, { method: "POST", headers, body: "{}" });
  const body = await readApiErrorBody(res);
  if (!res.ok) throw apiError(apiErrorPayload(body), "Could not request access", res.status);
  return body as { ok?: boolean };
}

export function templateCsvUrl(areaId: string) {
  return `${base}/template/${areaId}.csv`;
}

export function vehiclesCsvUrl() {
  return `${base}/vehicles.csv`;
}

export function sourceCsvUrl(batchId: string) {
  return `${base}/batches/${batchId}/source.csv`;
}

export function failedCsvUrl(batchId: string) {
  return `${base}/batches/${batchId}/failed.csv`;
}

export function ledgerCsvUrl(areaId?: string) {
  return areaId ? `${base}/ledger.csv?area=${areaId}` : `${base}/ledger.csv`;
}
