/**
 * DM5 — one plain sentence per Dominion change (jobs, sections, also-do links, schedules).
 * Rows come from platform_revision. Dominion only describes its own data — never Fleet counts.
 */
import { formatInterval } from "./maintenanceMasterFormat";
import { JOB_ACTION_LABEL, type JobAction } from "./jobs/jobsApi";

export type HistoryKind = "job" | "section" | "link" | "schedule";

export type HistoryNames = {
  job: (id: unknown) => string;
  group: (id: unknown) => string;
  section: (id: unknown) => string;
};

export type HistoryEntry = {
  key: string;
  createdAt: string;
  actor: string;
  kind: HistoryKind;
  sentence: string;
  /** Changed fields only, for the expand box. */
  changes: Array<{ field: string; before: string; after: string }>;
};

type Row = Record<string, unknown>;
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Row) : {});
const str = (v: unknown) => (v == null ? "" : String(v));

const IGNORED = new Set(["id", "created_at", "updated_at", "updated_by", "created_by", "payload_json", "legacy_kv_id"]);
const FIELD_LABEL: Record<string, string> = {
  name: "name",
  plain_name: "name",
  description: "description",
  default_action: "default action",
  icon_key: "icon",
  parent_id: "home group",
  is_part: "form type",
  status: "status",
  op_code: "code",
  sort_order: "position",
  interval_km: "km",
  interval_months: "months",
};

export function actorLabel(row: Row): string {
  const label = str(row.actor_label ?? row.actor_name).trim();
  if (label && label !== "Staff") return label;
  return row.actor ? "Staff" : "Roam setup";
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function changedFields(oldRow: Row, newRow: Row): Array<{ field: string; before: string; after: string }> {
  const keys = new Set([...Object.keys(oldRow), ...Object.keys(newRow)]);
  const out: Array<{ field: string; before: string; after: string }> = [];
  for (const k of keys) {
    if (IGNORED.has(k) || k === "plain_name") continue;
    const a = JSON.stringify(oldRow[k] ?? null);
    const b = JSON.stringify(newRow[k] ?? null);
    if (a !== b) out.push({ field: FIELD_LABEL[k] ?? k.replace(/_/g, " "), before: str(oldRow[k]), after: str(newRow[k]) });
  }
  return out;
}

function jobSentence(actor: string, op: "insert" | "update" | "delete", o: Row, n: Row, names: HistoryNames): string | null {
  if (str(n.kind || o.kind) === "system") return null;
  const name = str(n.name || o.name) || "a job";
  if (op === "insert") return `${actor} added ${name} to ${names.group(n.parent_id)}.`;
  if (op === "delete") return `${actor} deleted ${name}.`;
  if (str(o.status) !== "retired" && str(n.status) === "retired") return `${actor} retired ${name}.`;
  if (str(o.status) === "retired" && str(n.status) !== "retired") return `${actor} restored ${name}.`;
  if (str(o.name) && str(o.name) !== str(n.name)) return `${actor} renamed ${str(o.name)} to ${str(n.name)}.`;
  const fields = [...new Set(changedFields(o, n).map((c) => c.field))];
  if (!fields.length) return null;
  if (fields.length === 1 && fields[0] === "default action") {
    return `${actor} set ${name}'s default action to ${JOB_ACTION_LABEL[str(n.default_action) as JobAction] ?? str(n.default_action)}.`;
  }
  return `${actor} changed ${name}'s ${fields.join(", ")}.`;
}

function scheduleSentence(actor: string, op: "insert" | "update" | "delete", o: Row, n: Row): string | null {
  const name = str(n.task_name || o.task_name) || "a schedule";
  const now = formatInterval(n.interval_km as number, n.interval_months as number);
  if (op === "insert") return `${actor} created ${name} schedule${now !== "—" ? `: ${now}` : ""}.`;
  if (op === "delete") return `${actor} deleted ${name} schedule.`;
  if (str(n.status) === "retired" && str(o.status) !== "retired") return `${actor} retired ${name} schedule.`;
  const before = formatInterval(o.interval_km as number, o.interval_months as number);
  if (before !== now) return `${actor} changed ${name} from ${before} to ${now}.`;
  if (str(o.status) !== str(n.status)) return `${actor} set ${name} to ${str(n.status)}.`;
  return `${actor} updated ${name} schedule.`;
}

/**
 * Turn raw revision rows into sentences. Section-member rows saved together (a whole section list
 * is saved at once) are merged: "put X in S", "took Y out of S", or "reordered jobs in S".
 */
export function buildHistoryEntries(rows: Row[], names: HistoryNames): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  const memberBatches = new Map<string, { at: string; actor: string; section: string; added: Set<string>; removed: Set<string>; moved: boolean }>();

  for (const row of rows) {
    const table = str(row.entity_table);
    const o = obj(row.old_row);
    const n = obj(row.new_row);
    const op: "insert" | "update" | "delete" = !Object.keys(o).length ? "insert" : !Object.keys(n).length ? "delete" : "update";
    const actor = actorLabel(row);
    const at = str(row.created_at);
    const key = str(row.id) || `${table}-${at}-${str(row.entity_id)}`;

    if (table === "maintenance_job_section_members") {
      const section = str(n.section_id || o.section_id);
      const bkey = `${section}|${at.slice(0, 19)}|${actor}`;
      const b = memberBatches.get(bkey) ?? { at, actor, section, added: new Set(), removed: new Set(), moved: false };
      const job = str(n.category_id || o.category_id);
      if (op === "insert") b.added.add(job);
      else if (op === "delete") b.removed.add(job);
      else b.moved = true;
      memberBatches.set(bkey, b);
      continue;
    }

    let kind: HistoryKind = "job";
    let sentence: string | null = null;
    if (table === "maintenance_service_categories") {
      kind = "job";
      sentence = jobSentence(actor, op, o, n, names);
    } else if (table === "maintenance_job_section_groups") {
      kind = "section";
      const name = str(n.name || o.name);
      sentence =
        op === "insert"
          ? `${actor} added section group ${name} to ${names.group(n.system_id)}.`
          : op === "delete"
            ? `${actor} deleted section group ${name}.`
            : str(o.name) !== str(n.name)
              ? `${actor} renamed section group ${str(o.name)} to ${str(n.name)}.`
              : `${actor} moved section group ${name}.`;
    } else if (table === "maintenance_job_sections") {
      kind = "section";
      const name = str(n.name || o.name);
      sentence =
        op === "insert"
          ? `${actor} added section ${name}.`
          : op === "delete"
            ? `${actor} deleted section ${name}.`
            : str(o.name) !== str(n.name)
              ? `${actor} renamed section ${str(o.name)} to ${str(n.name)}.`
              : changedFields(o, n).every((c) => c.field === "position")
                ? `${actor} moved section ${name}.`
                : `${actor} edited section ${name}.`;
    } else if (table === "maintenance_job_relations") {
      kind = "link";
      const from = names.job(n.from_category_id || o.from_category_id);
      const to = names.job(n.to_category_id || o.to_category_id);
      sentence =
        op === "delete"
          ? `${actor} removed 'also do': ${from} → ${to}.`
          : `${actor} added 'also do': ${from} → ${to} ('${str(n.note)}').`;
    } else if (table === "maintenance_task_templates") {
      kind = "schedule";
      sentence = scheduleSentence(actor, op, o, n);
    } else {
      sentence = `${actor} changed ${table.replace(/_/g, " ")}.`;
    }
    if (!sentence) continue;
    entries.push({ key, createdAt: at, actor, kind, sentence, changes: op === "update" ? changedFields(o, n) : [] });
  }

  for (const [bkey, b] of memberBatches) {
    const section = names.section(b.section);
    const added = [...b.added].filter((id) => !b.removed.has(id));
    const removed = [...b.removed].filter((id) => !b.added.has(id));
    const list = (ids: string[]) => ids.map(names.job).join(", ");
    const sentences: string[] = [];
    if (added.length) sentences.push(`${b.actor} put ${list(added)} in ${section}.`);
    if (removed.length) sentences.push(`${b.actor} took ${list(removed)} out of ${section}.`);
    if (!sentences.length) sentences.push(`${b.actor} reordered the jobs in ${section}.`);
    sentences.forEach((s, i) =>
      entries.push({ key: `${bkey}#${i}`, createdAt: b.at, actor: b.actor, kind: "section", sentence: s, changes: [] }),
    );
  }

  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
