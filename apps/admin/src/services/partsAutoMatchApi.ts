import { API_ENDPOINTS } from "./apiConfig";
import { publicAnonKey } from "../utils/supabase/info";

const AUTO = `${API_ENDPOINTS.admin}/make-server-37f42386/admin/auto-match`;
const ADMIN = `${API_ENDPOINTS.admin}/make-server-37f42386/admin`;

async function headers(token: string): Promise<HeadersInit> {
  return {
    Authorization: `Bearer ${token}`,
    apikey: publicAnonKey,
    "Content-Type": "application/json",
  };
}

async function parseErr(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error || `HTTP ${res.status}`;
}

export type PartMatchHealth = {
  engineVersion?: number;
  normVersion?: number;
  enabled?: boolean;
  derived?: { live?: number; needsChecking?: number; suppressed?: number };
  tierBreakdown?: Record<string, number>;
  openConflicts?: Record<string, number>;
  lastRun?: {
    run_id?: string;
    kind?: string;
    started_at?: string;
    finished_at?: string;
    error?: string | null;
    duration_ms?: number;
    rows_scanned?: number;
  } | null;
  errorCount24h?: number;
  unresolvedPositionReports?: number;
};

export type PartMatchSchedule = {
  nextRun?: string;
  cron?: string;
  jobname?: string;
  intervalLabel?: string;
};

export type MatchConflictRow = Record<string, unknown> & {
  id?: string;
  code?: string;
  conflict_type?: string;
  status?: string;
  vehicle_catalog_id?: string;
  vehicle_label?: string;
  part_id?: string;
  part_name?: string;
  interchange_group_id?: string;
  group_code?: string;
  matched_key?: string;
  detail?: Record<string, unknown>;
  found_at?: string | null;
};

export type AutoMatchConflictsResponse = {
  rows: MatchConflictRow[];
  filteredCount?: number;
  totalsByType?: Record<string, number>;
  totalsByStatus?: Record<string, number>;
  totalCount?: number;
};

export async function fetchPartMatchHealth(token: string, vehicleId?: string): Promise<PartMatchHealth> {
  const q = vehicleId ? `?vehicleId=${encodeURIComponent(vehicleId)}` : "";
  const res = await fetch(`${AUTO}/health${q}`, { headers: await headers(token) });
  if (!res.ok) throw new Error(await parseErr(res));
  return (await res.json()) as PartMatchHealth;
}

export async function fetchPartMatchSchedule(token: string): Promise<PartMatchSchedule> {
  const res = await fetch(`${AUTO}/schedule`, { headers: await headers(token) });
  if (!res.ok) throw new Error(await parseErr(res));
  const data = await res.json();
  if (typeof data === "string") return { nextRun: data };
  return data as PartMatchSchedule;
}

export async function fetchAutoMatchConflicts(
  token: string,
  query: { type?: string; status?: string; q?: string },
): Promise<AutoMatchConflictsResponse> {
  const params = new URLSearchParams();
  if (query.type) params.set("type", query.type);
  if (query.status) params.set("status", query.status);
  if (query.q) params.set("q", query.q);
  const res = await fetch(`${AUTO}/conflicts?${params.toString()}`, { headers: await headers(token) });
  if (!res.ok) throw new Error(await parseErr(res));
  return (await res.json()) as AutoMatchConflictsResponse;
}

export async function fetchConflictHeatmap(token: string): Promise<{
  byType: Record<string, number>;
  byVehicle: Record<string, number>;
  openCount: number;
}> {
  const res = await fetch(`${AUTO}/conflicts/heatmap`, { headers: await headers(token) });
  if (!res.ok) throw new Error(await parseErr(res));
  return (await res.json()) as { byType: Record<string, number>; byVehicle: Record<string, number>; openCount: number };
}

export async function resolveAutoMatchConflict(
  token: string,
  id: string,
  action: "keep" | "remove",
  note: string,
): Promise<void> {
  const res = await fetch(`${AUTO}/conflicts/${encodeURIComponent(id)}/resolve`, {
    method: "POST",
    headers: await headers(token),
    body: JSON.stringify({ action, note }),
  });
  if (!res.ok) throw new Error(await parseErr(res));
}

export async function resolveAutoMatchConflictsBatch(
  token: string,
  items: Array<{ id: string; action: "keep" | "remove"; note: string }>,
): Promise<void> {
  const res = await fetch(`${AUTO}/conflicts/resolve-batch`, {
    method: "POST",
    headers: await headers(token),
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(await parseErr(res));
}

export async function keepDerivedBatch(token: string, derivedIds: string[], note: string): Promise<void> {
  const res = await fetch(`${AUTO}/keep-batch`, {
    method: "POST",
    headers: await headers(token),
    body: JSON.stringify({ derivedIds, note }),
  });
  if (!res.ok) throw new Error(await parseErr(res));
}

export async function runFindPartsRematch(token: string, vehicleId?: string): Promise<void> {
  const q = vehicleId ? `?vehicleId=${encodeURIComponent(vehicleId)}` : "";
  const res = await fetch(`${ADMIN}/catalog/find-parts/rematch${q}`, {
    method: "POST",
    headers: await headers(token),
  });
  if (!res.ok) throw new Error(await parseErr(res));
}

export async function exportFindPartsMatrix(
  token: string,
  query: { vehicleId: string; componentId?: string; year?: number; format?: "csv" | "json" },
): Promise<Blob | { rows: unknown[] }> {
  const params = new URLSearchParams({ vehicleId: query.vehicleId });
  if (query.componentId) params.set("componentId", query.componentId);
  if (query.year != null) params.set("year", String(query.year));
  if (query.format) params.set("format", query.format);
  const res = await fetch(`${ADMIN}/catalog/find-parts/export?${params.toString()}`, {
    headers: await headers(token),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  const type = res.headers.get("content-type") || "";
  if (type.includes("text/csv")) return res.blob();
  return (await res.json()) as { rows: unknown[] };
}

export async function runCatalogAudit(token: string): Promise<void> {
  const res = await fetch(`${AUTO}/run-audit`, { method: "POST", headers: await headers(token) });
  if (!res.ok) throw new Error(await parseErr(res));
}

export async function fetchPartMatchRuns(token: string, limit = 50): Promise<{ rows: Array<Record<string, unknown>> }> {
  const res = await fetch(`${AUTO}/runs?limit=${limit}`, { headers: await headers(token) });
  if (!res.ok) throw new Error(await parseErr(res));
  return (await res.json()) as { rows: Array<Record<string, unknown>> };
}

export async function fetchCatalogCompleteness(token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${AUTO}/catalog/completeness`, { headers: await headers(token) });
  if (!res.ok) throw new Error(await parseErr(res));
  return (await res.json()) as Record<string, unknown>;
}

export async function fetchPositionReports(token: string, pendingOnly = true): Promise<{ rows: Array<Record<string, unknown>> }> {
  const q = pendingOnly ? "" : "?pending=0";
  const res = await fetch(`${AUTO}/position-reports${q}`, { headers: await headers(token) });
  if (!res.ok) throw new Error(await parseErr(res));
  return (await res.json()) as { rows: Array<Record<string, unknown>> };
}

export async function exportPositionIssueReport(token: string): Promise<Blob> {
  const res = await fetch(`${AUTO}/position-reports/export`, { headers: await headers(token) });
  if (!res.ok) throw new Error(await parseErr(res));
  return res.blob();
}

export async function remapPositionReport(
  token: string,
  id: string,
  body: { position: string; side?: string | null },
): Promise<void> {
  const res = await fetch(`${AUTO}/position-reports/${encodeURIComponent(id)}/remap`, {
    method: "POST",
    headers: await headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseErr(res));
}

export async function markPositionReportFixed(token: string, id: string): Promise<void> {
  const res = await fetch(`${AUTO}/position-reports/${encodeURIComponent(id)}/mark-fixed`, {
    method: "POST",
    headers: await headers(token),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await parseErr(res));
}

export async function fetchVehicleOeNumbers(token: string, vehicleId: string): Promise<{
  rows: Array<Record<string, unknown>>;
  lastRun: Record<string, unknown> | null;
  platformCode?: string | null;
}> {
  const res = await fetch(
    `${ADMIN}/vehicles/${encodeURIComponent(vehicleId)}/oe-numbers`,
    { headers: await headers(token) },
  );
  if (!res.ok) throw new Error(await parseErr(res));
  const data = (await res.json()) as { rows?: unknown; lastRun?: unknown; platformCode?: string };
  return {
    rows: Array.isArray(data.rows) ? (data.rows as Array<Record<string, unknown>>) : [],
    lastRun: (data.lastRun as Record<string, unknown>) ?? null,
    platformCode: data.platformCode ?? null,
  };
}

export async function normalizeOeNumberPreview(
  token: string,
  body: { brand?: string; oe_number: string; position?: string; side?: string },
): Promise<Record<string, unknown>> {
  const res = await fetch(`${ADMIN}/oe-numbers/normalize`, {
    method: "POST",
    headers: await headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return (await res.json()) as Record<string, unknown>;
}

export async function createVehicleOeNumber(
  token: string,
  vehicleId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${ADMIN}/vehicles/${encodeURIComponent(vehicleId)}/oe-numbers`, {
    method: "POST",
    headers: await headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseErr(res));
}

export async function updateVehicleOeNumber(
  token: string,
  vehicleId: string,
  oeId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(
    `${ADMIN}/vehicles/${encodeURIComponent(vehicleId)}/oe-numbers/${encodeURIComponent(oeId)}`,
    { method: "PATCH", headers: await headers(token), body: JSON.stringify(body) },
  );
  if (!res.ok) throw new Error(await parseErr(res));
}

export async function deleteVehicleOeNumber(token: string, vehicleId: string, oeId: string): Promise<void> {
  const res = await fetch(
    `${ADMIN}/vehicles/${encodeURIComponent(vehicleId)}/oe-numbers/${encodeURIComponent(oeId)}`,
    { method: "DELETE", headers: await headers(token) },
  );
  if (!res.ok) throw new Error(await parseErr(res));
}

export async function fetchVehicleDerivedFits(token: string, vehicleId: string): Promise<{ rows: Array<Record<string, unknown>> }> {
  const res = await fetch(`${ADMIN}/vehicles/${encodeURIComponent(vehicleId)}/derived-fits`, {
    headers: await headers(token),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return (await res.json()) as { rows: Array<Record<string, unknown>> };
}

export async function fetchVehicleOeRevisions(token: string, vehicleId: string): Promise<{ rows: Array<Record<string, unknown>> }> {
  const res = await fetch(`${ADMIN}/vehicles/${encodeURIComponent(vehicleId)}/revisions`, {
    headers: await headers(token),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return (await res.json()) as { rows: Array<Record<string, unknown>> };
}

export async function fetchAdminPlatforms(token: string): Promise<{ items?: unknown[]; platforms?: unknown[] }> {
  const res = await fetch(`${AUTO}/platforms`, { headers: await headers(token) });
  if (!res.ok) throw new Error(await parseErr(res));
  return (await res.json()) as { items?: unknown[]; platforms?: unknown[] };
}

export async function fetchAdminPlatform(token: string, platformId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${AUTO}/platforms/${encodeURIComponent(platformId)}`, { headers: await headers(token) });
  if (!res.ok) throw new Error(await parseErr(res));
  return (await res.json()) as Record<string, unknown>;
}

export async function fetchPartReferenceTable(
  token: string,
  partId: string,
  segment: "oe-references" | "index-numbers" | "approvals",
): Promise<{ rows: Array<Record<string, unknown>> }> {
  const res = await fetch(`${ADMIN}/parts/${encodeURIComponent(partId)}/${segment}`, {
    headers: await headers(token),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  const data = (await res.json()) as { rows?: unknown[] };
  return {
    rows: Array.isArray(data.rows)
      ? (data.rows as Array<Record<string, unknown>>)
      : (Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []),
  };
}

export async function createPlatformComponentLink(
  token: string,
  platformId: string,
  body: Record<string, unknown>,
): Promise<{ row: Record<string, unknown> }> {
  const res = await fetch(`${AUTO}/platforms/${encodeURIComponent(platformId)}/links`, {
    method: "POST",
    headers: await headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return (await res.json()) as { row: Record<string, unknown> };
}

export async function updatePlatformComponentLink(
  token: string,
  platformId: string,
  linkId: string,
  body: Record<string, unknown>,
): Promise<{ row: Record<string, unknown> }> {
  const res = await fetch(
    `${AUTO}/platforms/${encodeURIComponent(platformId)}/links/${encodeURIComponent(linkId)}`,
    { method: "PATCH", headers: await headers(token), body: JSON.stringify(body) },
  );
  if (!res.ok) throw new Error(await parseErr(res));
  return (await res.json()) as { row: Record<string, unknown> };
}

export async function deletePlatformComponentLink(
  token: string,
  platformId: string,
  linkId: string,
): Promise<void> {
  const res = await fetch(
    `${AUTO}/platforms/${encodeURIComponent(platformId)}/links/${encodeURIComponent(linkId)}`,
    { method: "DELETE", headers: await headers(token) },
  );
  if (!res.ok) throw new Error(await parseErr(res));
}

export async function exportPlatformMatrix(
  token: string,
  platformId: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${AUTO}/platforms/${encodeURIComponent(platformId)}/export`, {
    headers: await headers(token),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return (await res.json()) as Record<string, unknown>;
}

export async function createPartReferenceRow(
  token: string,
  partId: string,
  segment: "oe-references" | "index-numbers" | "approvals",
  body: Record<string, unknown>,
): Promise<{ row: Record<string, unknown> }> {
  const res = await fetch(`${ADMIN}/parts/${encodeURIComponent(partId)}/${segment}`, {
    method: "POST",
    headers: await headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return (await res.json()) as { row: Record<string, unknown> };
}

export async function updatePartReferenceRow(
  token: string,
  partId: string,
  segment: "oe-references" | "index-numbers" | "approvals",
  refId: string,
  body: Record<string, unknown>,
): Promise<{ row: Record<string, unknown> }> {
  const res = await fetch(
    `${ADMIN}/parts/${encodeURIComponent(partId)}/${segment}/${encodeURIComponent(refId)}`,
    { method: "PATCH", headers: await headers(token), body: JSON.stringify(body) },
  );
  if (!res.ok) throw new Error(await parseErr(res));
  return (await res.json()) as { row: Record<string, unknown> };
}

export async function deletePartReferenceRow(
  token: string,
  partId: string,
  segment: "oe-references" | "index-numbers" | "approvals",
  refId: string,
): Promise<void> {
  const res = await fetch(
    `${ADMIN}/parts/${encodeURIComponent(partId)}/${segment}/${encodeURIComponent(refId)}`,
    { method: "DELETE", headers: await headers(token) },
  );
  if (!res.ok) throw new Error(await parseErr(res));
}

export async function patchPartsAutoMatchEnabled(token: string, enabled: boolean): Promise<void> {
  const res = await fetch(
    `${ADMIN}/platform-feature-flags/parts_auto_match_enabled`,
    {
      method: "PATCH",
      headers: await headers(token),
      body: JSON.stringify({ enabled }),
    },
  );
  if (!res.ok) throw new Error(await parseErr(res));
}
