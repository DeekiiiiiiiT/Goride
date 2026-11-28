/**
 * Owner's manuals (maintenance rebuild step 6) and the car lookup the schedule drawer uses (step 4).
 * Server: supabase/functions/_fleet-server/maintenance_manual_routes.ts and maintenance_master_routes.ts.
 */
import { API_ENDPOINTS } from "../../../../services/apiConfig";
import { publicAnonKey } from "../../../../utils/supabase/info";

const OPS = API_ENDPOINTS.fleetOps;

function headers(token: string, json = true): HeadersInit {
  const h: Record<string, string> = { Authorization: `Bearer ${token}`, apikey: publicAnonKey };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  return body.error || body.message || "That didn't work. Please try again.";
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${OPS}${path}`, {
    ...init,
    headers: headers(token, init.body != null),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
}

export type Market = "JM" | "GEN" | "JP" | "OTHER";

export const MARKETS: { value: Market; label: string; flag: string }[] = [
  { value: "JM", label: "Jamaica", flag: "🇯🇲" },
  { value: "GEN", label: "Export (other countries)", flag: "🌐" },
  { value: "JP", label: "Japan", flag: "🇯🇵" },
  { value: "OTHER", label: "Another country", flag: "🏳️" },
];

export function marketLabel(m: string | null | undefined): { label: string; flag: string } {
  const hit = MARKETS.find((x) => x.value === String(m ?? "").toUpperCase());
  return hit ? { label: hit.value === "GEN" ? "Export" : hit.label, flag: hit.flag } : { label: "—", flag: "" };
}

export type ManualStatus = "reading" | "waiting_check" | "checked" | "rejected" | "stopped";

export type ManualSummary = {
  id: string;
  market: string;
  title: string;
  status: ManualStatus | string;
  page_from: number;
  page_to: number;
  page_count: number;
  progress_page: number | null;
  created_at: string | null;
};

export type ModelFamilyRow = {
  platform_id: string;
  code: string;
  maker: string | null;
  label: string | null;
  name: string | null;
  also_sold_as: string[];
  catalogue_cars: number;
  manual_status: string;
  manuals: ManualSummary[];
};

export type ModelListResponse = { items: ModelFamilyRow[]; page: number; page_size: number; total: number };

export function listModelFamilies(
  token: string,
  opts: { q?: string; hasManual?: "true" | "false" | ""; page?: number; platformId?: string } = {},
): Promise<ModelListResponse> {
  const sp = new URLSearchParams();
  if (opts.q) sp.set("q", opts.q);
  if (opts.hasManual) sp.set("has_manual", opts.hasManual);
  if (opts.page) sp.set("page", String(opts.page));
  if (opts.platformId) sp.set("platform_id", opts.platformId);
  return call(token, `/maintenance-manuals?${sp}`);
}

export type ManualRow = {
  id: string;
  manual_id: string;
  evidence_page: number | null;
  printed_page?: number | null;
  component_id: string | null;
  part_name: string | null;
  task_name: string | null;
  interval_km: number | null;
  interval_months: number | null;
  severe_interval_km: number | null;
  severe_interval_months: number | null;
  severe_same_as_normal: boolean;
  first_interval_km: number | null;
  first_interval_months: number | null;
  status: string;
  confidence: string | null;
  draft_note: string | null;
  needs_checking: boolean;
};

export type ManualPage = {
  /** PDF page (used for links and actions). */
  pdf_page: number;
  /** The number printed in the book (what people see). */
  printed_page: number | null;
  status: "queued" | "reading" | "done" | "failed" | "skipped" | string;
  attempts: number;
  error: string | null;
  rows_found: number | null;
};

export type DocType = "schedule" | "owners_manual";

/** A car's fluid, tyre, battery, bulb or fuel value read from an owner's manual (build step 6b). */
export type SpecRow = {
  id: string;
  manual_id: string;
  kind: "fluid" | "tyre" | "battery" | "bulb" | "fuel" | string;
  key: string;
  value: Record<string, unknown> | null;
  applies_to: string | null;
  version_ids: string[];
  status: string;
  confidence: string | null;
  draft_note: string | null;
  evidence_page: number | null;
  printed_page: number | null;
  /** What the catalogue holds today, per version. */
  now: Array<{ vehicle_catalog_id: string; value: string }>;
  matches: boolean;
};

export type ManualDetail = {
  manual: Record<string, unknown> & {
    id: string;
    platform_id: string;
    market: string;
    title: string;
    status: string;
    page_count: number;
    page_from: number;
    page_to: number;
    progress_page: number | null;
    uploaded_at: string | null;
    checked_at: string | null;
    stop_reason?: string | null;
    reject_reason?: string | null;
    doc_type?: DocType | string | null;
    pages?: number[] | null;
    printed_pages?: number[];
    page_offset?: number | null;
    year_from?: number | null;
    year_to?: number | null;
    printed_date?: string | null;
  };
  versions?: Array<{ id: string; label: string }>;
  specs?: SpecRow[];
  platform: { id: string; code: string; maker: string | null; label: string | null } | null;
  progress: {
    page_from: number;
    page_to: number;
    pages_total: number;
    pages_done: number;
    pages_failed: number;
    pages_pending: number;
    pages_skipped: number;
    page: number | null;
  };
  pages: ManualPage[];
  rows: ManualRow[];
};

export function getManual(token: string, id: string): Promise<ManualDetail> {
  return call(token, `/maintenance-manuals/${id}`);
}

export async function getManualPageUrl(token: string, id: string, page: number): Promise<string> {
  const body = await call<{ url: string }>(token, `/maintenance-manuals/${id}/pages/${page}`);
  return body.url;
}

export type UploadStart = {
  platform_id: string;
  market: Market;
  title: string;
  file_sha256: string;
  page_count: number;
  page_from: number;
  page_to: number;
  file_bytes: number;
  doc_type?: DocType;
  /** PDF page numbers to read (several ranges allowed). */
  pages?: number[];
  page_offset?: number;
  year_from?: number | null;
  year_to?: number | null;
  printed_date?: string | null;
};

export type IdentifyField = { sure: boolean; reason: string };

export type IdentifyResult = {
  make: string | null;
  model: string | null;
  title: string | null;
  doc_type: DocType;
  market: Market | string | null;
  printed_date: string | null;
  page_offset: number;
  page_count: number;
  pages: Array<{ pdf_page: number; printed_page: number | null; reason: string }>;
  family: {
    platform_id: string;
    name: string;
    make: string;
    model: string;
    years: Array<{ from: number | null; to: number | null }>;
    close_names?: string[];
  } | null;
  /** Two or more model families fit equally well (e.g. Roomy 2WD and 4WD): the owner picks one. */
  close_families?: Array<{
    platform_id: string;
    name: string;
    label: string | null;
    make: string;
    model: string;
    years: Array<{ from: number | null; to: number | null }>;
  }>;
  year_from: number | null;
  year_to: number | null;
  years_from_printed_date: boolean;
  fields: Record<string, IdentifyField>;
  unsure: Array<{ field: string; reason: string }>;
  message: string;
};

export function identifyDocument(
  token: string,
  body: {
    file_name: string;
    page_count: number;
    pages_text: Array<{ pdf_page: number; text: string }>;
    page_heads?: Array<{ pdf_page: number; text: string }>;
    page_images?: string[];
    page_images_type?: string;
  },
): Promise<IdentifyResult> {
  return call(token, "/maintenance-manuals/identify", { method: "POST", body: JSON.stringify(body) });
}

export function approveSpec(token: string, specId: string, versionIds: string[]): Promise<{ message?: string }> {
  return call(token, `/maintenance-manual-spec-rows/${specId}/approve`, {
    method: "POST",
    body: JSON.stringify({ version_ids: versionIds }),
  });
}

export function approveAllSpecs(token: string, manualId: string): Promise<{ approved?: number; skipped?: number; message?: string }> {
  return call(token, `/maintenance-manuals/${manualId}/approve-specs`, { method: "POST", body: "{}" });
}

export function patchSpec(token: string, specId: string, body: Record<string, unknown>): Promise<unknown> {
  return call(token, `/maintenance-manual-spec-rows/${specId}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function rejectSpec(token: string, specId: string, reason: string): Promise<unknown> {
  return call(token, `/maintenance-manual-spec-rows/${specId}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
}

export type VehicleMakerSpecs = {
  tyres: Array<{ id: string; position: string; size: string; load_speed_index: string | null; wheel_size: string | null; pressure_kpa: number | null; is_optional: boolean; printed_page: number | null }>;
  bulbs: Array<{ id: string; position: string; bulb_ref: string; wattage_w: string | null; is_led: boolean; grade_note: string | null; printed_page: number | null }>;
  specs: Array<{ key: string; label: string; unit: string | null; value: unknown; source_note: string | null }>;
};

export function getVehicleMakerSpecs(token: string, vehicleCatalogId: string): Promise<VehicleMakerSpecs> {
  return call(token, `/maintenance-manuals/vehicle-specs/${encodeURIComponent(vehicleCatalogId)}`);
}

export async function uploadManual(
  token: string,
  start: UploadStart,
  file: File,
  onStage: (stage: "starting" | "sending" | "queueing") => void,
): Promise<{ manualId: string }> {
  onStage("starting");
  const begun = await call<{ manual: { id: string }; upload_url: string }>(token, "/maintenance-manuals/upload-url", {
    method: "POST",
    body: JSON.stringify(start),
  });
  onStage("sending");
  const put = await fetch(begun.upload_url, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: file,
  }).catch(() => null);
  if (!put || !put.ok) {
    throw new Error("The PDF could not be sent to Roam's file store. Check your connection and try again.");
  }
  onStage("queueing");
  await call(token, `/maintenance-manuals/${begun.manual.id}/uploaded`, { method: "POST", body: "{}" });
  return { manualId: begun.manual.id };
}

export function patchManualRow(token: string, ruleId: string, body: Record<string, unknown>): Promise<unknown> {
  return call(token, `/maintenance-manual-rows/${ruleId}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function approveManualRows(
  token: string,
  manualId: string,
  body: { rule_ids: string[] } | { all: true },
): Promise<{ approved?: number; needs_checking?: number; skipped_uncertain?: number; message?: string }> {
  return call(token, `/maintenance-manuals/${manualId}/approve`, { method: "POST", body: JSON.stringify(body) });
}

export function rejectManual(token: string, manualId: string, reason: string): Promise<unknown> {
  return call(token, `/maintenance-manuals/${manualId}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
}

export function stopManual(token: string, manualId: string): Promise<unknown> {
  return call(token, `/maintenance-manuals/${manualId}/stop`, { method: "POST", body: "{}" });
}

export function rereadPages(token: string, manualId: string, pages: number[]): Promise<unknown> {
  return call(token, `/maintenance-manuals/${manualId}/reread`, { method: "POST", body: JSON.stringify({ pages }) });
}

export type CarScope = {
  vehicle_catalog_id: string;
  model: { platform_id: string; name: string; also: string[]; cars: number } | null;
  engine: { engine_family_id: string; name: string; cars: number } | null;
};

export function getCarScope(token: string, vehicleCatalogId: string): Promise<CarScope> {
  return call(token, `/admin/maintenance/car-scope?vehicle_catalog_id=${encodeURIComponent(vehicleCatalogId)}`);
}
