/**
 * Shared read of the parts browser. Dominion and Fleet both call these.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export function shapeBrowse(rows: Array<Record<string, unknown>>) {
  const parts = rows.filter((row) => row.is_part !== false);
  const systems = parts.filter((row) => row.parent_id == null && String(row.kind ?? "") !== "component");
  const components = parts.filter((row) => row.parent_id != null);
  return {
    systems: systems.map((system) => ({
      id: system.id,
      plainName: system.plain_name || system.name,
      icon: system.icon_key ?? null,
      components: components
        .filter((row) => row.parent_id === system.id)
        .map((row) => ({
          id: row.id,
          plainName: row.plain_name || row.name,
          positionAware: Boolean(row.position_aware),
        })),
    })),
    common: parts
      .filter((row) => Number(row.common_rank) >= 1 && Number(row.common_rank) <= 8)
      .sort((a, b) => Number(a.common_rank) - Number(b.common_rank))
      .map((row) => ({ id: row.id, plainName: row.plain_name || row.name })),
  };
}

export async function readPartsBrowse(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("maintenance_service_categories")
    .select("id, name, plain_name, icon_key, parent_id, is_part, common_rank, position_aware, kind")
    .order("name");
  if (error) throw error;
  return shapeBrowse((data || []) as Array<Record<string, unknown>>);
}

export type TermComponent = { id: string; name?: string | null; plain_name?: string | null };
export type TermSynonym = { term?: string | null; maintenance_component_id?: string | null };
export type TermPart = {
  id: string;
  name?: string | null;
  oem_part_number?: string | null;
  oem_part_number_norm?: string | null;
  maintenance_component_id?: string | null;
};

export type TermHit = {
  kind: "part" | "synonym" | "name";
  id: string;
  plainName: string;
  number?: string | null;
  componentId?: string | null;
};

function partNorm(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Exact part number, then a search word, then a name. At most 8 components. */
export function rankTermResults(
  q: string,
  input: { components: TermComponent[]; synonyms: TermSynonym[]; parts: TermPart[] },
) {
  const needle = q.trim();
  const norm = partNorm(needle);
  const plainOf = new Map<string, string>();
  for (const row of input.components) {
    plainOf.set(row.id, String(row.plain_name || row.name || "").trim());
  }
  const exact = input.parts.filter((row) => {
    if (norm.length < 4) return false;
    const stored = String(row.oem_part_number_norm || "").toUpperCase();
    const raw = partNorm(String(row.oem_part_number || ""));
    return stored === norm || raw === norm;
  });
  const exactIds = new Set(exact.map((row) => row.id));
  const namedParts = input.parts.filter((row) => !exactIds.has(row.id));

  const synonyms = input.synonyms
    .map((row) => {
      const componentId = String(row.maintenance_component_id || "");
      return {
        term: String(row.term || ""),
        componentId,
        plainName: plainOf.get(componentId) || "",
      };
    })
    .filter((row) => row.componentId && row.plainName);

  const seen = new Set<string>();
  const componentHits: TermHit[] = [];
  const pushComponent = (hit: TermHit) => {
    if (!hit.id || seen.has(hit.id) || componentHits.length >= 8) return;
    seen.add(hit.id);
    componentHits.push(hit);
  };
  for (const row of synonyms) {
    pushComponent({ kind: "synonym", id: row.componentId, plainName: row.plainName, componentId: row.componentId });
  }
  for (const row of input.components) {
    const plainName = plainOf.get(row.id) || "";
    if (!plainName) continue;
    pushComponent({ kind: "name", id: row.id, plainName, componentId: row.id });
  }

  const partHits: TermHit[] = [...exact, ...namedParts].map((row) => ({
    kind: "part" as const,
    id: row.id,
    plainName: String(row.oem_part_number || row.name || ""),
    number: row.oem_part_number ?? null,
    componentId: row.maintenance_component_id ?? null,
  }));

  const hits = [
    ...partHits.filter((row) => exactIds.has(row.id)),
    ...componentHits.filter((row) => row.kind === "synonym"),
    ...componentHits.filter((row) => row.kind === "name"),
    ...partHits.filter((row) => !exactIds.has(row.id)),
  ];

  return {
    components: componentHits.filter((row) => row.kind === "name").map((row) => ({ id: row.id, plainName: row.plainName })),
    synonyms: synonyms.map((row) => ({ term: row.term, componentId: row.componentId, plainName: row.plainName })),
    parts: partHits.map((row) => ({ id: row.id, name: input.parts.find((part) => part.id === row.id)?.name ?? null, number: row.number })),
    hits,
  };
}

function searchLike(q: string): string {
  return `%${q.replace(/[%_,()]/g, "")}%`;
}

export async function readPartTerm(supabase: SupabaseClient, q: string) {
  const needle = q.trim();
  if (needle.length < 2) return { components: [], synonyms: [], parts: [], hits: [] as TermHit[] };
  const like = searchLike(needle);
  const norm = partNorm(needle);
  const [{ data: names, error: nameError }, { data: synonyms, error: synonymError }, { data: numbers, error: numberError }, exactResult] = await Promise.all([
    supabase.from("maintenance_service_categories").select("id, name, plain_name").or(`name.ilike.${like},plain_name.ilike.${like}`).limit(16),
    supabase.from("part_term_synonym").select("term, maintenance_component_id, canonical").ilike("term", like).limit(16),
    supabase.from("part_master").select("id, name, oem_part_number, oem_part_number_norm, maintenance_component_id").or(`name.ilike.${like},oem_part_number.ilike.${like}`).limit(16),
    norm.length >= 4
      ? supabase.from("part_master").select("id, name, oem_part_number, oem_part_number_norm, maintenance_component_id").eq("oem_part_number_norm", norm).limit(8)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (nameError) throw nameError;
  if (synonymError) throw synonymError;
  if (numberError) throw numberError;
  if (exactResult.error) throw exactResult.error;
  const components = (names || []) as TermComponent[];
  const synonymRows = (synonyms || []) as TermSynonym[];
  const missing = [...new Set(synonymRows.map((row) => String(row.maintenance_component_id || "")).filter((id) => id && !components.some((row) => row.id === id)))];
  if (missing.length) {
    const { data, error } = await supabase.from("maintenance_service_categories").select("id, name, plain_name").in("id", missing);
    if (error) throw error;
    components.push(...((data || []) as TermComponent[]));
  }
  const byId = new Map<string, TermPart>();
  for (const row of [...((exactResult.data || []) as TermPart[]), ...((numbers || []) as TermPart[])]) byId.set(row.id, row);
  return rankTermResults(needle, { components, synonyms: synonymRows, parts: [...byId.values()] });
}

export type CoverageListing = { interchange_group_id?: string | null };
export type CoveragePart = { interchange_group_id?: string | null; maintenance_component_id?: string | null };

/** Count listings by the part's component. Listings do not store the component themselves. */
export function tallyCoverage(listings: CoverageListing[], parts: CoveragePart[]) {
  const componentsByGroup = new Map<string, Set<string>>();
  for (const part of parts) {
    const groupId = String(part.interchange_group_id || "");
    const componentId = String(part.maintenance_component_id || "");
    if (!groupId || !componentId) continue;
    const set = componentsByGroup.get(groupId) ?? new Set<string>();
    set.add(componentId);
    componentsByGroup.set(groupId, set);
  }
  const counts = new Map<string, number>();
  for (const listing of listings) {
    const groupId = String(listing.interchange_group_id || "");
    const components = componentsByGroup.get(groupId);
    if (!components) continue;
    for (const id of components) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].map(([id, count]) => ({ id, count }));
}

export async function readFindPartsCoverage(supabase: SupabaseClient, variantId: string) {
  const { data: listings, error } = await supabase
    .from("part_listing")
    .select("id, interchange_group_id")
    .eq("vehicle_catalog_id", variantId);
  if (error) throw error;
  const groupIds = [...new Set((listings || []).map((row) => String((row as CoverageListing).interchange_group_id || "")).filter(Boolean))];
  if (!groupIds.length) return { variantId, areas: [] as Array<{ id: string; count: number }> };
  const { data: parts, error: partError } = await supabase
    .from("part_master")
    .select("id, interchange_group_id, maintenance_component_id")
    .in("interchange_group_id", groupIds);
  if (partError) throw partError;
  return {
    variantId,
    areas: tallyCoverage((listings || []) as CoverageListing[], (parts || []) as CoveragePart[]),
  };
}

export async function readSymptoms(supabase: SupabaseClient, options?: { includeInactive?: boolean }) {
  let query = supabase
    .from("part_symptom")
    .select("id, label, hint, sort_order, active")
    .order("sort_order");
  if (!options?.includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw error;
  const symptoms = (data || []) as Array<{ id: string; label: string; hint: string | null; sort_order: number; active?: boolean }>;
  if (!symptoms.length) return { symptoms: [] };
  const { data: links, error: linkError } = await supabase
    .from("part_symptom_component")
    .select("symptom_id, component_id, rank")
    .in("symptom_id", symptoms.map((row) => row.id));
  if (linkError) throw linkError;
  const bySymptom = new Map<string, Array<{ componentId: string; rank: number }>>();
  for (const link of links || []) {
    const row = link as { symptom_id?: string; component_id?: string; rank?: number };
    const id = String(row.symptom_id ?? "");
    const list = bySymptom.get(id) ?? [];
    list.push({ componentId: String(row.component_id ?? ""), rank: Number(row.rank ?? 1) });
    bySymptom.set(id, list);
  }
  return {
    symptoms: symptoms.map((row) => ({
      id: row.id,
      label: row.label,
      hint: row.hint,
      active: row.active !== false,
      components: (bySymptom.get(row.id) ?? []).sort((a, b) => a.rank - b.rank),
    })),
  };
}
