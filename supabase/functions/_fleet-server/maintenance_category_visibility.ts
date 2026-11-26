/**
 * G9 for the Log service (docs/part-type-auto-sort-audit.md, S1b fix): a draft part type is hidden only when nothing
 * uses it. Find parts stays strict (active only); the two Log service reads keep a used draft exactly as before, or
 * Fleet would lose the jobs/packages it is already logged against.
 *
 * One fixed set of explicit-column reads per request — the draft ids, then one query per usage table — never a query
 * per category row. If a usage table cannot be read, the caller passes null and every draft stays visible (fail open).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type PartTypeVisibilityRow = { id: string; part_type_status?: string | null };

/** Every place a part type can still be referenced (the five tables from the live check; job_item has two columns). */
const USAGE_SOURCES: ReadonlyArray<{ table: string; column: string }> = [
  { table: "maintenance_package_categories", column: "category_id" },
  { table: "maintenance_job_section_members", column: "category_id" },
  { table: "vehicle_component_schedule", column: "category_id" },
  { table: "maintenance_job_item", column: "part_type_id" },
  { table: "maintenance_job_item", column: "job_id" },
  { table: "maintenance_task_templates", column: "component_id" },
];

/** The draft component ids that at least one of the five usage tables still references. */
export async function readUsedDraftTypeIds(supabase: SupabaseClient): Promise<Set<string>> {
  const used = new Set<string>();
  const { data: draftRows, error: draftError } = await supabase
    .from("maintenance_service_categories")
    .select("id")
    .eq("part_type_status", "draft")
    .eq("kind", "component")
    .eq("is_part", true);
  if (draftError) throw draftError;
  const draftIds = ((draftRows ?? []) as Array<{ id?: string }>)
    .map((row) => String(row.id ?? ""))
    .filter(Boolean);
  if (!draftIds.length) return used;

  const results = await Promise.all(
    USAGE_SOURCES.map(({ table, column }) =>
      supabase.from(table).select(column).in(column, draftIds)
    ),
  );
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    if (result.error) throw result.error;
    const column = USAGE_SOURCES[i].column;
    for (const row of (result.data ?? []) as unknown as Array<Record<string, unknown>>) {
      const id = String(row[column] ?? "");
      if (id) used.add(id);
    }
  }
  return used;
}

/** A used draft is kept; an unused draft is hidden; an active type is always kept. */
export function keepPartTypeForLogService(
  row: PartTypeVisibilityRow,
  usedDraftIds: ReadonlySet<string>,
): boolean {
  return row.part_type_status !== "draft" || usedDraftIds.has(String(row.id));
}

/**
 * The Log service's list filter. `null` means the usage check could not run: show everything, so a used draft is
 * never lost because a usage table was briefly unreadable.
 */
export function visiblePartTypes<T extends PartTypeVisibilityRow>(
  rows: ReadonlyArray<T>,
  usedDraftIds: ReadonlySet<string> | null,
): T[] {
  if (usedDraftIds === null) return [...rows];
  return rows.filter((row) => keepPartTypeForLogService(row, usedDraftIds));
}
