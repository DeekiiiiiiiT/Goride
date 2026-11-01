import { API_ENDPOINTS } from "./apiConfig";
import { publicAnonKey } from "../utils/supabase/info";

const PARTS_QUEUE_BASE = `${API_ENDPOINTS.catalog}/make-server-37f42386/admin/pending-catalog/parts-queue`;
const RESEARCH_BASE = `${API_ENDPOINTS.catalog}/make-server-37f42386/admin/catalog-research`;

function edgeHeaders(accessToken: string, contentType?: string): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    apikey: publicAnonKey,
  };
  if (contentType) h["Content-Type"] = contentType;
  return h;
}

export type PendingPartsQueueGroup = {
  groupId: string;
  vehicleCatalogId?: string | null;
  platformId: string | null;
  componentId: string | null;
  side: string | null;
  fitDescriptor?: string | null;
  matchType?: string | null;
  fleetCount: number;
  firstAsked: string | null;
  lastAsked: string | null;
  photoCount: number;
  status: string;
  requestIds: string[];
};

export type PendingPartsGroupNote = {
  id: string;
  logRef: string;
  text: string;
  at?: string;
};

export type PendingPartsGroupPhoto = {
  url: string;
  requestId: string;
};

export type PendingPartsOnFileRow = {
  brand: string;
  partNumber: string;
  matchType: string;
};

export type PendingPartsGroupDetail = {
  groupId: string;
  fleetCount: number;
  researchJobId?: string | null;
  notes: PendingPartsGroupNote[];
  photos: PendingPartsGroupPhoto[];
  onFile?: PendingPartsOnFileRow[];
};

export type CatalogResearchJobDetail = {
  job: Record<string, unknown> | null;
  proposals: Array<Record<string, unknown>>;
  vehicleProposals: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
};

export type PendingPartsPatchAction =
  | { action: "looking"; note?: string }
  | { action: "cant_find"; reason?: string };

export type VehicleCatalogBrief = {
  id: string;
  make: string;
  model: string;
  trim_series?: string | null;
  catalog_trim?: string | null;
  chassis_code?: string | null;
  engine_code?: string | null;
  production_start_year?: number | null;
  production_end_year?: number | null;
  drivetrain?: string | null;
  transmission?: string | null;
};

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return typeof body.error === "string" ? body.error : `HTTP ${res.status}`;
}

export async function listPendingPartsQueue(
  accessToken: string,
): Promise<{ items: PendingPartsQueueGroup[]; total: number; weeklyTarget: number }> {
  const res = await fetch(PARTS_QUEUE_BASE, { headers: edgeHeaders(accessToken) });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return {
    items: (data.items || []) as PendingPartsQueueGroup[],
    total: typeof data.total === "number" ? data.total : (data.items || []).length,
    weeklyTarget: typeof data.weeklyTarget === "number" ? data.weeklyTarget : 12,
  };
}

export async function getPendingPartsGroupDetail(
  accessToken: string,
  groupId: string,
): Promise<PendingPartsGroupDetail> {
  const res = await fetch(`${PARTS_QUEUE_BASE}/${encodeURIComponent(groupId)}`, {
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<PendingPartsGroupDetail>;
}

export async function patchPendingPartsGroup(
  accessToken: string,
  groupId: string,
  body: PendingPartsPatchAction,
): Promise<void> {
  const res = await fetch(`${PARTS_QUEUE_BASE}/${encodeURIComponent(groupId)}`, {
    method: "PATCH",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function fetchVehicleCatalogBriefs(
  accessToken: string,
  ids: string[],
): Promise<Map<string, VehicleCatalogBrief>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, VehicleCatalogBrief>();
  await Promise.all(
    unique.map(async (id) => {
      try {
        const res = await fetch(`${API_ENDPOINTS.catalog}/vehicle-catalog?id=${encodeURIComponent(id)}`, {
          headers: edgeHeaders(accessToken),
        });
        if (!res.ok) return;
        const data = await res.json();
        const row = (data.vehicles || [])[0] as VehicleCatalogBrief | undefined;
        if (row?.id) out.set(id, row);
      } catch {
        /* ignore per-id failures */
      }
    }),
  );
  return out;
}

export type PartsBrowseNameMap = Map<string, { plainName: string; areaName?: string; positionAware?: boolean }>;

export async function fetchPartsBrowseNameMap(accessToken: string): Promise<PartsBrowseNameMap> {
  const res = await fetch(`${API_ENDPOINTS.admin}/admin/catalog/parts/browse`, {
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) return new Map();
  const data = await res.json();
  const out: PartsBrowseNameMap = new Map();
  for (const system of data.systems || []) {
    const areaName = system.plainName || system.name;
    for (const component of system.components || []) {
      out.set(String(component.id), {
        plainName: component.plainName || component.name || "Part",
        areaName,
        positionAware: Boolean(component.positionAware),
      });
    }
  }
  for (const row of data.common || []) {
    out.set(String(row.id), {
      plainName: row.plainName || row.name || "Part",
      positionAware: Boolean(row.positionAware),
    });
  }
  return out;
}

export function uiStatusBucket(status: string): "new" | "looking" | "added" | "cant_find" {
  if (status === "in_progress") return "looking";
  if (status === "resolved") return "added";
  if (status === "rejected") return "cant_find";
  return "new";
}

export function formatStatusLabel(bucket: ReturnType<typeof uiStatusBucket>): string {
  if (bucket === "looking") return "Looking";
  if (bucket === "added") return "Added";
  if (bucket === "cant_find") return "Can't find";
  return "New";
}

export function formatVehicleHeadline(v: VehicleCatalogBrief | undefined): string {
  if (!v) return "Unknown vehicle version";
  const start = v.production_start_year ?? "";
  const end = v.production_end_year;
  const years =
    start && end ? `${start}–${end}` : start ? `${start}–` : end ? `–${end}` : "";
  const trim = [v.trim_series, v.catalog_trim].filter(Boolean).join(" · ");
  const tail = [trim, v.engine_code, v.drivetrain].filter(Boolean).join(" · ");
  return [v.make, v.model, years].filter(Boolean).join(" ").trim() + (tail ? ` · ${tail}` : "");
}

export function formatVehicleSubline(v: VehicleCatalogBrief | undefined): string {
  if (!v) return "";
  return [v.chassis_code, v.transmission].filter(Boolean).join(" · ");
}

export function partPlainName(componentId: string | null, names: PartsBrowseNameMap): string {
  if (!componentId) return "Part";
  return names.get(componentId)?.plainName || "Requested part";
}

export function componentPositionAware(componentId: string | null, names: PartsBrowseNameMap): boolean {
  if (!componentId) return false;
  return Boolean(names.get(componentId)?.positionAware);
}

export function formatPartLabel(
  componentId: string | null,
  side: string | null,
  names: PartsBrowseNameMap,
  matchType?: string | null,
): { title: string; subtitle: string } {
  const meta = componentId ? names.get(componentId) : undefined;
  const baseName = meta?.plainName || (componentId ? "Requested part" : "Part request");
  let title = baseName;
  if (side) {
    const sideLabel = side.charAt(0).toUpperCase() + side.slice(1);
    title = `${baseName} · ${sideLabel}`;
  }
  const subtitle = matchType ? `${baseName} · ${matchType} option` : (meta?.areaName || "Fleet part request");
  return { title, subtitle };
}

export type CatalogResearchStrip = {
  queued: number;
  needsReview: number;
  failed: number;
  workingOn?: number;
  todayResearchCount?: number;
  enabled: boolean;
  paused: boolean;
  pausedReason?: string | null;
  autoResumeAt?: string | null;
  dailyJobLimit: number;
  status?: string;
  shadowStreak?: number;
  shadowMode?: boolean;
};

export type CatalogResearchSettingsResponse = {
  settings: {
    enabled: boolean;
    shadow_mode: boolean;
    paused: boolean;
    shadow_approve_streak?: number;
    daily_job_limit?: number;
  };
  engineRev: string;
  latencyMs: number | null;
  status: string;
  health: Record<string, unknown>;
};

export async function fetchCatalogResearchStrip(accessToken: string): Promise<CatalogResearchStrip> {
  const res = await fetch(`${RESEARCH_BASE}/strip`, { headers: edgeHeaders(accessToken) });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<CatalogResearchStrip>;
}

export async function fetchCatalogResearchSettings(accessToken: string): Promise<CatalogResearchSettingsResponse> {
  const res = await fetch(`${RESEARCH_BASE}/settings`, { headers: edgeHeaders(accessToken) });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<CatalogResearchSettingsResponse>;
}

export async function patchCatalogResearchSettings(
  accessToken: string,
  body: { enabled?: boolean; shadow_mode?: boolean; paused?: boolean; daily_job_limit?: number },
): Promise<void> {
  const res = await fetch(`${RESEARCH_BASE}/settings`, {
    method: "PATCH",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function reprocessQueuedJobs(accessToken: string): Promise<{ requeued: number }> {
  const res = await fetch(`${RESEARCH_BASE}/reprocess-queued`, {
    method: "POST",
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<{ requeued: number }>;
}

export async function fetchCatalogResearchJob(
  accessToken: string,
  jobId: string,
): Promise<CatalogResearchJobDetail> {
  const res = await fetch(`${RESEARCH_BASE}/jobs/${encodeURIComponent(jobId)}`, {
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as CatalogResearchJobDetail & { job?: Record<string, unknown> };
  return {
    job: data.job ?? null,
    proposals: data.proposals || [],
    vehicleProposals: data.vehicleProposals || [],
    events: data.events || [],
  };
}

export async function postCatalogResearchJobAction(
  accessToken: string,
  jobId: string,
  action: string,
  body?: Record<string, unknown>,
): Promise<void> {
  const path =
    action === "research-next"
      ? `${RESEARCH_BASE}/jobs/${encodeURIComponent(jobId)}/research-next`
      : `${RESEARCH_BASE}/jobs/${encodeURIComponent(jobId)}/${action}`;
  const res = await fetch(path, {
    method: "POST",
    headers: edgeHeaders(accessToken, "application/json"),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await readError(res));
}

/** Matches `ENGINE_REV` in supabase/functions/_fleet-server/catalog_research_worker.ts */
export const CATALOG_RESEARCH_ENGINE_REV = "catalog-research-1";

export type CatalogResearchJobListItem = {
  jobId: string;
  state: string;
  groupKey: string;
  fleetCount: number;
  resultPartNumber: string;
  sourceCount: number;
  updatedAt: string;
};

export type CatalogResearchIncident = {
  id: string;
  state: string;
  last_error: string | null;
  attempts: number;
  updated_at: string;
};

export type CatalogTrustedSource = {
  domain: string;
  kind: "oem_catalog" | "aftermarket_catalog" | string;
  active: boolean;
};

export async function fetchCatalogResearchJobs(
  accessToken: string,
  state?: string,
): Promise<CatalogResearchJobListItem[]> {
  const q = state ? `?state=${encodeURIComponent(state)}` : "";
  const res = await fetch(`${RESEARCH_BASE}/jobs${q}`, { headers: edgeHeaders(accessToken) });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return (data.items || []) as CatalogResearchJobListItem[];
}

export async function fetchCatalogResearchIncidents(
  accessToken: string,
): Promise<CatalogResearchIncident[]> {
  const res = await fetch(`${RESEARCH_BASE}/incidents`, { headers: edgeHeaders(accessToken) });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return (data.items || []) as CatalogResearchIncident[];
}

export async function retryCatalogResearchJob(accessToken: string, jobId: string): Promise<void> {
  const res = await fetch(`${RESEARCH_BASE}/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: "POST",
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function downloadCatalogResearchExportCsv(accessToken: string): Promise<void> {
  const res = await fetch(`${RESEARCH_BASE}/export.csv`, { headers: edgeHeaders(accessToken) });
  if (!res.ok) throw new Error(await readError(res));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "catalog_research_jobs.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export async function fetchCatalogTrustedSources(
  accessToken: string,
): Promise<CatalogTrustedSource[]> {
  const res = await fetch(`${RESEARCH_BASE}/trusted-sources`, { headers: edgeHeaders(accessToken) });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return (data.items || []) as CatalogTrustedSource[];
}

export async function patchCatalogTrustedSource(
  accessToken: string,
  domain: string,
  active: boolean,
): Promise<void> {
  const res = await fetch(`${RESEARCH_BASE}/trusted-sources/${encodeURIComponent(domain)}`, {
    method: "PATCH",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function addCatalogTrustedSource(
  accessToken: string,
  domain: string,
  kind: "oem_catalog" | "aftermarket_catalog",
): Promise<void> {
  const res = await fetch(`${RESEARCH_BASE}/trusted-sources`, {
    method: "POST",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify({ domain, kind }),
  });
  if (!res.ok) throw new Error(await readError(res));
}
