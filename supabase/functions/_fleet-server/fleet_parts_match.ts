/**
 * LC-21 "Is the part in my hand already known?" — GET /parts/match (docs/log-service-parts-gaps-audit.md 0c3).
 *
 * Close matches only (owner 20 Nov; keeps the 9 Nov "own verified cars only" rule for Find parts): one kind of part
 * (the job), at least 4 letters, at most 5 matches, brand / name / number only — no list of cars, no browsing.
 * Covers both car-listed parts (part_master of that job) and by-size parts (universal_part of the job's size key).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { specKeysForComponent } from "./parts_finder.ts";

export const MATCH_MIN_CHARS = 4;
export const MATCH_LIMIT = 5;
/** Rows read per table before every word is checked here. */
const CANDIDATES = 40;

export type PartMatch = {
  /** part_master id, or "size:<universal_part id>". */
  key: string;
  /** part_master id (null for a by-size part: it isn't stored as the job's part). */
  partId: string | null;
  kind: "part" | "size";
  name: string;
  brand: string;
  number: string;
  /** By-size parts: the size ("55B20L (M-55)") and type ("EFB"). */
  size: string | null;
  type: string | null;
};

/** Letters and digits only, lower case: "PF-NS60L" → "pfns60l". */
export function normText(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The typed words, cleaned; null when too short to search (fewer than 4 letters / digits in all). */
export function matchWords(q: string): string[] | null {
  const words = q
    .split(/\s+/)
    .map(normText)
    .filter(Boolean)
    .slice(0, 6);
  if (words.join("").length < MATCH_MIN_CHARS) return null;
  return words;
}

/** Every typed word is somewhere in the part's brand + name + number (hyphens and spaces ignored). */
export function matchesAllWords(words: string[], fields: Array<string | null | undefined>): boolean {
  const hay = normText(fields.filter(Boolean).join(" "));
  return words.every((w) => hay.includes(w));
}

/** The longest word goes to the database (safe characters only); the rest are checked here. */
export function anchorWord(words: string[]): string {
  return [...words].sort((a, b) => b.length - a.length)[0] ?? "";
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

export async function findPartMatches(
  supabase: SupabaseClient,
  componentId: string,
  q: string,
): Promise<PartMatch[]> {
  const words = matchWords(q);
  if (!words) return [];
  const anchor = anchorWord(words);
  const like = `%${anchor}%`;

  const specKeys = await specKeysForComponent(supabase, componentId);
  const [partsRes, sizeRes] = await Promise.all([
    supabase
      .from("part_master")
      .select("id, name, manufacturer, oem_part_number, oem_part_number_norm")
      .eq("maintenance_component_id", componentId)
      .or(`name.ilike.${like},manufacturer.ilike.${like},oem_part_number_norm.ilike.${like}`)
      .limit(CANDIDATES),
    specKeys.length
      ? supabase
        .from("universal_part")
        .select("id, name, manufacturer, part_number, spec_value, extra")
        .in("spec_key", specKeys)
        .or(`name.ilike.${like},manufacturer.ilike.${like},part_number.ilike.${like}`)
        .limit(CANDIDATES)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (partsRes.error) throw partsRes.error;
  if (sizeRes.error) throw sizeRes.error;

  const out: PartMatch[] = [];
  // A by-size save also writes a part_master row (universal_part.extra.partId): list that battery once, by size.
  const sizeRows = (sizeRes.data ?? []) as Array<Record<string, unknown>>;
  const sizeTwins = new Set(
    sizeRows.map((r) => str((r.extra as Record<string, unknown> | null)?.partId)).filter(Boolean),
  );
  for (const r of (partsRes.data ?? []) as Array<Record<string, unknown>>) {
    if (sizeTwins.has(str(r.id))) continue;
    if (!matchesAllWords(words, [str(r.manufacturer), str(r.name), str(r.oem_part_number)])) continue;
    out.push({
      key: str(r.id),
      partId: str(r.id),
      kind: "part",
      name: str(r.name),
      brand: str(r.manufacturer),
      number: str(r.oem_part_number),
      size: null,
      type: null,
    });
  }
  for (const r of sizeRows) {
    if (!matchesAllWords(words, [str(r.manufacturer), str(r.name), str(r.part_number)])) continue;
    const extra = (r.extra && typeof r.extra === "object" ? r.extra : {}) as Record<string, unknown>;
    out.push({
      key: `size:${str(r.id)}`,
      // Its part_master twin, when the by-size save made one (Dominion's "Added — pick the part" resolves with it).
      partId: str(extra.partId) || null,
      kind: "size",
      name: str(r.name),
      brand: str(r.manufacturer),
      number: str(r.part_number),
      size: str(r.spec_value) || null,
      type: str(extra.battery_type) || null,
    });
  }
  return out.slice(0, MATCH_LIMIT);
}

/** universal_part id → its part_master twin (extra.partId), for the ids that have one. */
export async function universalTwinIds(supabase: SupabaseClient, universalIds: string[]): Promise<Map<string, string>> {
  const ids = universalIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { data, error } = await supabase.from("universal_part").select("id, extra").in("id", ids);
  if (error) throw error;
  for (const r of (data ?? []) as Array<{ id: string; extra?: Record<string, unknown> | null }>) {
    const twin = str(r.extra?.partId);
    if (twin) out.set(String(r.id), twin);
  }
  return out;
}

export type PickCandidate = {
  partId: string;
  name: string;
  brand: string;
  number: string;
  place: string | null;
  fitLabel: string;
};

/**
 * Dominion "Added — pick the part": the car's own list (by-size parts swapped to their part_master twin; ones with no
 * twin can't resolve a request, so they are left out) + close matches of what was typed, labelled not_listed.
 */
export function candidateItems(
  listed: PickCandidate[],
  twins: Map<string, string>,
  matches: PartMatch[],
): PickCandidate[] {
  const out: PickCandidate[] = [];
  const seen = new Set<string>();
  for (const p of listed) {
    const partId = p.fitLabel === "fits_by_size" ? twins.get(p.partId) : p.partId;
    if (!partId || seen.has(partId)) continue;
    seen.add(partId);
    out.push({ ...p, partId });
  }
  for (const m of matches) {
    if (!m.partId || seen.has(m.partId)) continue;
    seen.add(m.partId);
    out.push({
      partId: m.partId,
      name: m.name,
      brand: m.brand,
      number: m.number,
      place: [m.size, m.type].filter(Boolean).join(" · ") || null,
      fitLabel: "not_listed",
    });
  }
  return out;
}
