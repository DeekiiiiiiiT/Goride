/**
 * Dominion · Maintenance · Jobs — client for the Layer 2 "Dominion write" routes
 * (docs/engine-service-sections-plan.md V2–V8). The server must return exactly these shapes.
 */
import { API_ENDPOINTS } from "../../../../services/apiConfig";
import { publicAnonKey } from "../../../../utils/supabase/info";

const OPS = API_ENDPOINTS.fleetOps;

export const JOB_ACTIONS = [
  "inspect",
  "clean",
  "adjust",
  "replace",
  "rotate",
  "balance",
  "flush",
  "top_up",
  "repair",
  "machine",
  "rebuild",
  "other",
] as const;
export type JobAction = (typeof JOB_ACTIONS)[number];

export const JOB_ACTION_LABEL: Record<JobAction, string> = {
  inspect: "Inspect",
  clean: "Clean",
  adjust: "Adjust",
  replace: "Replace",
  rotate: "Rotate",
  balance: "Balance",
  flush: "Flush",
  top_up: "Top up",
  repair: "Repair",
  machine: "Machine",
  rebuild: "Rebuild",
  other: "Other",
};

/** Icon keys a job or section can use (same keys Fleet's MaintenanceIcon understands). */
export const JOB_ICON_KEYS = [
  "wrench",
  "gears",
  "oil",
  "filter",
  "wind",
  "droplet",
  "spark",
  "belt",
  "thermometer",
  "gauge",
  "tires",
  "rotate",
  "brakes",
  "suspension",
  "lightbulb",
  "wipers",
] as const;

export type JobGroup = {
  id: string;
  code: string;
  name: string;
  iconKey: string | null;
  /** Powertrain job fit: NULL = any car. */
  fitsPowertrains?: string[] | null;
  fitsFuels?: string[] | null;
};

export type AlsoDoLink = { relationId: string; jobId: string; jobName: string; note: string };
export type SuggestedBy = { relationId: string; jobId: string; jobName: string };

export type Job = {
  id: string;
  code: string;
  opCode: string | null;
  name: string;
  description: string | null;
  iconKey: string | null;
  isPart: boolean;
  defaultAction: JobAction;
  homeGroupId: string;
  status: "active" | "retired";
  /** True once anything real points at it (D7). Locks home group + form type. */
  used: boolean;
  alsoDo: AlsoDoLink[];
  suggestedBy: SuggestedBy[];
  /** May-need links (S1): active links only, in saved order. */
  items: MayNeedItem[];
  /** Powertrain job fit: NULL = same as group. "All" is stored as the full code list. */
  fitsPowertrains?: string[] | null;
  fitsFuels?: string[] | null;
  isHighVoltage?: boolean;
  groupFitsPowertrains?: string[] | null;
  groupFitsFuels?: string[] | null;
};

export type ItemNeed = "usually" | "sometimes";

/** One May-need link on a job (GET /admin/maintenance/jobs → jobs[].items). */
export type MayNeedItem = {
  linkId: string;
  kind: "part_type" | "supply";
  itemId: string;
  name: string;
  need: ItemNeed;
  qtyHint: number | null;
  note: string | null;
  sortOrder: number;
  itemRetired: boolean;
  unitLabelOne?: string;
  unitLabelMany?: string;
};

export type Supply = {
  id: string;
  code: string;
  name: string;
  description: string;
  iconKey: string;
  unitId: string;
  unitCode: string;
  status: "active" | "retired";
  usedOnJobs: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
};

export type Unit = { id: string; code: string; labelOne: string; labelMany: string };

export type JobSection = {
  id: string;
  sectionGroupId: string;
  groupId: string;
  code: string;
  name: string;
  description: string;
  iconKey: string;
  sortOrder: number;
  /** Ordered job ids (may include jobs whose home group is another group). */
  jobIds: string[];
};

export type JobSectionGroup = {
  id: string;
  groupId: string;
  code: string;
  name: string;
  sortOrder: number;
  sections: JobSection[];
};

export type JobsPayload = {
  groups: JobGroup[];
  sectionGroups: JobSectionGroup[];
  jobs: Job[];
  /** Every supply (active + retired), by name. */
  supplies: Supply[];
  /** Active units, in order. */
  units: Unit[];
};

function headers(token: string, json = true): HeadersInit {
  const h: Record<string, string> = { Authorization: `Bearer ${token}`, apikey: publicAnonKey };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function call<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${OPS}${path}`, {
    ...init,
    headers: headers(token, Boolean(init?.body)),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(body.message || body.error || `HTTP ${res.status}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

// V2
export const fetchJobs = (token: string) => call<JobsPayload>(token, "/admin/maintenance/jobs");

// V3
export type JobInput = {
  name: string;
  homeGroupId: string;
  isPart: boolean;
  defaultAction: JobAction;
  description: string;
  iconKey: string;
};
export const createJob = (token: string, input: JobInput) =>
  call<{ item: Job }>(token, "/admin/maintenance/jobs", { method: "POST", ...json(input) });
/** Fit fields: key missing = leave as is; null = same as group; array = that list. */
export type JobFitInput = { fitsPowertrains?: string[] | null; fitsFuels?: string[] | null; isHighVoltage?: boolean };
export const updateJob = (token: string, id: string, input: Partial<JobInput> & JobFitInput) =>
  call<{ item: Job }>(token, `/admin/maintenance/jobs/${id}`, { method: "PATCH", ...json(input) });

// V5
export const retireJob = (token: string, id: string) =>
  call<{ removedFromSections: number; removedLinks: number; hiddenFromMayNeed?: number }>(token, `/admin/maintenance/jobs/${id}/retire`, {
    method: "POST",
  });
export const restoreJob = (token: string, id: string) =>
  call<{ item: Job }>(token, `/admin/maintenance/jobs/${id}/restore`, { method: "POST" });

// V4 — section groups
export const createSectionGroup = (token: string, groupId: string, name: string) =>
  call(token, "/admin/maintenance/section-groups", { method: "POST", ...json({ groupId, name }) });
export const renameSectionGroup = (token: string, id: string, name: string) =>
  call(token, `/admin/maintenance/section-groups/${id}`, { method: "PATCH", ...json({ name }) });
export const deleteSectionGroup = (token: string, id: string) =>
  call(token, `/admin/maintenance/section-groups/${id}`, { method: "DELETE" });
/** Saves the full order of section groups in one group (server renumbers 10, 20, 30…). */
export const reorderSectionGroups = (token: string, groupId: string, orderedIds: string[]) =>
  call(token, "/admin/maintenance/section-groups/order", { method: "PUT", ...json({ groupId, orderedIds }) });

// V4 — sections
export type SectionInput = { name: string; description: string; iconKey: string };
export const createSection = (token: string, sectionGroupId: string, input: SectionInput) =>
  call(token, "/admin/maintenance/sections", { method: "POST", ...json({ sectionGroupId, ...input }) });
export const updateSection = (token: string, id: string, input: Partial<SectionInput>) =>
  call(token, `/admin/maintenance/sections/${id}`, { method: "PATCH", ...json(input) });
export const deleteSection = (token: string, id: string) =>
  call(token, `/admin/maintenance/sections/${id}`, { method: "DELETE" });
export const reorderSections = (token: string, sectionGroupId: string, orderedIds: string[]) =>
  call(token, "/admin/maintenance/sections/order", { method: "PUT", ...json({ sectionGroupId, orderedIds }) });
/** Sets the full ordered job list of a section (server renumbers and enforces once-per-group). */
export const setSectionJobs = (token: string, sectionId: string, jobIds: string[]) =>
  call(token, `/admin/maintenance/sections/${sectionId}/members`, { method: "PUT", ...json({ jobIds }) });

// V6
export const addAlsoDo = (token: string, fromJobId: string, toJobId: string, note: string) =>
  call(token, "/admin/maintenance/job-relations", { method: "POST", ...json({ fromJobId, toJobId, note }) });
export const removeAlsoDo = (token: string, relationId: string) =>
  call(token, `/admin/maintenance/job-relations/${relationId}`, { method: "DELETE" });

// Service items (S1) — May-need links
export type MayNeedInput = {
  jobId: string;
  kind: "part_type" | "supply";
  itemId: string;
  need: ItemNeed;
  qtyHint?: number | null;
  note?: string | null;
};
export const addMayNeed = (token: string, input: MayNeedInput) =>
  call<{ item: MayNeedItem }>(token, "/admin/maintenance/job-items", { method: "POST", ...json(input) });
export const updateMayNeed = (
  token: string,
  linkId: string,
  patch: { need?: ItemNeed; qtyHint?: number | null; note?: string | null },
) => call<{ item: MayNeedItem }>(token, `/admin/maintenance/job-items/${linkId}`, { method: "PATCH", ...json(patch) });
export const removeMayNeed = (token: string, linkId: string) =>
  call<{ success: true }>(token, `/admin/maintenance/job-items/${linkId}/remove`, { method: "POST" });
/** Saves the full order of a job's active May-need links (server renumbers 10, 20, 30…). */
export const reorderMayNeed = (token: string, jobId: string, orderedIds: string[]) =>
  call<{ success: true }>(token, `/admin/maintenance/jobs/${jobId}/items/order`, { method: "PUT", ...json({ orderedIds }) });

// Service items (S1) — supplies
export type SupplyInput = { name: string; description: string; unitId: string; iconKey: string };
export const fetchSupplies = (token: string, status: "active" | "retired") =>
  call<{ items: Supply[] }>(token, `/admin/maintenance/supplies?status=${status}`);
export const createSupply = (token: string, input: SupplyInput) =>
  call<{ item: Supply }>(token, "/admin/maintenance/supplies", { method: "POST", ...json(input) });
export const updateSupply = (token: string, id: string, input: Partial<SupplyInput>) =>
  call<{ item: Supply }>(token, `/admin/maintenance/supplies/${id}`, { method: "PATCH", ...json(input) });
export const retireSupply = (token: string, id: string) =>
  call<{ item: Supply; hiddenFromJobs: number }>(token, `/admin/maintenance/supplies/${id}/retire`, { method: "POST" });
export const restoreSupply = (token: string, id: string) =>
  call<{ item: Supply }>(token, `/admin/maintenance/supplies/${id}/restore`, { method: "POST" });

// Powertrain job fit (S1 routes)
export const updateGroupFits = (
  token: string,
  id: string,
  input: { fitsPowertrains?: string[] | null; fitsFuels?: string[] | null },
) =>
  call<{ item: { id: string; fitsPowertrains: string[] | null; fitsFuels: string[] | null } }>(
    token,
    `/admin/maintenance/groups/${id}/fits`,
    { method: "PATCH", ...json(input) },
  );

export type FitOverrides = { fits_powertrains?: string[] | null; fits_fuels?: string[] | null };
export type FitCount = { fits: number; unknown: number; total: number };

const overridesQuery = (o: FitOverrides | null) => (o ? `overrides=${encodeURIComponent(JSON.stringify(o))}` : "");

/** "Fits N of T car models": one DB count (job_fit_count) with the unsaved choices as overrides. */
export const fetchFitCount = (token: string, jobId: string, overrides: FitOverrides | null, signal?: AbortSignal) => {
  const q = overridesQuery(overrides);
  return call<FitCount>(token, `/admin/maintenance/jobs/${jobId}/fit-count${q ? `?${q}` : ""}`, { signal });
};

export type FitModel = {
  vehicleCatalogId: string;
  make: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
  powertrain: string | null;
  fuel: string | null;
};

/** "See which": the matching models (same rule and overrides as the count). */
export const fetchFitModels = (token: string, jobId: string, overrides: FitOverrides | null, limit = 200) => {
  const q = overridesQuery(overrides);
  return call<{ items: FitModel[] }>(token, `/admin/maintenance/jobs/${jobId}/fit-models?limit=${limit}${q ? `&${q}` : ""}`);
};
