/**
 * Aggregate haulage line specs into manifest totals.
 */
import type { HaulageVariantRow } from "./catalogDb.ts";

export type ResolvedHaulageLine = HaulageVariantRow & {
  qty: number;
  item_title: string;
  requires_manual_specs: boolean;
  line_key: string;
};

const REFERENCE_VAN_VOLUME_CM3 = 280 * 170 * 180;

export type AggregatedManifest = {
  total_weight_kg: number;
  total_volume_cm3: number;
  max_length_cm: number;
  max_height_cm: number;
  min_body_type_slug: string | null;
  upright_required: boolean;
  recommended_gear: string[];
  manifest_summary: string;
  fill_percent: number;
  lines: {
    item_id: string;
    variant_id: string;
    qty: number;
    label: string;
    item_title: string;
    weight_kg: number;
    length_cm: number | null;
    width_cm: number | null;
    height_cm: number | null;
    fragile: boolean;
    requires_disassembly: boolean;
    upright_only: boolean;
  }[];
};

const BODY_PRIORITY: Record<string, number> = {
  sedan: 10,
  suv: 20,
  pickup: 30,
  "cargo-van": 40,
  "box-truck": 50,
};

function bodyPriority(slug: string | null): number {
  if (!slug) return 0;
  return BODY_PRIORITY[slug.trim().toLowerCase()] ?? 25;
}

function pickHigherTier(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return bodyPriority(a) >= bodyPriority(b) ? a : b;
}

export function aggregateHaulageManifest(lines: ResolvedHaulageLine[]): AggregatedManifest {
  let total_weight_kg = 0;
  let total_volume_cm3 = 0;
  let max_length_cm = 0;
  let max_height_cm = 0;
  let min_body_type_slug: string | null = null;
  let upright_required = false;
  const gear = new Set<string>();
  const summaryParts: string[] = [];

  const outLines = lines.map((line) => {
    const qty = line.qty;
    const weight = Number(line.weight_kg) * qty;
    total_weight_kg += weight;
    const l = line.length_cm != null ? Number(line.length_cm) : 0;
    const w = line.width_cm != null ? Number(line.width_cm) : 0;
    const h = line.height_cm != null ? Number(line.height_cm) : 0;
    if (l > 0 && w > 0 && h > 0) {
      total_volume_cm3 += l * w * h * qty;
      max_length_cm = Math.max(max_length_cm, l);
      max_height_cm = Math.max(max_height_cm, h);
    }
    min_body_type_slug = pickHigherTier(min_body_type_slug, line.min_body_type_slug);
    if (line.upright_only) upright_required = true;
    for (const g of line.gear_tags ?? []) gear.add(g);
    if (weight > 80) {
      gear.add("dolly");
      gear.add("straps");
    }
    summaryParts.push(`${qty}× ${line.label} ${line.item_title}`);
    return {
      item_id: line.item_id,
      variant_id: line.id,
      qty,
      label: line.label,
      item_title: line.item_title,
      weight_kg: Number(line.weight_kg),
      length_cm: line.length_cm != null ? Number(line.length_cm) : null,
      width_cm: line.width_cm != null ? Number(line.width_cm) : null,
      height_cm: line.height_cm != null ? Number(line.height_cm) : null,
      fragile: line.fragile_default,
      requires_disassembly: line.requires_disassembly_default,
      upright_only: line.upright_only,
    };
  });

  const fill_percent = Math.min(
    100,
    Math.round((total_volume_cm3 / REFERENCE_VAN_VOLUME_CM3) * 1000) / 10,
  );

  return {
    total_weight_kg: Math.round(total_weight_kg * 100) / 100,
    total_volume_cm3: Math.round(total_volume_cm3),
    max_length_cm,
    max_height_cm,
    min_body_type_slug,
    upright_required,
    recommended_gear: [...gear],
    manifest_summary: summaryParts.join(", "),
    fill_percent,
    lines: outLines,
  };
}
