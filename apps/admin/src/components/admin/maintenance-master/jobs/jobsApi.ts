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

export type JobGroup = { id: string; code: string; name: string; iconKey: string | null };

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
};

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
export const updateJob = (token: string, id: string, input: Partial<JobInput>) =>
  call<{ item: Job }>(token, `/admin/maintenance/jobs/${id}`, { method: "PATCH", ...json(input) });

// V5
export const retireJob = (token: string, id: string) =>
  call<{ removedFromSections: number; removedLinks: number }>(token, `/admin/maintenance/jobs/${id}/retire`, {
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
