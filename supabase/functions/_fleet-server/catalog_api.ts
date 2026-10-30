/**
 * Read-only vehicle catalog contract. Reference prices only.
 * Fleet apps add their own stock and negotiated prices after this.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { decodeFrameNumber } from "../../../packages/types/src/frameNumberDecode.ts";
import { buildFitMessage, landedCostJmd, PART_MATCH_TIERS, priceIsStale, totalImpactJmd } from "../../../packages/types/src/partsResolution.ts";
import { resolveVehicleCatalogIdFromMakeModelYear } from "./vehicle_catalog_resolve.ts";
import { FEATURE_FLAGS, getFeatureFlag } from "./feature_flags.ts";
import {
  type CatalogOffer,
  type CatalogPartItem,
  offersForFleet,
  referenceOffersOnly,
  selectPartsMode,
} from "./catalog_parts_shape.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function normCode(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim().toUpperCase();
}

function yearInRange(yearFrom: number | null | undefined, yearTo: number | null | undefined, vehicleYear: number | null): boolean {
  if (vehicleYear == null || !Number.isFinite(vehicleYear)) return true;
  if (yearFrom != null && Number.isFinite(yearFrom) && vehicleYear < yearFrom) return false;
  if (yearTo != null && Number.isFinite(yearTo) && vehicleYear > yearTo) return false;
  return true;
}

const OFFER_SELECT =
  "id, supplier_id, part_id, supplier_sku, unit_price, currency, moq, lead_time_days, url, is_active, price_observed_at, source, core_charge, warranty_months, warranty_km, organization_id, freight_estimate, duty_rate, fx_rate_to_jmd, supplier ( id, name, default_lead_time_days, freight_estimate, duty_rate, fx_rate_to_jmd )";

const FITMENT_SELECT =
  "id, part_id, vehicle_catalog_id, chassis_code, engine_code, year_from, year_to, part_master ( id, category_id, maintenance_component_id, name, oem_part_number, description, metadata, manufacturer, part_kind, catalog_decision, part_category ( id, slug, label, parent_id, sort_order ) )";

export async function tieredSearchKilled(): Promise<boolean> {
  const flag = await getFeatureFlag(FEATURE_FLAGS.PARTS_TIERED_SEARCH);
  return flag?.enabled === true;
}

export async function variantIsReady(supabase: SupabaseClient, catalogId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("variant_parts_readiness")
    .select("ready")
    .eq("variant_id", catalogId)
    .maybeSingle();
  if (error) return false;
  return Boolean((data as { ready?: boolean } | null)?.ready);
}

async function loadOffers(supabase: SupabaseClient, partIds: string[]): Promise<CatalogOffer[]> {
  if (!partIds.length) return [];
  const { data, error } = await supabase.from("supplier_part_offer").select(OFFER_SELECT).in("part_id", partIds).eq("is_active", true);
  if (error) throw error;
  return (data || []) as unknown as CatalogOffer[];
}

export async function getCatalogVariant(supabase: SupabaseClient, catalogId: string) {
  const { data, error } = await supabase.from("vehicle_catalog").select("*").eq("id", catalogId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const platformId = row.platform_id ? String(row.platform_id) : null;
  const engineId = row.engine_family_id ? String(row.engine_family_id) : null;
  const [{ data: platform }, { data: engine }, { data: siblings }, { data: sameEngine }] = await Promise.all([
    platformId
      ? supabase.from("vehicle_platform").select("id, code, label, parent_id").eq("id", platformId).maybeSingle()
      : Promise.resolve({ data: null }),
    engineId
      ? supabase.from("engine_family").select("id, code, displacement_cc, fuel_type").eq("id", engineId).maybeSingle()
      : Promise.resolve({ data: null }),
    platformId
      ? supabase.from("vehicle_catalog").select("id, make, model").eq("platform_id", platformId).neq("id", catalogId).limit(40)
      : Promise.resolve({ data: [] }),
    engineId
      ? supabase.from("vehicle_catalog").select("id, make, model").eq("engine_family_id", engineId).neq("id", catalogId).limit(40)
      : Promise.resolve({ data: [] }),
  ]);
  let family: Record<string, unknown> | null = null;
  const parentId = (platform as { parent_id?: string | null } | null)?.parent_id;
  if (parentId) {
    const { data: parent } = await supabase.from("vehicle_platform").select("id, code, label").eq("id", parentId).maybeSingle();
    family = (parent as Record<string, unknown> | null) ?? null;
  }
  const nameOf = (item: { make?: string; model?: string }) => `${item.make ?? ""} ${item.model ?? ""}`.trim();
  return {
    variant: row,
    platform: platform ?? null,
    family,
    engine: engine ?? null,
    siblings: ((siblings || []) as Array<{ make?: string; model?: string }>).map(nameOf),
    sameEngine: ((sameEngine || []) as Array<{ make?: string; model?: string }>).map(nameOf),
  };
}

type TierRow = {
  tier: number;
  part_id: string;
  part_name: string;
  oem_part_number: string | null;
  manufacturer: string | null;
  part_kind: string;
  fit_scope: string | null;
  rule_source: string | null;
  position: string | null;
  maintenance_component_id: string | null;
  category_id: string | null;
  sister_names: string | null;
  source_make: string | null;
  reference_oem: string | null;
  also_known_as: string[] | null;
  confirmed_installs: number | null;
  description: string | null;
};

async function decisionsFor(supabase: SupabaseClient, partIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!partIds.length) return map;
  const { data, error } = await supabase.from("part_master").select("id, catalog_decision").in("id", partIds);
  if (error) throw error;
  for (const row of data || []) {
    map.set(String((row as { id: string }).id), String((row as { catalog_decision?: string }).catalog_decision ?? "pending"));
  }
  return map;
}

async function loadTieredReferenceParts(
  supabase: SupabaseClient,
  catalogId: string,
  componentId: string | null,
  vehicleYear: number | null,
): Promise<CatalogPartItem[]> {
  const { data, error } = await supabase.rpc("parts_for_vehicle", {
    p_catalog_id: catalogId,
    p_component_id: componentId,
    p_vehicle_year: vehicleYear,
  });
  if (error) throw error;
  const rows = (data || []) as TierRow[];
  const partIds = [...new Set(rows.map((row) => row.part_id))];
  const [offers, decisions] = await Promise.all([loadOffers(supabase, partIds), decisionsFor(supabase, partIds)]);
  const offersByPart: Record<string, CatalogOffer[]> = {};
  for (const offer of referenceOffersOnly(offers)) {
    if (!offersByPart[offer.part_id]) offersByPart[offer.part_id] = [];
    offersByPart[offer.part_id].push(offer);
  }
  return rows.map((row) => ({
    fitmentId: row.part_id,
    tier: row.tier,
    catalogDecision: decisions.get(row.part_id) ?? "pending",
    ruleSource: row.rule_source,
    position: row.position,
    alsoKnownAs: row.also_known_as ?? [],
    sisterNames: row.sister_names,
    sourceMake: row.source_make,
    referenceOem: row.reference_oem,
    confirmedInstalls: row.confirmed_installs ?? 0,
    fitScope: row.fit_scope,
    part: {
      id: row.part_id,
      category_id: row.category_id,
      name: row.part_name,
      oem_part_number: row.oem_part_number,
      description: row.description,
      manufacturer: row.manufacturer,
      part_kind: row.part_kind,
      metadata: {},
      maintenance_component_id: row.maintenance_component_id,
      catalog_decision: decisions.get(row.part_id) ?? "pending",
    },
    offers: offersByPart[row.part_id] ?? [],
  }));
}

async function loadLegacyReferenceParts(
  supabase: SupabaseClient,
  catalogId: string,
  componentId: string | null,
  categoryId: string | null,
  vehicleYear: number | null,
  hintChassis: string,
  hintEngine: string,
): Promise<CatalogPartItem[]> {
  const { data: catRow, error: catErr } = await supabase
    .from("vehicle_catalog")
    .select("id, chassis_code, engine_code")
    .eq("id", catalogId)
    .maybeSingle();
  if (catErr) throw catErr;
  const catalogChassis = String((catRow as { chassis_code?: string } | null)?.chassis_code ?? "");
  const catalogEngine = String((catRow as { engine_code?: string } | null)?.engine_code ?? "");
  const { data: fitRows, error: fitErr } = await supabase.from("part_fitment").select(FITMENT_SELECT).eq("vehicle_catalog_id", catalogId);
  if (fitErr) throw fitErr;
  type FitRow = {
    id: string;
    part_id: string;
    chassis_code?: string | null;
    engine_code?: string | null;
    year_from?: number | null;
    year_to?: number | null;
    part_master: Record<string, unknown> | null;
  };
  const matched: FitRow[] = [];
  for (const raw of fitRows || []) {
    const row = raw as unknown as FitRow;
    if (!row.part_master) continue;
    const component = row.part_master.maintenance_component_id ? String(row.part_master.maintenance_component_id) : "";
    const category = row.part_master.category_id ? String(row.part_master.category_id) : "";
    if (componentId && component !== componentId) continue;
    if (categoryId && category !== categoryId) continue;
    const chassis = normCode(row.chassis_code);
    const engine = normCode(row.engine_code);
    if (chassis && chassis !== normCode(catalogChassis) && chassis !== hintChassis) continue;
    if (engine && engine !== normCode(catalogEngine) && engine !== hintEngine) continue;
    if (!yearInRange(row.year_from, row.year_to, vehicleYear)) continue;
    matched.push(row);
  }
  const partIds = [...new Set(matched.map((row) => row.part_id))];
  const offers = referenceOffersOnly(await loadOffers(supabase, partIds));
  const offersByPart: Record<string, CatalogOffer[]> = {};
  for (const offer of offers) {
    if (!offersByPart[offer.part_id]) offersByPart[offer.part_id] = [];
    offersByPart[offer.part_id].push(offer);
  }
  return matched.map((row) => ({
    fitmentId: row.id,
    catalogDecision: row.part_master?.catalog_decision != null ? String(row.part_master.catalog_decision) : null,
    part: row.part_master as Record<string, unknown>,
    offers: offersByPart[row.part_id] ?? [],
  }));
}

export async function getCatalogParts(
  supabase: SupabaseClient,
  catalogId: string,
  input: {
    componentId?: string | null;
    categoryId?: string | null;
    vehicleYear?: number | null;
    hintChassis?: string;
    hintEngine?: string;
    killed?: boolean;
  },
) {
  const componentId = input.componentId && isUuid(input.componentId) ? input.componentId : null;
  const categoryId = input.categoryId && isUuid(input.categoryId) ? input.categoryId : null;
  const ready = await variantIsReady(supabase, catalogId);
  const killed = input.killed ?? await tieredSearchKilled();
  const mode = selectPartsMode({ killed });
  const items = mode === "tiered"
    ? await loadTieredReferenceParts(supabase, catalogId, componentId, input.vehicleYear ?? null)
    : await loadLegacyReferenceParts(
      supabase,
      catalogId,
      componentId,
      categoryId,
      input.vehicleYear ?? null,
      normCode(input.hintChassis),
      normCode(input.hintEngine),
    );
  const filtered = categoryId && mode === "tiered"
    ? items.filter((item) => String(item.part.category_id ?? "") === categoryId)
    : items;
  const universal = await loadUniversalSection(supabase, catalogId, input.vehicleYear ?? null);
  const relatedSupplies = await loadRelatedSupplies(supabase);
  const sections = PART_MATCH_TIERS.map((row) => ({
    tier: row.tier,
    label: row.label,
    items: row.tier === 5
      ? universal
      : filtered.filter((item) => item.tier === row.tier),
  }));
  return { mode, ready, items: filtered, universal, relatedSupplies, sections };
}

/** Five sections, built after fleet stock and fit text are attached. */
export function assembleMatchSections(
  items: Array<{ tier?: number; sisterNames?: string | null }>,
  universal: unknown,
) {
  const universalRows = Array.isArray(universal) ? universal as Array<Record<string, unknown>> : [];
  return PART_MATCH_TIERS.map((row) => {
    if (row.tier === 5) {
      return {
        tier: 5,
        label: row.label,
        sisterNames: null as string | null,
        items: universalRows.map((spec) => ({
          spec: spec.label ?? spec.spec ?? spec.specKey,
          value: spec.value,
          unit: spec.unit ?? null,
          items: Array.isArray(spec.items) ? spec.items : [],
          specKey: spec.specKey ?? null,
          label: spec.label ?? null,
        })),
      };
    }
    const tierItems = items.filter((item) => Number(item.tier) === row.tier);
    const sisterNames = row.tier === 2
      ? [...new Set(tierItems.map((item) => String(item.sisterNames ?? "").trim()).filter(Boolean))].join(", ")
      : null;
    return { tier: row.tier, label: row.label, sisterNames, items: tierItems };
  });
}

async function loadUniversalSection(supabase: SupabaseClient, catalogId: string, vehicleYear: number | null) {
  const { data, error } = await supabase.rpc("universal_section_for_variant", {
    p_catalog_id: catalogId,
    p_vehicle_year: vehicleYear,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function loadRelatedSupplies(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("component_related_supply")
    .select("id, component_id, supply_name, note");
  if (error) throw error;
  return data || [];
}

function priceOffer(offer: CatalogOffer, downtimePerDay: number) {
  const supplier = offer.supplier;
  const landed = landedCostJmd({
    unitPrice: Number(offer.unit_price) || 0,
    currency: offer.currency || "USD",
    fxRateToJmd: offer.fx_rate_to_jmd ?? supplier?.fx_rate_to_jmd,
    dutyRate: offer.duty_rate ?? supplier?.duty_rate,
    freightEstimate: offer.freight_estimate ?? supplier?.freight_estimate,
  });
  const lead = offer.lead_time_days ?? supplier?.default_lead_time_days ?? 0;
  return {
    ...offer,
    landedCostJmd: landed,
    totalImpactJmd: totalImpactJmd(landed, lead ?? 0, downtimePerDay),
    priceStale: priceIsStale(offer.price_observed_at),
  };
}

/** Adds this fleet's stock and negotiated prices. Catalog items stay reference-only. */
export async function enrichFleetParts(
  supabase: SupabaseClient,
  mode: "tiered" | "legacy",
  items: CatalogPartItem[],
  organizationId: string | null,
  downtimePerDay: number,
) {
  const partIds = [...new Set(items.map((item) => String(item.part.id ?? item.fitmentId)))];
  const orgOffers = offersForFleet(await loadOffers(supabase, partIds), organizationId).filter((offer) => offer.organization_id);
  const orgByPart: Record<string, CatalogOffer[]> = {};
  for (const offer of orgOffers) {
    if (!orgByPart[offer.part_id]) orgByPart[offer.part_id] = [];
    orgByPart[offer.part_id].push(offer);
  }
  const stockByPart: Record<string, number> = {};
  if (organizationId && partIds.length) {
    const { data, error } = await supabase.from("org_part_stock").select("part_id, qty").eq("organization_id", organizationId).in("part_id", partIds);
    if (error) throw error;
    for (const row of data || []) {
      const pid = String((row as { part_id: string }).part_id);
      stockByPart[pid] = (stockByPart[pid] ?? 0) + Number((row as { qty: number }).qty || 0);
    }
  }
  if (mode === "legacy") {
    return items.map((item) => {
      const pid = String(item.part.id ?? "");
      const offers = [...item.offers, ...(orgByPart[pid] ?? [])].map((offer) => priceOffer(offer, downtimePerDay));
      return { fitmentId: item.fitmentId, part: item.part, offers };
    });
  }
  const shaped = items.map((item) => {
    const pid = String(item.part.id ?? "");
    const stockQty = stockByPart[pid] ?? 0;
    const tier = item.tier ?? 4;
    const message = buildFitMessage({
      tier,
      fitScope: item.fitScope ?? null,
      sisterNames: item.sisterNames ?? null,
      sourceMake: item.sourceMake ?? null,
      manufacturer: item.part.manufacturer != null ? String(item.part.manufacturer) : null,
      referenceOem: item.referenceOem ?? null,
      confirmedInstalls: item.confirmedInstalls ?? 0,
      stockQty,
    });
    const offers = [...item.offers, ...(orgByPart[pid] ?? [])]
      .map((offer) => priceOffer(offer, downtimePerDay))
      .sort((a, b) => a.totalImpactJmd - b.totalImpactJmd);
    return {
      fitmentId: item.fitmentId,
      tier,
      tierLabel: message.tierLabel,
      matchReason: message.matchReason,
      confirmedFit: message.confirmedFit,
      confirmedInstalls: item.confirmedInstalls ?? 0,
      position: item.position ?? null,
      ruleSource: item.ruleSource ?? null,
      alsoKnownAs: item.alsoKnownAs ?? [],
      sisterNames: item.sisterNames ?? null,
      stockQty,
      catalogDecision: item.catalogDecision ?? null,
      part: item.part,
      offers,
    };
  });
  shaped.sort((a, b) => a.tier - b.tier || String(a.part.name).localeCompare(String(b.part.name)));
  return shaped;
}

export async function overlayUniversalStock(
  supabase: SupabaseClient,
  universal: unknown,
  organizationId: string | null,
) {
  const sections = Array.isArray(universal) ? universal as Array<Record<string, unknown>> : [];
  const ids = sections.flatMap((section) => {
    const items = Array.isArray(section.items) ? section.items as Array<Record<string, unknown>> : [];
    return items.map((item) => String(item.id ?? "")).filter((id) => id.length > 0);
  });
  const stockById: Record<string, number> = {};
  if (organizationId && ids.length) {
    const { data, error } = await supabase
      .from("org_part_stock")
      .select("universal_part_id, qty")
      .eq("organization_id", organizationId)
      .in("universal_part_id", ids);
    if (error) throw error;
    for (const row of data || []) {
      const id = String((row as { universal_part_id: string }).universal_part_id);
      stockById[id] = (stockById[id] ?? 0) + Number((row as { qty: number }).qty || 0);
    }
  }
  return sections.map((section) => {
    const items = Array.isArray(section.items) ? section.items as Array<Record<string, unknown>> : [];
    return {
      specKey: section.specKey ?? section.spec_key,
      label: section.label,
      value: section.value ?? section.spec_value,
      unit: section.unit,
      items: items.map((item) => {
        const stockQty = stockById[String(item.id ?? "")] ?? 0;
        return { ...item, stockQty, inYourStock: stockQty > 0 };
      }),
    };
  });
}

export async function getCatalogSchedule(supabase: SupabaseClient, catalogId: string, vehicleYear: number | null) {
  const { data, error } = await supabase.rpc("schedule_for_variant", {
    p_catalog_id: catalogId,
    p_vehicle_year: vehicleYear,
  });
  if (error) {
    return { items: [], pending: true };
  }
  return { items: data || [], pending: false };
}

export async function getCatalogServiceKit(supabase: SupabaseClient, catalogId: string, taskCode: string | null) {
  const schedule = await getCatalogSchedule(supabase, catalogId, null);
  const tasks = (schedule.items as Array<Record<string, unknown>>).filter((row) => {
    if (!taskCode) return true;
    return String(row.task_code ?? "") === taskCode;
  });
  const kits = [];
  for (const task of tasks) {
    const componentId = task.component_id ? String(task.component_id) : null;
    const parts = componentId
      ? await loadTieredReferenceParts(supabase, catalogId, componentId, null)
      : [];
    kits.push({
      task,
      parts: parts.filter((part) => part.catalogDecision === "confirmed"),
    });
  }
  return { items: kits, pending: schedule.pending };
}

export async function resolveCatalogVariant(
  supabase: SupabaseClient,
  input: {
    make?: string;
    model?: string;
    year?: string;
    chassis?: string;
    engine?: string;
    frameNumber?: string;
  },
) {
  const decoded = input.frameNumber ? decodeFrameNumber(input.frameNumber) : null;
  const make = String(input.make ?? "").trim();
  const model = String(input.model ?? "").trim();
  const year = String(input.year ?? decoded?.vinYear ?? "").trim();
  const chassis = String(input.chassis ?? decoded?.chassisPrefix ?? "").trim();
  const engine = String(input.engine ?? decoded?.enginePrefix ?? "").trim();
  if (!make || !model || !year) {
    return { variantId: null, confidence: decoded ? decoded.confidence : "low", decoded };
  }
  const variantId = await resolveVehicleCatalogIdFromMakeModelYear(supabase, make, model, year, {
    chassis_code: chassis || null,
    engine_code: engine || null,
  });
  return {
    variantId,
    confidence: variantId ? (chassis || engine ? "high" : "medium") : "low",
    decoded,
  };
}
