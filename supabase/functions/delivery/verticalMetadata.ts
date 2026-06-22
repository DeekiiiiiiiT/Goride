/**
 * Server-side vertical metadata helpers (mirrors @roam/vertical-config for Deno edge).
 */

export const BASE_DOCUMENT_TYPES = ["id_front", "id_back", "proof_of_business"] as const;

export const MERCHANT_DOCUMENT_TYPE_ALLOWLIST = new Set([
  ...BASE_DOCUMENT_TYPES,
  "liquor_license",
  "pharmacy_permit",
]);

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

/** Keep in sync with @roam/vertical-config VERTICAL_PRESET_TABLE */
const VERTICAL_PRESETS: Record<VerticalType, Omit<BusinessTypeMetadata, "id">> = {
  restaurant: {
    vertical_type: "restaurant",
    fulfillment_type: "cook_to_order",
    required_document_types: [...BASE_DOCUMENT_TYPES],
    compliance_tier: "standard",
    go_live_rule: "menu_min_5",
    default_prep_time_mins: 15,
    max_delivery_radius_km: 5,
    category_taxonomy_key: "cuisine",
  },
  grocery: {
    vertical_type: "grocery",
    fulfillment_type: "pick_and_pack",
    required_document_types: [...BASE_DOCUMENT_TYPES],
    compliance_tier: "standard",
    go_live_rule: "catalog_imported",
    default_prep_time_mins: 30,
    max_delivery_radius_km: 15,
    category_taxonomy_key: "inventory_category",
  },
  convenience: {
    vertical_type: "convenience",
    fulfillment_type: "pick_and_pack",
    required_document_types: [...BASE_DOCUMENT_TYPES],
    compliance_tier: "standard",
    go_live_rule: "catalog_imported",
    default_prep_time_mins: 20,
    max_delivery_radius_km: 10,
    category_taxonomy_key: "inventory_category",
  },
  retail: {
    vertical_type: "retail",
    fulfillment_type: "pick_and_pack",
    required_document_types: [...BASE_DOCUMENT_TYPES],
    compliance_tier: "standard",
    go_live_rule: "catalog_imported",
    default_prep_time_mins: 25,
    max_delivery_radius_km: 10,
    category_taxonomy_key: "inventory_category",
  },
  pharmacy: {
    vertical_type: "pharmacy",
    fulfillment_type: "pick_and_pack",
    required_document_types: [...BASE_DOCUMENT_TYPES, "pharmacy_permit"],
    compliance_tier: "regulated",
    go_live_rule: "catalog_imported",
    default_prep_time_mins: 30,
    max_delivery_radius_km: 10,
    category_taxonomy_key: "inventory_category",
  },
  alcohol: {
    vertical_type: "alcohol",
    fulfillment_type: "pick_and_pack",
    required_document_types: [...BASE_DOCUMENT_TYPES, "liquor_license"],
    compliance_tier: "regulated",
    go_live_rule: "catalog_imported",
    default_prep_time_mins: 25,
    max_delivery_radius_km: 10,
    category_taxonomy_key: "inventory_category",
  },
};

export function getVerticalPresetForEdge(vertical: VerticalType): Omit<BusinessTypeMetadata, "id"> {
  const v = resolveVerticalType(vertical);
  return {
    ...VERTICAL_PRESETS[v],
    required_document_types: [...VERTICAL_PRESETS[v].required_document_types],
  };
}

export function normalizeRequiredDocs(
  docs: string[] | undefined,
  vertical?: VerticalType | string | null,
): string[] {
  const merged = new Set<string>(BASE_DOCUMENT_TYPES);
  for (const doc of docs ?? []) {
    if (MERCHANT_DOCUMENT_TYPE_ALLOWLIST.has(doc)) merged.add(doc);
  }
  const v = vertical ? resolveVerticalType(vertical) : null;
  if (v === "pharmacy") merged.add("pharmacy_permit");
  if (v === "alcohol") merged.add("liquor_license");
  return [...merged];
}

export function defaultBusinessTypeMetadata(id = "restaurant"): BusinessTypeMetadata {
  const preset = getVerticalPresetForEdge("restaurant");
  return { id, ...preset };
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
  const vertical = resolveVerticalType(String(row.vertical_type || "restaurant"));
  const preset = getVerticalPresetForEdge(vertical);
  const required = normalizeRequiredDocs(
    Array.isArray(row.required_document_types)
      ? (row.required_document_types as string[]).filter(Boolean)
      : undefined,
    vertical,
  );
  const compliance = REGULATED_VERTICALS.has(vertical)
    ? "regulated"
    : row.compliance_tier === "regulated"
    ? "regulated"
    : "standard";
  return {
    id: String(row.id || "restaurant"),
    vertical_type: vertical,
    fulfillment_type: row.fulfillment_type === "pick_and_pack" ? "pick_and_pack" : preset.fulfillment_type,
    required_document_types: required.length ? required : [...preset.required_document_types],
    compliance_tier: compliance,
    go_live_rule: resolveGoLiveRule(String(row.go_live_rule || preset.go_live_rule)),
    default_prep_time_mins: Number(row.default_prep_time_mins) || preset.default_prep_time_mins,
    max_delivery_radius_km: Number(row.max_delivery_radius_km) || preset.max_delivery_radius_km,
    category_taxonomy_key: row.category_taxonomy_key === "inventory_category"
      ? "inventory_category"
      : row.category_taxonomy_key === "none"
      ? "none"
      : preset.category_taxonomy_key,
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
