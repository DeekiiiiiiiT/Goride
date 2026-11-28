/**
 * Model families in plain words (maintenance rebuild step 4 / 6): "Toyota Roomy 2016–2020", plus the other
 * names the same car is sold under. Shared by the schedule drawer lookup and the Manuals list.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/** The model family of a platform: its parent when it has one, otherwise itself. */
export function familyIdOf(platform: { id: string; parent_id: string | null }): string {
  return platform.parent_id ?? platform.id;
}

function yearsText(from: number | null, to: number | null): string {
  if (from && to) return from === to ? String(from) : `${from}–${to}`;
  if (from) return `${from}–`;
  return "";
}

/**
 * Plain names for one or more model families: "Toyota Roomy 2016–2020", plus the other names the same car is
 * sold under. Read from the catalogue rows of the family platform and of every platform under it.
 */
export async function familyNames(
  supabase: SupabaseClient,
  familyIds: string[],
): Promise<Map<string, { name: string; also: string[]; cars: number }>> {
  const out = new Map<string, { name: string; also: string[]; cars: number }>();
  const ids = [...new Set(familyIds.filter(isUuid))];
  if (!ids.length) return out;

  const { data: children, error: childError } = await supabase
    .from("vehicle_platform")
    .select("id, parent_id")
    .in("parent_id", ids);
  if (childError) throw childError;
  const familyOfPlatform = new Map<string, string>();
  for (const id of ids) familyOfPlatform.set(id, id);
  for (const child of (children ?? []) as Array<{ id: string; parent_id: string }>) {
    familyOfPlatform.set(String(child.id), String(child.parent_id));
  }

  const { data: cars, error: carError } = await supabase
    .from("vehicle_catalog")
    .select("platform_id, make, model, production_start_year, production_end_year")
    .in("platform_id", [...familyOfPlatform.keys()])
    .limit(5000);
  if (carError) throw carError;

  const groups = new Map<string, Map<string, { from: number | null; to: number | null; n: number }>>();
  for (const car of (cars ?? []) as Array<Record<string, unknown>>) {
    const family = familyOfPlatform.get(String(car.platform_id));
    if (!family) continue;
    const key = `${String(car.make ?? "").trim()} ${String(car.model ?? "").trim()}`.trim();
    if (!key) continue;
    const byName = groups.get(family) ?? new Map();
    const cur = byName.get(key) ?? { from: null, to: null, n: 0 };
    const y0 = car.production_start_year == null ? null : Number(car.production_start_year);
    const y1 = car.production_end_year == null ? null : Number(car.production_end_year);
    if (y0 && (cur.from == null || y0 < cur.from)) cur.from = y0;
    if (y1 && (cur.to == null || y1 > cur.to)) cur.to = y1;
    cur.n += 1;
    byName.set(key, cur);
    groups.set(family, byName);
  }

  for (const [family, byName] of groups) {
    const ranked = [...byName.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
    const [first, ...rest] = ranked;
    const years = yearsText(first[1].from, first[1].to);
    out.set(family, {
      name: years ? `${first[0]} ${years}` : first[0],
      also: rest.map(([n]) => n),
      cars: ranked.reduce((sum, [, v]) => sum + v.n, 0),
    });
  }
  return out;
}
