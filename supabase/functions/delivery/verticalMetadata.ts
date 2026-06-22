/**
 * Server-side vertical metadata helpers (mirrors @roam/vertical-config for Deno edge).
 */

export const BASE_DOCUMENT_TYPES = ["id_front", "id_back", "proof_of_business"] as const;

export const REGULATED_VERTICALS = new Set(["pharmacy", "alcohol"]);

export type VerticalType =
  | "restaurant"
  | "grocery"
  | "pharmacy"
  | "alcohol"
  | "convenience"
  | "retail";

export type GoLiveRule = "menu_min_5" | "catalog_imported" | "pos_connected";

export interface BusinessTypeMetadata {
  id: string;
  vertical_type: VerticalType;
  fulfillment_type: "cook_to_order" | "pick_and_pack";
  required_document_types: string[];
  compliance_tier: "standard" | "regulated";
  go_live_rule: GoLiveRule;
  default_prep_time_mins: number;
  max_delivery_radius_km: number;
  category_taxonomy_key: "cuisine" | "inventory_category" | "none";
}

export function defaultBusinessTypeMetadata(id = "restaurant"): BusinessTypeMetadata {
  return {
    id,
    vertical_type: "restaurant",
    fulfillment_type: "cook_to_order",
    required_document_types: [...BASE_DOCUMENT_TYPES],
    compliance_tier: "standard",
    go_live_rule: "menu_min_5",
    default_prep_time_mins: 15,
    max_delivery_radius_km: 5,
    category_taxonomy_key: "cuisine",
  };
}

export function resolveVerticalType(
  vertical: string | null | undefined,
): VerticalType {
  if (
    vertical === "grocery" ||
    vertical === "pharmacy" ||
    vertical === "alcohol" ||
    vertical === "convenience" ||
    vertical === "retail"
  ) {
    return vertical;
  }
  return "restaurant";
}

export function resolveGoLiveRule(
  rule: string | null | undefined,
): GoLiveRule {
  if (rule === "catalog_imported" || rule === "pos_connected") return rule;
  return "menu_min_5";
}

export function merchantVerticalFromRow(row: Record<string, unknown>): VerticalType {
  return resolveVerticalType(row.vertical_type as string | null | undefined);
}

export function merchantGoLiveRuleFromRow(row: Record<string, unknown>): GoLiveRule {
  return resolveGoLiveRule(row.go_live_rule as string | null | undefined);
}

export function rowToBusinessTypeMetadata(
  row: Record<string, unknown> | null | undefined,
): BusinessTypeMetadata {
  if (!row) return defaultBusinessTypeMetadata();
  const required = Array.isArray(row.required_document_types)
    ? (row.required_document_types as string[]).filter(Boolean)
    : [...BASE_DOCUMENT_TYPES];
  return {
    id: String(row.id || "restaurant"),
    vertical_type: resolveVerticalType(String(row.vertical_type || "restaurant")),
    fulfillment_type: row.fulfillment_type === "pick_and_pack" ? "pick_and_pack" : "cook_to_order",
    required_document_types: required.length ? required : [...BASE_DOCUMENT_TYPES],
    compliance_tier: row.compliance_tier === "regulated" ? "regulated" : "standard",
    go_live_rule: resolveGoLiveRule(String(row.go_live_rule || "menu_min_5")),
    default_prep_time_mins: Number(row.default_prep_time_mins) || 15,
    max_delivery_radius_km: Number(row.max_delivery_radius_km) || 5,
    category_taxonomy_key: row.category_taxonomy_key === "inventory_category"
      ? "inventory_category"
      : row.category_taxonomy_key === "none"
      ? "none"
      : "cuisine",
  };
}

export function verticalSnapshotFromMetadata(meta: BusinessTypeMetadata) {
  return {
    vertical_type: meta.vertical_type,
    fulfillment_type: meta.fulfillment_type,
    go_live_rule: meta.go_live_rule,
  };
}

export function allowedDocumentTypesForMerchant(
  meta: BusinessTypeMetadata,
  enableRegulatedUploads: boolean,
): Set<string> {
  const allowed = new Set<string>(BASE_DOCUMENT_TYPES);
  if (!enableRegulatedUploads) return allowed;
  for (const doc of meta.required_document_types) {
    allowed.add(doc);
  }
  return allowed;
}

export const CATALOG_GO_LIVE_MIN_ITEMS = 50;
