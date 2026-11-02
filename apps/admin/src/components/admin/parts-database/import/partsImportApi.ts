import { API_ENDPOINTS } from "../../../services/apiConfig";
import { publicAnonKey } from "../../../utils/supabase/info";
import { supabase } from "../../../utils/supabase/client";

async function authHeaders(): Promise<HeadersInit> {
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
  return {
    Authorization: token ? `Bearer ${token}` : "",
    apikey: publicAnonKey,
  };
}

const base = `${API_ENDPOINTS.admin}/admin/parts-import`;

export type ImportAreaSummary = {
  id: string;
  name: string;
  opCode: string | null;
  iconKey: string | null;
  partsOnFile: number;
  lastImportAt: string | null;
  templateVersion: number;
};

export async function fetchImportAreas() {
  const res = await fetch(`${base}/areas`, { headers: await authHeaders() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Could not load import areas");
  return body as { areas: ImportAreaSummary[] };
}

export async function createImportBatch(areaId: string, fileName: string) {
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${base}/batches`, {
    method: "POST",
    headers,
    body: JSON.stringify({ area_id: areaId, file_name: fileName }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Could not start import");
  return body as { batch: Record<string, unknown>; uploadUrl: string; path: string };
}

export type ImportCheckResult =
  | { async: true; status: string; batchId?: string; priorImport?: Record<string, unknown> | null }
  | { async: false; batch?: Record<string, unknown>; priorImport?: Record<string, unknown> | null };

export async function runImportCheck(batchId: string): Promise<ImportCheckResult> {
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${base}/batches/${batchId}/check`, { method: "POST", headers, body: "{}" });
  const body = await res.json().catch(() => ({}));
  if (res.status === 202) {
    return { async: true, ...(body as { status: string; batchId?: string; priorImport?: Record<string, unknown> | null }) };
  }
  if (!res.ok) throw new Error(body.error || body.headerErrors?.[0]?.message || "Check failed");
  return { async: false, batch: body.batch, priorImport: body.priorImport ?? null };
}

export async function pollImportBatchUntilChecked(
  batchId: string,
  opts?: { intervalMs?: number; maxWaitMs?: number; onProgress?: (batch: Record<string, unknown>) => void },
) {
  const intervalMs = opts?.intervalMs ?? 1500;
  const maxWaitMs = opts?.maxWaitMs ?? 120_000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const detail = await fetchImportBatch(batchId, { limit: 1, offset: 0 });
    const batch = detail.batch as Record<string, unknown>;
    opts?.onProgress?.(batch);
    const status = String(batch.status ?? "");
    if (status === "checked" || status === "failed") return detail;
    if (status !== "checking") return detail;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Check timed out — try View background jobs or Check again");
}

export async function fetchImportBatch(batchId: string, params?: { status?: string; limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  const res = await fetch(`${base}/batches/${batchId}?${q}`, { headers: await authHeaders() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Could not load batch");
  return body as { batch: Record<string, unknown>; rows: Array<Record<string, unknown>>; total?: number };
}

export async function patchImportRow(
  batchId: string,
  lineNo: number,
  patch: { column?: string; value?: string; vehicle?: string },
) {
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${base}/batches/${batchId}/rows/${lineNo}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Could not update row");
  return body as { row: Record<string, unknown>; result?: unknown };
}

export async function promoteImportBatch(batchId: string) {
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${base}/batches/${batchId}/promote`, { method: "POST", headers, body: "{}" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Import failed");
  return body;
}

export async function undoImportBatch(batchId: string) {
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${base}/batches/${batchId}/undo`, { method: "POST", headers, body: "{}" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Undo failed");
  return body;
}

export async function fetchImportLedger(areaId?: string) {
  const q = areaId ? `?area=${areaId}` : "";
  const res = await fetch(`${base}/ledger${q}`, { headers: await authHeaders() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Could not load ledger");
  return body as { items: Array<Record<string, unknown>> };
}

export async function requestImportAccess() {
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${base}/request-access`, { method: "POST", headers, body: "{}" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Could not request access");
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
