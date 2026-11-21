/**
 * Research engine screens (docs/research-engine-audit.md §3 / §4): one client for every route the Dominion screens call.
 * All under /make-server-37f42386/admin/catalog-research on the platform-catalog function. Responses never carry who
 * asked, when, or how many companies asked (RE-23) — the server strips them.
 */
import { API_ENDPOINTS } from "./apiConfig";
import { publicAnonKey } from "../utils/supabase/info";

const BASE = `${API_ENDPOINTS.catalog}/make-server-37f42386/admin/catalog-research`;

function headers(token: string, json = false): HeadersInit {
  const h: Record<string, string> = { Authorization: `Bearer ${token}`, apikey: publicAnonKey };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : `HTTP ${res.status}`;
}

async function getJson<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: headers(token) });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
}

async function send<T>(token: string, method: "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(token, body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json().catch(() => ({}))) as T;
}

// ------------------------------------------------------------------ types

export type ResearchJobState =
  | "queued"
  | "researching"
  | "checking"
  | "needs_review"
  | "auto_added"
  | "added"
  | "not_found"
  | "failed"
  | "browser_check"
  | "browser_check_queued";

export type ResearchCar = {
  id: string;
  make: string;
  model: string;
  production_start_year: number | null;
  production_end_year: number | null;
  production_start_month?: number | null;
  production_end_month?: number | null;
  chassis_code: string | null;
  engine_code: string | null;
  engine_type?: string | null;
  /** RE-62: the engine in plain words, only when known (server); null → not said. */
  engine_words?: string | null;
  drivetrain: string | null;
  transmission: string | null;
  trim_series?: string | null;
  catalog_trim?: string | null;
};

export type ResearchJobListItem = {
  jobId: string;
  jobType: "part" | "spec" | "vehicle" | "vehicle_identity" | "vehicle_model";
  state: ResearchJobState;
  vehicleCatalogId: string | null;
  car: ResearchCar | null;
  partTypeId: string | null;
  partTypeName: string | null;
  specKey: string | null;
  specLabel: string | null;
  fitDescriptor: string | null;
  resultPartNumber: string;
  sourceCount: number;
  trustRoute: TrustRoute | null;
  siteDomains: string[];
  conflictOpen: boolean;
  updatedAt: string;
  /** Vehicle and model jobs: the car being researched. */
  subject?: { make: string; model: string; year: number | null } | null;
  vehicleProposals?: Array<Pick<VehicleProposal, "make" | "model" | "production_start_year" | "production_end_year" | "chassis_code" | "engine_code" | "drivetrain" | "grade" | "market" | "action" | "status">>;
};

export type TrustRoute = "a" | "b" | "c" | "owner_browser";

export type ProposalSource = {
  url?: string;
  domain?: string | null;
  readId?: string;
  block?: string;
  dropped?: boolean;
  reason?: string;
};

export type PartProposal = {
  id: string;
  job_id: string;
  brand: string;
  part_number: string;
  part_name: string | null;
  match_kind: string | null;
  position_key: string;
  fits: { listings?: Array<{ vehicleId?: string; position?: string }> } | null;
  sources: ProposalSource[] | null;
  checks: {
    trust?: "confirmed" | "needs_checking";
    passes?: Array<{ domain: string; kind: string; maker: string }>;
    shadowWouldAuto?: boolean;
    conflict?: boolean;
    browserCheckUrl?: string | null;
    manual?: boolean;
  } | null;
  route: string;
  status: string;
  trust_route: TrustRoute | null;
  evidence_read_ids: string[];
  promoted_part_id: string | null;
  rejected_reason: string | null;
};

export type VehicleProposal = {
  id: string;
  job_id: string;
  make: string;
  model: string;
  production_start_year: number | null;
  production_end_year: number | null;
  chassis_code: string | null;
  engine_code: string | null;
  drivetrain: string | null;
  transmission: string | null;
  market: string | null;
  grade: string | null;
  chassis_serial_from: string | null;
  chassis_serial_to: string | null;
  existing_vehicle_catalog_id: string | null;
  action: "new" | "update" | "same" | string | null;
  status: string;
  rejected_reason: string | null;
  sources: ProposalSource[] | null;
  checks: Record<string, unknown> | null;
  evidence_read_ids: string[];
};

export type SpecProposal = {
  id: string;
  job_id: string;
  vehicle_catalog_id: string;
  spec_key: string;
  value: string;
  unit: string | null;
  evidence_read_ids: string[];
  trust_route: TrustRoute | null;
  route: string;
  status: string;
  rejected_reason: string | null;
};

export type NumberConflict = {
  id: string;
  proposal_ids: string[];
  position: string | null;
  opened_at: string;
  closed_at: string | null;
  resolution: string | null;
};

export type ResearchJobDetail = {
  job: {
    id: string;
    job_type: ResearchJobListItem["jobType"];
    state: ResearchJobState;
    vehicle_catalog_id: string | null;
    maintenance_component_id: string | null;
    fit_descriptor: string | null;
    spec_key: string | null;
    attempts: number;
    last_error: string | null;
    updated_at: string;
  };
  car: ResearchCar | null;
  partType: { id: string; name: string } | null;
  spec: { key: string; label: string; unit: string | null } | null;
  browserCheckUrl: string | null;
  /** RE-63: the same model's other engines built in the same years (e.g. the turbo). */
  sisterEngines?: Array<{ code: string; turbo: boolean }>;
  /** RE-63: the catalogue's own name for this car's version, learned from an earlier confirmed check. */
  knownVersion?: { domain: string; code: string; url: string | null } | null;
  reads: Array<{ id: string; domain: string | null; path: "direct" | "owner_browser"; read_at: string }>;
  proposals: PartProposal[];
  vehicleProposals: VehicleProposal[];
  specProposals: SpecProposal[];
  conflicts: NumberConflict[];
  events: Array<{ id: string; step: string; outcome: string; at: string }>;
};

export type ResearchSummary = {
  needsReview: number;
  browserCheckOpen: number;
  browserCheckWaiting: number;
  browserCheckMax: number;
  researching: number;
  waiting: number;
  addedThisWeek: number;
  addedAutoThisWeek: number;
  vehiclesNeedsReview: number;
  conflictsOpen: number;
  spendTodayUsd: number;
  dailySpendUsd: number;
  costPerJob7dUsd: number | null;
  jobsDone7d: number;
  remainingJobs: number;
  fillTargetDate: string | null;
  expectedFinishDate: string | null;
  carsWithoutFrameCode: number;
  shadowMode: boolean;
  shadowStreak: number;
  paused: boolean;
  pausedReason: string | null;
  autoResumeAt: string | null;
  enabled: boolean;
  fillPlan: { cars: number; ready: number; inProgress: number; waiting: number };
  researchingCar: string | null;
  fillingFirst: Array<{ vehicleCatalogId: string; label: string; chassisCode: string | null; partsReady: number; openJobs: number }>;
};

export type ResearchNotice = {
  id: string;
  kind: "engine_paused" | "site_blocked" | "spend_cap" | "grounding_limit" | "evidence_changed";
  subject: string;
  reason: string | null;
  resumeAt: string | null;
  openedAt: string;
};

export type CoveragePart = {
  componentId: string;
  opCode: string;
  name: string;
  cell: "verified" | "not_applicable" | "unverified" | "missing";
  partNumber: string | null;
  maker: string | null;
  sourceUrl: string | null;
  jobId: string | null;
  jobState: ResearchJobState | null;
  conflictId: string | null;
};

export type CoverageSpec = {
  specKey: string;
  label: string;
  value: string | null;
  unit: string | null;
  trust: "confirmed" | "needs_checking" | null;
  sourceNote: string | null;
  sourceUrl: string | null;
  trustRoute: TrustRoute | null;
  checkedAt: string | null;
  jobId: string | null;
  jobState: ResearchJobState | null;
};

export type CarCoverage = {
  vehicleCatalogId: string;
  make: string;
  model: string;
  chassisCode: string | null;
  engineCode: string | null;
  partsReady: number;
  parts: CoveragePart[];
  specs: CoverageSpec[];
  /** Every spec on file for this car (S7), with trust and source. */
  allSpecs: CoverageSpec[];
};

export type ResearchSettings = {
  enabled: boolean;
  shadow_mode: boolean;
  paused: boolean;
  paused_reason?: string | null;
  auto_resume_at?: string | null;
  shadow_approve_streak?: number;
  daily_spend_usd?: number;
  max_open_browser_checks?: number;
  fill_target_date?: string | null;
};

export type ResearchIncident = { id: string; state: string; last_error: string | null; attempts: number; updated_at: string };

export type TrustedSite = {
  domain: string;
  automated_read: "allowed" | "blocked" | "not_checked";
  automated_read_checked_at: string | null;
  automated_read_note: string | null;
  blocked_at: string | null;
  backoff_until: string | null;
  pages_confirmed: number;
  makers: Array<{ kind: "car_maker" | "part_maker" | "reference"; maker: string }>;
  recipeCount: number;
};

export type LookupRecipe = {
  id: string;
  domain: string;
  maker_norm: string | null;
  name: string;
  kind: "by_part_number" | "search_then_page" | "browser_check_link" | "form_then_page";
  search_url_template: string | null;
  /** form_then_page only: the fields posted to the form address. */
  form_body_template?: string | null;
  result_link_rule: string | null;
  block_rule: string | null;
  active: boolean;
  notes: string | null;
  updated_at: string;
  worked: number;
  lastWorkedAt: string | null;
};

export type SiteRead = {
  id: string;
  purpose: "job" | "recipe_test" | "recheck";
  path: "direct" | "owner_browser";
  url: string;
  httpStatus: number | null;
  foundRow: boolean;
  readAt: string;
};

export type BrowserCheckGate =
  | { ok: true; detected: string }
  | { ok: false; reason: "no_car" | "no_number" | "number_not_on_line" | "wrong_years" | "wrong_engine" | "no_value" | "empty" };

// ------------------------------------------------------------------ reads

export const researchApi = {
  summary: (t: string) => getJson<ResearchSummary>(t, "/summary"),
  notices: (t: string) => getJson<{ items: ResearchNotice[] }>(t, "/notices").then((r) => r.items ?? []),
  coverage: (t: string, carId: string) => getJson<CarCoverage>(t, `/coverage/${encodeURIComponent(carId)}`),
  jobs: (t: string, types?: string[]) =>
    getJson<{ items: ResearchJobListItem[] }>(t, `/jobs${types?.length ? `?types=${types.join(",")}` : ""}`).then((r) => r.items ?? []),
  job: (t: string, jobId: string) => getJson<ResearchJobDetail>(t, `/jobs/${encodeURIComponent(jobId)}`),
  settings: (t: string) => getJson<{ settings: ResearchSettings; status: string }>(t, "/settings"),
  incidents: (t: string) => getJson<{ items: ResearchIncident[] }>(t, "/incidents").then((r) => r.items ?? []),
  trustedSites: (t: string) => getJson<{ items: TrustedSite[] }>(t, "/trusted-sites").then((r) => r.items ?? []),
  siteReads: (t: string, domain: string) =>
    getJson<{ items: SiteRead[] }>(t, `/trusted-sites/${encodeURIComponent(domain)}/reads`).then((r) => r.items ?? []),
  recipes: (t: string, domain: string) =>
    getJson<{ items: LookupRecipe[] }>(t, `/trusted-sites/${encodeURIComponent(domain)}/recipes`).then((r) => r.items ?? []),

  // ---------------------------------------------------------------- writes
  patchSettings: (t: string, body: Partial<{ enabled: boolean; shadow_mode: boolean; paused: boolean; daily_spend_usd: number; max_open_browser_checks: number; fill_target_date: string }>) =>
    send(t, "PATCH", "/settings", body),
  retry: (t: string, jobId: string) => send(t, "POST", `/jobs/${encodeURIComponent(jobId)}/retry`),
  researchNext: (t: string, jobId: string) => send(t, "POST", `/jobs/${encodeURIComponent(jobId)}/research-next`),
  undo: (t: string, jobId: string) => send(t, "POST", `/jobs/${encodeURIComponent(jobId)}/undo`),
  notFound: (t: string, jobId: string) => send(t, "POST", `/jobs/${encodeURIComponent(jobId)}/not-found`),
  looksRight: (t: string, jobId: string, proposalId: string) =>
    send<{ result: unknown }>(t, "POST", `/jobs/${encodeURIComponent(jobId)}/looks-right`, { proposalId }),
  editAndAdd: (t: string, jobId: string, body: { brand: string; partNumber: string; partName: string; sourceUrl: string; sourceQuote?: string }) =>
    send(t, "POST", `/jobs/${encodeURIComponent(jobId)}/edit-and-add`, body),
  reprocessQueued: (t: string) => send<{ requeued: number }>(t, "POST", "/reprocess-queued"),
  exportCsv: async (t: string) => {
    const res = await fetch(`${BASE}/export.csv`, { headers: headers(t) });
    if (!res.ok) throw new Error(await readError(res));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "research_jobs.csv";
    a.click();
    URL.revokeObjectURL(url);
  },

  approveVehicle: (t: string, id: string) => send(t, "POST", `/vehicle-proposals/${encodeURIComponent(id)}/approve`),
  rejectVehicle: (t: string, id: string, reason: string) => send(t, "POST", `/vehicle-proposals/${encodeURIComponent(id)}/reject`, { reason }),
  approveSpec: (t: string, id: string) => send(t, "POST", `/spec-proposals/${encodeURIComponent(id)}/approve`),
  rejectSpec: (t: string, id: string, reason: string) => send(t, "POST", `/spec-proposals/${encodeURIComponent(id)}/reject`, { reason }),
  researchIdentity: (t: string, vehicleCatalogId: string) => send(t, "POST", "/identity", { vehicleCatalogId }),
  researchModel: (t: string, make: string, model: string) => send<{ result: { jobId: string; newJob: boolean } }>(t, "POST", "/model", { make, model }),

  fillCar: (t: string, vehicleCatalogId: string) =>
    send<{ result: { identityFirst: boolean; newJobs: number; joined: number } }>(t, "POST", "/fill/car", { vehicleCatalogId }),
  fillModel: (t: string, make: string, model: string) => send<{ result: Record<string, unknown> }>(t, "POST", "/fill/model", { make, model }),
  fillItem: (t: string, body: { vehicleCatalogId: string; componentId?: string; specKey?: string }) => send(t, "POST", "/fill/item", body),

  browserChecks: (t: string) => getJson<{ open: number; waiting: number; max: number }>(t, "/browser-checks/summary"),
  previewBrowserCheck: (t: string, jobId: string, pasted: string, number?: string) =>
    send<{ gate: BrowserCheckGate }>(t, "POST", `/browser-checks/${encodeURIComponent(jobId)}/preview`, { pasted, number: number || undefined }).then((r) => r.gate),
  confirmBrowserCheck: (t: string, jobId: string, pasted: string, url: string, number?: string) =>
    send<{ detected: string }>(t, "POST", `/browser-checks/${encodeURIComponent(jobId)}/confirm`, { pasted, url, number: number || undefined }),
  notOnPage: (t: string, jobId: string) => send(t, "POST", `/browser-checks/${encodeURIComponent(jobId)}/not-on-page`),

  resolveConflict: (t: string, id: string, body: { resolution: "picked" | "both_wrong"; proposalId?: string }) =>
    send(t, "POST", `/conflicts/${encodeURIComponent(id)}/resolve`, body),

  addSite: (t: string, body: { domain: string; kind: "car_maker" | "part_maker" | "reference"; makers: string[]; automatedRead: "allowed" | "blocked" | "not_checked"; checkedAt?: string }) =>
    send(t, "POST", "/trusted-sites", body),
  markSite: (t: string, domain: string, automatedRead: "allowed" | "blocked") =>
    send(t, "PATCH", `/trusted-sites/${encodeURIComponent(domain)}`, { automatedRead }),
  removeSite: (t: string, domain: string) => send(t, "POST", `/trusted-sites/${encodeURIComponent(domain)}/remove`),
  addRecipe: (t: string, domain: string, body: { name: string; kind: LookupRecipe["kind"]; searchUrlTemplate: string; formBodyTemplate?: string; resultLinkRule?: string; maker?: string; notes?: string }) =>
    send(t, "POST", `/trusted-sites/${encodeURIComponent(domain)}/recipes`, body),
  patchRecipe: (t: string, id: string, body: Partial<{ active: boolean; name: string; kind: LookupRecipe["kind"]; searchUrlTemplate: string; formBodyTemplate: string; resultLinkRule: string; notes: string }>) =>
    send(t, "PATCH", `/recipes/${encodeURIComponent(id)}`, body),
  testRecipe: (t: string, id: string, vehicleCatalogId: string, number?: string) =>
    send<{ found: boolean; block?: string; url?: string; browserCheckUrl?: string; reason?: string }>(
      t, "POST", `/recipes/${encodeURIComponent(id)}/test`, { vehicleCatalogId, number },
    ),
};
