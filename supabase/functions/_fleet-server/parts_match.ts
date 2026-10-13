import {
  buildFitMessage,
  landedCostJmd,
  priceIsStale,
  totalImpactJmd,
  usageWriteFailure,
} from "../../../packages/types/src/partsResolution.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type TierRow = {
  tier: number;
  part_id: string;
  part_name: string;
  oem_part_number: string | null;
  manufacturer: string | null;
  part_kind: string;
  fit_scope: string | null;
  rule_source: string | null;
  position: string | null;
  interchange_group_id: string | null;
  maintenance_component_id: string | null;
  category_id: string | null;
  sister_names: string | null;
  source_make: string | null;
  reference_oem: string | null;
  reference_manufacturer: string | null;
  also_known_as: string[] | null;
  confirmed_installs: number | null;
  description: string | null;
};

type OfferRow = {
  id: string;
  supplier_id: string;
  part_id: string;
  supplier_sku: string;
  unit_price: number;
  currency: string;
  moq: number;
  lead_time_days: number | null;
  url: string | null;
  is_active: boolean;
  price_observed_at?: string | null;
  source?: string | null;
  core_charge?: number | null;
  warranty_months?: number | null;
  warranty_km?: number | null;
  organization_id?: string | null;
  freight_estimate?: number | null;
  duty_rate?: number | null;
  fx_rate_to_jmd?: number | null;
  supplier?: {
    id: string;
    name: string;
    default_lead_time_days?: number | null;
    freight_estimate?: number | null;
    duty_rate?: number | null;
    fx_rate_to_jmd?: number | null;
  } | null;
};

export async function loadTieredCompatibleParts(
  supabase: SupabaseClient,
  catalogId: string,
  componentId: string | null,
  organizationId: string | null,
  downtimePerDay: number,
): Promise<{ items: Record<string, unknown>[] }> {
  const { data, error } = await supabase.rpc("parts_for_vehicle", {
    p_catalog_id: catalogId,
    p_component_id: componentId,
  });
  if (error) throw error;
  const rows = (data || []) as TierRow[];
  const partIds = [...new Set(rows.map((r) => r.part_id))];
  const offersByPart: Record<string, OfferRow[]> = {};
  const stockByPart: Record<string, number> = {};
  if (partIds.length) {
    const { data: offers, error: offErr } = await supabase
      .from("supplier_part_offer")
      .select(
        "id, supplier_id, part_id, supplier_sku, unit_price, currency, moq, lead_time_days, url, is_active, price_observed_at, source, core_charge, warranty_months, warranty_km, organization_id, freight_estimate, duty_rate, fx_rate_to_jmd, supplier ( id, name, default_lead_time_days, freight_estimate, duty_rate, fx_rate_to_jmd )",
      )
      .in("part_id", partIds)
      .eq("is_active", true);
    if (offErr) throw offErr;
    for (const raw of offers || []) {
      const o = raw as unknown as OfferRow;
      if (o.organization_id && organizationId && o.organization_id !== organizationId) continue;
      if (o.organization_id && !organizationId) continue;
      if (!offersByPart[o.part_id]) offersByPart[o.part_id] = [];
      offersByPart[o.part_id].push(o);
    }
    if (organizationId) {
      const { data: stock, error: stockErr } = await supabase
        .from("org_part_stock")
        .select("part_id, qty")
        .eq("organization_id", organizationId)
        .in("part_id", partIds);
      if (stockErr) throw stockErr;
      for (const s of stock || []) {
        const pid = String((s as { part_id: string }).part_id);
        stockByPart[pid] = (stockByPart[pid] ?? 0) + Number((s as { qty: number }).qty || 0);
      }
    }
  }

  const items = rows.map((row) => {
    const stockQty = stockByPart[row.part_id] ?? 0;
    const tier = stockQty > 0 ? 0 : row.tier;
    const message = buildFitMessage({
      tier,
      fitScope: row.fit_scope,
      sisterNames: row.sister_names,
      sourceMake: row.source_make,
      manufacturer: row.manufacturer,
      referenceOem: row.reference_oem,
      confirmedInstalls: row.confirmed_installs ?? 0,
      stockQty,
    });
    const offers = (offersByPart[row.part_id] ?? []).map((o) => {
      const supplier = o.supplier;
      const landed = landedCostJmd({
        unitPrice: Number(o.unit_price) || 0,
        currency: o.currency || "USD",
        fxRateToJmd: o.fx_rate_to_jmd ?? supplier?.fx_rate_to_jmd,
        dutyRate: o.duty_rate ?? supplier?.duty_rate,
        freightEstimate: o.freight_estimate ?? supplier?.freight_estimate,
      });
      const lead = o.lead_time_days ?? supplier?.default_lead_time_days ?? 0;
      return {
        ...o,
        landedCostJmd: landed,
        totalImpactJmd: totalImpactJmd(landed, lead ?? 0, downtimePerDay),
        priceStale: priceIsStale(o.price_observed_at),
      };
    }).sort((a, b) => a.totalImpactJmd - b.totalImpactJmd);
    return {
      fitmentId: row.part_id,
      tier,
      tierLabel: message.tierLabel,
      matchReason: message.matchReason,
      confirmedFit: message.confirmedFit,
      confirmedInstalls: row.confirmed_installs ?? 0,
      position: row.position,
      ruleSource: row.rule_source,
      alsoKnownAs: row.also_known_as ?? [],
      stockQty,
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
      },
      offers,
    };
  });
  items.sort((a, b) => a.tier - b.tier || String(a.part.name).localeCompare(String(b.part.name)));
  return { items };
}

export async function commitPartsUsage(
  supabase: SupabaseClient,
  workOrderId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("apply_parts_usage_for_work_order", {
    p_work_order_id: workOrderId,
  });
  const failure = usageWriteFailure(error);
  if (failure) throw new Error(failure);
  return (data ?? { ok: true, warrantyPrompts: [] }) as Record<string, unknown>;
}
