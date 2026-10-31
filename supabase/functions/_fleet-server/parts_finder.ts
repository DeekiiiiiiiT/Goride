/**
 * Shared Find parts search for Dominion and Fleet.
 * Dominion passes orgId null and must not return stock, offers, or a customer.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fillPlainReason, PART_MATCH_TIERS } from "../../../packages/types/src/partsResolution.ts";
import { pickBestPart, type BestPickItem } from "../../../packages/types/src/partsBestPick.ts";
import { variantCodeLine, variantPlainLabel, type VariantLabelRow } from "../../../packages/types/src/vehicleVariantLabel.ts";
import { assembleMatchSections, enrichFleetParts, getCatalogParts } from "./catalog_api.ts";
import { assertNoCustomerIdentity } from "./catalog_parts_shape.ts";

const CANDIDATE_CAP = 6;

export type PartPosition = "front" | "rear" | "both" | null;
export type PartSide = "left" | "right" | "both" | null;

export type FoundPart = {
  partId: string;
  componentId: string | null;
  name: string;
  brand: string;
  number: string;
  tier: number;
  reason: string;
  position: PartPosition;
  side: PartSide;
  status: "verified" | "needs_checking";
  fitsVariantIds: string[];
  evidenceUrl: string | null;
  alsoKnownAs: string[];
};

type LoosePart = {
  tier?: number;
  position?: string | null;
  side?: string | null;
  sisterNames?: string | null;
  sourceMake?: string | null;
  referenceOem?: string | null;
  alsoKnownAs?: string[] | null;
  evidenceUrl?: string | null;
  catalogDecision?: string | null;
  fitmentId?: string;
  part?: {
    id?: string;
    name?: string;
    manufacturer?: string | null;
    oem_part_number?: string | null;
    catalog_decision?: string | null;
  };
};

function axis(value: string | null | undefined): PartPosition {
  if (value === "front" || value === "rear" || value === "both") return value;
  return null;
}

function sideOf(value: string | null | undefined): PartSide {
  if (value === "left" || value === "right" || value === "both") return value;
  return null;
}

function fitsAxis(value: string | null | undefined, wanted: string | null | undefined): boolean {
  if (!wanted) return true;
  if (!value || value === "both") return true;
  return value === wanted;
}

/** Front keeps front and blank, and drops rear. Same for left and right. */
export function keepForPosition<T extends { position?: string | null; side?: string | null }>(
  items: T[],
  position?: string | null,
  side?: string | null,
): T[] {
  return items.filter((item) => fitsAxis(item.position, position) && fitsAxis(item.side, side));
}

/** True only when two versions would show different parts. */
export function shouldAskVariant(partIdSets: string[][]): boolean {
  if (partIdSets.length < 2) return false;
  const signature = (ids: string[]) => [...ids].sort().join("|");
  const first = signature(partIdSets[0] ?? []);
  return partIdSets.some((ids) => signature(ids) !== first);
}

type UniversalSpec = {
  specKey?: string | null;
  label?: string | null;
  value?: string | null;
  unit?: string | null;
  items?: Array<{ id?: string; manufacturer?: string | null; partNumber?: string | null; name?: string | null }>;
};

/** Universal rows become tier 5 parts so they show with the other match types. */
export function universalsToFound(universal: unknown, variantId: string): FoundPart[] {
  const rows = Array.isArray(universal) ? universal as UniversalSpec[] : [];
  const found: FoundPart[] = [];
  for (const spec of rows) {
    const specText = [spec.label, spec.value, spec.unit].filter(Boolean).join(" ");
    const items = Array.isArray(spec.items) ? spec.items : [];
    const reason = fillPlainReason(5, { spec: specText || undefined });
    if (!items.length) {
      found.push({
        partId: `universal:${spec.specKey || spec.label || "size"}`,
        componentId: null,
        name: String(spec.label || "Fits by size"),
        brand: "",
        number: "",
        tier: 5,
        reason,
        position: null,
        side: null,
        status: "verified",
        fitsVariantIds: variantId ? [variantId] : [],
        evidenceUrl: null,
        alsoKnownAs: [],
      });
      continue;
    }
    for (const item of items) {
      found.push({
        partId: String(item.id || `universal:${spec.specKey}:${item.partNumber || item.name}`),
        componentId: null,
        name: String(item.name || spec.label || "Fits by size"),
        brand: String(item.manufacturer || ""),
        number: String(item.partNumber || ""),
        tier: 5,
        reason,
        position: null,
        side: null,
        status: "verified",
        fitsVariantIds: variantId ? [variantId] : [],
        evidenceUrl: null,
        alsoKnownAs: [],
      });
    }
  }
  return found;
}

function toFound(item: LoosePart, variantId: string): FoundPart {
  const part = item.part ?? {};
  const tier = Number(item.tier) || 1;
  const decision = String(part.catalog_decision ?? item.catalogDecision ?? "");
  const tierRow = PART_MATCH_TIERS.find((row) => row.tier === tier);
  return {
    partId: String(part.id ?? item.fitmentId ?? ""),
    componentId: part.maintenance_component_id ? String(part.maintenance_component_id) : null,
    name: String(part.name ?? ""),
    brand: String(part.manufacturer ?? ""),
    number: String(part.oem_part_number ?? ""),
    tier,
    reason: fillPlainReason(tier, {
      sisters: item.sisterNames ?? undefined,
      source: item.sourceMake ?? undefined,
      brand: part.manufacturer ?? undefined,
      number: part.oem_part_number ?? undefined,
      oem: item.referenceOem ?? undefined,
    }),
    position: axis(item.position),
    side: sideOf(item.side),
    status: decision === "confirmed" ? "verified" : "needs_checking",
    fitsVariantIds: variantId ? [variantId] : [],
    evidenceUrl: item.evidenceUrl ?? null,
    alsoKnownAs: Array.isArray(item.alsoKnownAs) ? item.alsoKnownAs.filter(Boolean) : [],
  };
}

function mergeFound(groups: FoundPart[][]): FoundPart[] {
  const byId = new Map<string, FoundPart>();
  for (const group of groups) {
    for (const item of group) {
      const key = item.partId || `${item.tier}:${item.number}:${item.name}`;
      const existing = byId.get(key);
      if (!existing) {
        byId.set(key, { ...item, fitsVariantIds: [...item.fitsVariantIds] });
        continue;
      }
      for (const id of item.fitsVariantIds) {
        if (!existing.fitsVariantIds.includes(id)) existing.fitsVariantIds.push(id);
      }
    }
  }
  return [...byId.values()];
}

export function plainSections(items: FoundPart[], legacy: boolean) {
  const source = legacy
    ? items.map((item) => ({ ...item, tier: 1, reason: "Listed for this car." }))
    : items;
  const filled = PART_MATCH_TIERS.map((row) => ({
    tier: row.tier,
    plainLabel: row.plainLabel,
    tag: row.tag,
    plainReason: row.plainReason,
    items: source.filter((item) => item.tier === row.tier),
  })).filter((section) => section.items.length > 0);
  const present = new Set(filled.map((section) => section.tier));
  const emptyTiers = legacy
    ? [2, 3, 4]
    : PART_MATCH_TIERS.map((row) => row.tier).filter((tier) => !present.has(tier));
  return { sections: filled, emptyTiers };
}

function asLabelRow(row: Record<string, unknown>): VariantLabelRow {
  return {
    id: String(row.id ?? ""),
    chassis_code: row.chassis_code == null ? null : String(row.chassis_code),
    engine_code: row.engine_code == null ? null : String(row.engine_code),
    engine_displacement_l: row.engine_displacement_l == null ? null : Number(row.engine_displacement_l),
    fuel_type: row.fuel_type == null ? null : String(row.fuel_type),
    fuel_category: row.fuel_category == null ? null : String(row.fuel_category),
    engine_type: row.engine_type == null ? null : String(row.engine_type),
    drivetrain: row.drivetrain == null ? null : String(row.drivetrain),
    transmission: row.transmission == null ? null : String(row.transmission),
    body_type: row.body_type == null ? null : String(row.body_type),
    trim_series: row.trim_series == null ? null : String(row.trim_series),
  };
}

const VARIANT_COLUMNS = "id, make, model, production_start_year, production_end_year, chassis_code, engine_code, engine_displacement_l, fuel_type, fuel_category, engine_type, drivetrain, transmission, body_type, trim_series";

export async function findParts(
  supabase: SupabaseClient,
  input: {
    make?: string | null;
    model?: string | null;
    year?: number | null;
    variantId?: string | null;
    componentId?: string | null;
    position?: string | null;
    side?: string | null;
    orgId?: string | null;
    downtimePerDay?: number;
  },
  loadCatalog?: (id: string) => Promise<{ mode: "tiered" | "legacy"; items: LoosePart[]; universal: unknown; ready?: boolean }>,
) {
  const make = (input.make ?? "").trim();
  const model = (input.model ?? "").trim();
  const year = input.year != null && Number.isFinite(input.year) ? input.year : null;
  const variantId = (input.variantId ?? "").trim();
  const anyVariant = variantId === "any";
  const componentId = (input.componentId ?? "").trim() || null;
  let query = supabase.from("vehicle_catalog").select(VARIANT_COLUMNS);
  if (variantId && !anyVariant) {
    query = query.eq("id", variantId);
  } else if (make || model || year != null) {
    if (make) query = query.ilike("make", make);
    if (model) query = query.ilike("model", model);
    if (year != null) {
      query = query.lte("production_start_year", year).or(`production_end_year.is.null,production_end_year.gte.${year}`);
    }
    query = query.limit(40);
  } else {
    query = query.limit(0);
  }
  const { data: rows, error } = await query;
  if (error) throw error;
  const variants = (rows || []) as Array<Record<string, unknown>>;
  const labelRows = variants.map(asLabelRow);
  const candidates = variants.map((row, index) => ({
    id: String(row.id ?? ""),
    plainLabel: variantPlainLabel(labelRows[index], labelRows),
    codeLine: variantCodeLine(labelRows[index]),
  }));
  const specificId = variantId && !anyVariant ? variantId : variants.length === 1 ? String(variants[0].id ?? "") : "";
  const searchPool = specificId ? variants.filter((row) => String(row.id) === specificId) : variants.slice(0, CANDIDATE_CAP);
  const searchIds = searchPool.map((row) => String(row.id ?? "")).filter(Boolean);
  const loaded = await Promise.all(searchIds.map(async (id) => {
    if (loadCatalog) {
      const parts = await loadCatalog(id);
      return { id, parts };
    }
    const parts = await getCatalogParts(supabase, id, { componentId, vehicleYear: year });
    return { id, parts: { mode: parts.mode, items: parts.items as LoosePart[], universal: parts.universal, ready: parts.ready } };
  }));
  const mode = loaded.some((row) => row.parts.mode === "legacy") ? "legacy" as const : "tiered" as const;
  const groups = loaded.map((row) => [
    ...(row.parts.items as LoosePart[]).map((item) => toFound(item, row.id)),
    ...universalsToFound(row.parts.universal, row.id),
  ]);
  const partSets = groups.map((group) => group.map((item) => item.partId).filter(Boolean));
  const askVariant = !specificId && !anyVariant && shouldAskVariant(partSets);
  let merged = mergeFound(groups);
  merged = await attachSides(supabase, merged, searchIds);
  merged = keepForPosition(merged, input.position, input.side);
  const built = plainSections(merged, mode === "legacy");
  const bestPool: BestPickItem[] = merged.map((item) => ({
    id: item.partId,
    tier: mode === "legacy" ? 1 : item.tier,
    status: item.status,
  }));
  const best = pickBestPart(
    PART_MATCH_TIERS.map((row) => ({ tier: row.tier, items: bestPool.filter((item) => item.tier === row.tier) })),
    { useStock: false, usePrice: false },
  );
  const picked = specificId ? variants.find((row) => String(row.id) === specificId) ?? variants[0] ?? null : null;
  const pickedId = picked ? String(picked.id ?? "") : "";
  const first = loaded[0]?.parts;
  const sections = first
    ? assembleMatchSections(
      mode === "tiered"
        ? await enrichFleetParts(supabase, "tiered", first.items, input.orgId ?? null, input.downtimePerDay ?? 0) as Array<{ tier?: number; sisterNames?: string | null }>
        : [],
      first.universal,
    )
    : assembleMatchSections([], []);
  let coverage = null;
  if (pickedId) {
    const [{ data: readyRow }, { data: specRows }, { data: listingRows }] = await Promise.all([
      supabase.from("variant_parts_readiness").select("components_ready").eq("variant_id", pickedId).maybeSingle(),
      supabase.from("catalog_spec_value").select("spec_key").eq("vehicle_catalog_id", pickedId),
      supabase.from("part_listing").select("id").eq("vehicle_catalog_id", pickedId),
    ]);
    const essentials = Number((readyRow as { components_ready?: number } | null)?.components_ready ?? 0);
    const specs = new Set((specRows || []).map((row) => String((row as { spec_key?: string }).spec_key ?? ""))).size;
    coverage = {
      essentials,
      essentialsTotal: 10,
      specs,
      specsTotal: 13,
      otherParts: (listingRows || []).length,
    };
  }
  const carRow = picked ?? variants[0] ?? null;
  const body = {
    mode,
    car: carRow ? {
      make: String(carRow.make ?? make),
      model: String(carRow.model ?? model),
      year,
      label: [year, carRow.make, carRow.model].filter(Boolean).join(" "),
    } : null,
    candidates,
    askVariant,
    pickedVariantId: specificId || null,
    variants,
    picked: askVariant ? null : picked,
    sections,
    plainSections: built.sections,
    emptyTiers: built.emptyTiers,
    bestPick: best ? merged.find((item) => item.partId === best.id) ?? null : null,
    ready: first?.ready ?? false,
    coverage,
  };
  if (!input.orgId) assertNoCustomerIdentity(body);
  return body;
}

async function attachSides(supabase: SupabaseClient, items: FoundPart[], variantIds: string[]): Promise<FoundPart[]> {
  if (!items.length || !variantIds.length) return items;
  const { data: listings, error } = await supabase
    .from("part_listing")
    .select("interchange_group_id, side")
    .in("vehicle_catalog_id", variantIds);
  if (error) throw error;
  const groupIds = [...new Set((listings || []).map((row) => String((row as { interchange_group_id?: string }).interchange_group_id || "")).filter(Boolean))];
  if (!groupIds.length) return items;
  const sideByGroup = new Map<string, PartSide>();
  for (const row of listings || []) {
    const groupId = String((row as { interchange_group_id?: string }).interchange_group_id || "");
    if (groupId) sideByGroup.set(groupId, sideOf((row as { side?: string | null }).side));
  }
  const { data: parts, error: partError } = await supabase
    .from("part_master")
    .select("id, interchange_group_id")
    .in("interchange_group_id", groupIds);
  if (partError) throw partError;
  const sideByPart = new Map<string, PartSide>();
  for (const row of parts || []) {
    const id = String((row as { id?: string }).id || "");
    const groupId = String((row as { interchange_group_id?: string }).interchange_group_id || "");
    if (id) sideByPart.set(id, sideByGroup.get(groupId) ?? null);
  }
  return items.map((item) => {
    if (!sideByPart.has(item.partId)) return item;
    return { ...item, side: item.side ?? sideByPart.get(item.partId) ?? null };
  });
}
