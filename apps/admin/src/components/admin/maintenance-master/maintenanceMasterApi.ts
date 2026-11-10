import { API_ENDPOINTS } from "../../../services/apiConfig";
import { publicAnonKey } from "../../../utils/supabase/info";

const OPS = API_ENDPOINTS.fleetOps;

function headers(token: string, json = true): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    apikey: publicAnonKey,
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function parseErr(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  return body.message || body.error || `HTTP ${res.status}`;
}

export type MaintenanceRule = Record<string, unknown> & {
  id: string;
  task_name: string;
  task_code?: string | null;
  template_scope: string;
  component_id: string;
  interval_km?: number | null;
  interval_months?: number | null;
  status: string;
  source_type?: string;
  confidence?: string;
  vehicle_catalog_id?: string | null;
  platform_id?: string | null;
  engine_family_id?: string | null;
  description?: string | null;
  fleet_tip?: string | null;
  overdue_effect?: string | null;
};

export type PartScheduleIndexRow = {
  component_id: string;
  global_rule_id: string | null;
  interval_km: number | null;
  interval_months: number | null;
  source_type: string | null;
  confidence: string | null;
  status: string | null;
  specific_count: number;
  specific_scopes: Record<string, unknown>[];
  package_names: string[];
  last_changed_at: string | null;
  rule_count: number;
};

export type MaintenanceHealthResponse = {
  lastCheckedAt: string;
  rows: { key: string; label: string; count: number; detail?: string; page?: string }[];
  fleetCarsUsingSchedules: number;
  sourceCounts: { maker_manual: number; part_maker: number; roam_policy: number };
};

export type CategoryUsage = {
  schedules: number;
  packages: number;
  inspections: number;
  partsInCatalogue: number;
  fleetCarsUsingPart: number;
  fleetCarsTotal: number;
};

export type PreviewScheduleResponse = {
  catalog: Record<string, unknown>;
  severe_duty: boolean;
  items: Record<string, unknown>[];
  not_on_car: Record<string, unknown>[];
};

export type MaintenanceSummary = {
  partScheduleCount: number;
  globalActive: number;
  specificCount: number;
  sourceCounts: { maker_manual: number; part_maker: number; roam_policy: number };
  reviewCount: number;
  openConflicts: number;
  fleetCarsUsingSchedules: number;
};

export async function fetchMaintenanceGovernanceFlag(token: string): Promise<boolean> {
  const res = await fetch(`${OPS}/admin/platform-feature-flags/maintenance_master_governance`, {
    headers: headers(token, false),
  });
  if (!res.ok) return false;
  const body = (await res.json()) as { enabled?: boolean };
  return body.enabled === true;
}

export async function fetchMaintenanceSummary(token: string): Promise<MaintenanceSummary> {
  const res = await fetch(`${OPS}/admin/maintenance/summary`, { headers: headers(token, false) });
  if (!res.ok) throw new Error(await parseErr(res));
  return res.json() as Promise<MaintenanceSummary>;
}

export async function fetchMaintenanceRules(token: string): Promise<MaintenanceRule[]> {
  const res = await fetch(`${OPS}/admin/maintenance/rules`, { headers: headers(token, false) });
  if (!res.ok) throw new Error(await parseErr(res));
  const body = (await res.json()) as { items?: MaintenanceRule[] };
  return body.items || [];
}

export async function fetchMaintenanceCategories(token: string, kind?: string) {
  const q = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  const res = await fetch(`${OPS}/admin/maintenance-categories${q}`, {
    headers: headers(token, false),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  const body = (await res.json()) as { items?: Record<string, unknown>[] };
  return body.items || [];
}

export async function fetchAllMaintenanceCategories(token: string) {
  return fetchMaintenanceCategories(token);
}

export async function fetchGlobalPackages(token: string) {
  const res = await fetch(`${OPS}/admin/maintenance-templates/global`, { headers: headers(token, false) });
  if (!res.ok) throw new Error(await parseErr(res));
  const body = (await res.json()) as { items?: Record<string, unknown>[] };
  return (body.items || []).filter((t) => !t.component_id);
}

export async function fetchPackageCategories(token: string, templateId: string) {
  const res = await fetch(`${OPS}/admin/maintenance-templates/${templateId}/categories`, {
    headers: headers(token, false),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  const body = (await res.json()) as { items?: Record<string, unknown>[] };
  return body.items || [];
}

export async function fetchReviewList(token: string) {
  const res = await fetch(`${OPS}/admin/maintenance/review-list`, { headers: headers(token, false) });
  if (!res.ok) throw new Error(await parseErr(res));
  return res.json() as Promise<{ conflicts: Record<string, unknown>[]; proposals: Record<string, unknown>[] }>;
}

export async function fetchMaintenanceHistory(token: string) {
  const res = await fetch(`${OPS}/admin/maintenance/history`, { headers: headers(token, false) });
  if (!res.ok) throw new Error(await parseErr(res));
  const body = (await res.json()) as { items?: Record<string, unknown>[] };
  return body.items || [];
}

export async function fetchRuleImpact(token: string, ruleId: string) {
  const res = await fetch(`${OPS}/admin/maintenance/rules/${ruleId}/impact`, { headers: headers(token, false) });
  if (!res.ok) throw new Error(await parseErr(res));
  return res.json() as Promise<{ impact: Record<string, unknown>; rule?: MaintenanceRule }>;
}

export async function fetchPartSchedulesIndex(token: string): Promise<PartScheduleIndexRow[]> {
  const res = await fetch(`${OPS}/admin/maintenance/part-schedules-index`, { headers: headers(token, false) });
  if (!res.ok) throw new Error(await parseErr(res));
  const body = (await res.json()) as { items?: PartScheduleIndexRow[] };
  return body.items || [];
}

export async function fetchMaintenanceHealth(token: string): Promise<MaintenanceHealthResponse> {
  const res = await fetch(`${OPS}/admin/maintenance/health`, { headers: headers(token, false) });
  if (!res.ok) throw new Error(await parseErr(res));
  return res.json() as Promise<MaintenanceHealthResponse>;
}

export async function fetchCategoryUsage(token: string, categoryId: string): Promise<CategoryUsage> {
  const res = await fetch(`${OPS}/admin/maintenance-categories/${categoryId}/usage`, {
    headers: headers(token, false),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return res.json() as Promise<CategoryUsage>;
}

export async function fetchScopeCoverage(
  token: string,
  params: Record<string, string | number | null | undefined>,
): Promise<number> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, String(v));
  }
  const res = await fetch(`${OPS}/admin/maintenance/scope-coverage?${sp}`, { headers: headers(token, false) });
  if (!res.ok) throw new Error(await parseErr(res));
  const body = (await res.json()) as { count?: number };
  return body.count ?? 0;
}

export async function fetchPreviewSchedule(token: string, catalogId: string, severe = false) {
  const sp = new URLSearchParams({ car: catalogId });
  if (severe) sp.set("severe", "1");
  const res = await fetch(`${OPS}/admin/maintenance/preview?${sp}`, {
    headers: headers(token, false),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return res.json() as Promise<PreviewScheduleResponse>;
}

export async function createMaintenanceRule(token: string, payload: Record<string, unknown>) {
  const res = await fetch(`${OPS}/admin/maintenance/rules`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  return body as { item: MaintenanceRule; proposal?: unknown };
}

export async function patchMaintenanceRule(token: string, id: string, payload: Record<string, unknown>) {
  const res = await fetch(`${OPS}/admin/maintenance/rules/${id}`, {
    method: "PATCH",
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as { error?: string }).error || `HTTP ${res.status}`;
    throw new Error(msg === "Couldn't save. Nothing was changed." ? msg : msg);
  }
  return body as { item: MaintenanceRule; impact?: Record<string, unknown>; proposal?: unknown };
}

export async function retireMaintenanceRule(token: string, id: string) {
  const res = await fetch(`${OPS}/admin/maintenance/rules/${id}/retire`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return res.json();
}

export async function resolveConflict(token: string, conflictId: string, pickRuleId: string) {
  const res = await fetch(`${OPS}/admin/maintenance/conflicts/${conflictId}/resolve`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ pick: pickRuleId }),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return res.json();
}

export async function retireBothConflictRules(token: string, conflictId: string) {
  const res = await fetch(`${OPS}/admin/maintenance/conflicts/${conflictId}/retire-both`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return res.json();
}

export async function loadRoamPolicyStarter(token: string) {
  const res = await fetch(`${OPS}/admin/maintenance/rules/load-roam-policy-starter`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return res.json() as Promise<{ created: string[]; skipped: string[]; unmatched: string[] }>;
}

export async function retirePartType(token: string, categoryId: string) {
  const res = await fetch(`${OPS}/admin/maintenance-categories/${categoryId}/retire`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return res.json();
}

export function historyExportUrl(token: string): string {
  return `${OPS}/admin/maintenance/history/export.csv`;
}

export function previewExportUrl(catalogId: string): string {
  return `${OPS}/admin/maintenance/preview/export.csv?car=${encodeURIComponent(catalogId)}`;
}

export async function downloadCsv(url: string, token: string, filename: string) {
  const res = await fetch(url, { headers: headers(token, false) });
  if (!res.ok) throw new Error(await parseErr(res));
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** History across jobs, sections, also-do links and schedules (V8). kind: all | jobs | sections | links | schedules. */
export async function fetchMaintenanceHistoryKind(token: string, kind: string) {
  const res = await fetch(`${OPS}/admin/maintenance/history?kind=${encodeURIComponent(kind)}`, {
    headers: headers(token, false),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  const body = (await res.json()) as { items?: Record<string, unknown>[] };
  return body.items || [];
}

export async function approveProposal(token: string, id: string) {
  const res = await fetch(`${OPS}/admin/maintenance/proposals/${id}/approve`, { method: "POST", headers: headers(token) });
  if (!res.ok) throw new Error(await parseErr(res));
}

export async function rejectProposal(token: string, id: string, note: string) {
  const res = await fetch(`${OPS}/admin/maintenance/proposals/${id}/reject`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ note }),
  });
  if (!res.ok) throw new Error(await parseErr(res));
}
