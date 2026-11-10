/**
 * Helpers for Dominion maintenance jobs admin routes (Layer 2).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const SERVICE_FIELD_SCHEMA = {
  fields: [
    { key: "labor", type: "number", label: "Labor", required: false },
    { key: "material", type: "number", label: "Parts / materials", required: false },
  ],
} as const;

export const PART_FIELD_SCHEMA = {
  fields: [
    { key: "qty", type: "number", label: "Quantity", required: false },
    { key: "unit_price", type: "number", label: "Unit price", required: false },
    { key: "labor", type: "number", label: "Labor", required: false },
  ],
} as const;

export const JOB_ACTIONS = new Set([
  "inspect", "clean", "adjust", "replace", "rotate", "balance",
  "flush", "top_up", "repair", "machine", "rebuild", "other",
]);

export function slugCode(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72);
  return s || "job";
}

export function renumberSortOrders(_ids: string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < _ids.length; i++) out.push((i + 1) * 10);
  return out;
}

const SYSTEM_OP_PREFIX: Record<string, string> = {
  sys_engine: "ENG-",
  sys_filters: "FILT-",
  sys_fluids: "FLD-",
  sys_brakes: "BRK-",
  sys_belts: "BELT-",
  sys_tires: "TIR-",
  sys_electrical: "ELEC-",
  sys_suspension: "SUS-",
  sys_lights: "LGT-",
};

export function opCodePrefixForSystem(systemCode: string): string {
  const mapped = SYSTEM_OP_PREFIX[systemCode];
  if (mapped) return mapped;
  const base = systemCode.replace(/^sys_/, "").slice(0, 4).toUpperCase();
  return base ? `${base}-` : "JOB-";
}

export function shortOpSuffix(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words.map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 6);
  }
  const letters = name.replace(/[^a-zA-Z]/g, "").toUpperCase();
  return (letters || "JOB").slice(0, 6);
}

export function fieldSchemaForJob(isPart: boolean): Record<string, unknown> {
  return isPart ? { ...PART_FIELD_SCHEMA } : { ...SERVICE_FIELD_SCHEMA };
}

export function defaultFitModeForJob(isPart: boolean, homeSystemCode: string): string | null {
  if (!isPart) return null;
  return homeSystemCode === "sys_engine" ? "engine" : "specific";
}

export function pgUniqueViolation(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const code = (e as { code?: string }).code;
  return code === "23505";
}

export function pgErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function allocateUniqueCode(supabase: SupabaseClient, base: string): Promise<string> {
  let candidate = slugCode(base);
  for (let n = 0; n < 50; n++) {
    const tryCode = n === 0 ? candidate : `${candidate}_${n + 1}`;
    const { data } = await supabase
      .from("maintenance_service_categories")
      .select("id")
      .eq("code", tryCode)
      .maybeSingle();
    if (!data) return tryCode;
  }
  return `${candidate}_${crypto.randomUUID().slice(0, 8)}`;
}

export async function allocateUniqueGlobalCode(
  supabase: SupabaseClient,
  base: string,
  table: "maintenance_job_section_groups" | "maintenance_job_sections",
): Promise<string> {
  const slug = slugCode(base);
  for (let n = 0; n < 50; n++) {
    const tryCode = n === 0 ? slug : `${slug}_${n + 1}`;
    const { data } = await supabase.from(table).select("id").eq("code", tryCode).maybeSingle();
    if (!data) return tryCode;
  }
  return `${slug}_${crypto.randomUUID().slice(0, 8)}`;
}

export async function allocateUniqueOpCode(
  supabase: SupabaseClient,
  prefix: string,
  name: string,
): Promise<string> {
  const suffix = shortOpSuffix(name);
  let candidate = `${prefix}${suffix}`.slice(0, 80);
  for (let n = 0; n < 50; n++) {
    const tryOp = n === 0 ? candidate : `${prefix}${suffix}-${n + 1}`.slice(0, 80);
    const { data } = await supabase
      .from("maintenance_service_categories")
      .select("id")
      .eq("op_code", tryOp)
      .maybeSingle();
    if (!data) return tryOp;
  }
  return `${prefix}${suffix}-${crypto.randomUUID().slice(0, 4)}`.slice(0, 80);
}

export type JobRow = Record<string, unknown>;
export type RelationRow = {
  id: string;
  from_category_id: string;
  to_category_id: string;
  note: string;
};

export type MappedJob = {
  id: string;
  code: string;
  opCode: string | null;
  name: string;
  description: string | null;
  iconKey: string | null;
  isPart: boolean;
  defaultAction: string;
  homeGroupId: string;
  status: "active" | "retired";
  used: boolean;
  alsoDo: Array<{ relationId: string; jobId: string; jobName: string; note: string }>;
  suggestedBy: Array<{ relationId: string; jobId: string; jobName: string }>;
};

export function mapCategoryToJob(
  row: JobRow,
  usedIds: Set<string>,
  byId: Map<string, JobRow>,
  outByFrom: Map<string, RelationRow[]>,
  inByTo: Map<string, RelationRow[]>,
): MappedJob {
  const id = String(row.id);
  const alsoDo = (outByFrom.get(id) ?? []).map((r) => {
    const t = byId.get(String(r.to_category_id));
    return {
      relationId: String(r.id),
      jobId: String(r.to_category_id),
      jobName: String(t?.name ?? "Job"),
      note: String(r.note ?? ""),
    };
  });
  const suggestedBy = (inByTo.get(id) ?? []).map((r) => {
    const f = byId.get(String(r.from_category_id));
    return {
      relationId: String(r.id),
      jobId: String(r.from_category_id),
      jobName: String(f?.name ?? "Job"),
    };
  });
  return {
    id,
    code: String(row.code ?? ""),
    opCode: row.op_code != null ? String(row.op_code) : null,
    name: String(row.name ?? ""),
    description: row.description != null ? String(row.description) : null,
    iconKey: row.icon_key != null ? String(row.icon_key) : null,
    isPart: row.is_part === true,
    defaultAction: String(row.default_action ?? "replace"),
    homeGroupId: String(row.parent_id ?? ""),
    status: String(row.status ?? "active") === "retired" ? "retired" : "active",
    used: usedIds.has(id),
    alsoDo,
    suggestedBy,
  };
}

export function duplicateMemberMessage(sectionName: string): string {
  return `Already in ${sectionName}.`;
}

export function usedJobPatchRefusal(body: Record<string, unknown>, used: boolean): string | null {
  if (!used) return null;
  if (body.homeGroupId !== undefined) {
    return "This job has been used in service logs, so its home group cannot be changed.";
  }
  if (body.isPart !== undefined) {
    return "This job has been used in service logs, so its form type cannot be changed.";
  }
  return null;
}

export function relationRefusal(fromId: string, toId: string, duplicate: boolean, inactive: boolean): string | null {
  if (fromId === toId) return "A job cannot link to itself.";
  if (duplicate) return "That link already exists.";
  if (inactive) return "Both jobs must be active.";
  return null;
}

export function parseJobIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = raw.map((x) => String(x)).filter((id) => isUuid(id));
  return ids;
}
