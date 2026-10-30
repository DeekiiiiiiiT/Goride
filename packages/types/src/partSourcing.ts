export interface PartCategoryRecord {
  id: string;
  parent_id: string | null;
  slug: string;
  label: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  part_count?: number;
}

export interface PartMasterRecord {
  id: string;
  category_id: string;
  name: string;
  oem_part_number: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  manufacturer?: string | null;
  part_kind?: string | null;
  maintenance_component_id?: string | null;
  interchange_group_id?: string | null;
  catalog_decision?: string | null;
  created_at?: string;
  updated_at?: string;
  part_category?: { id: string; slug: string; label: string };
}

export interface SupplierRecord {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  default_lead_time_days: number | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SupplierPartOfferRecord {
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
  created_at?: string;
  updated_at?: string;
  supplier?: { id: string; name: string; default_lead_time_days?: number | null };
  part_master?: { id: string; name: string };
}

export interface PartFitmentRecord {
  id: string;
  part_id: string;
  vehicle_catalog_id: string;
  chassis_code: string | null;
  engine_code: string | null;
  year_from: number | null;
  year_to: number | null;
  created_at?: string;
  updated_at?: string;
  part_master?: { id: string; name: string; oem_part_number?: string | null };
}

export interface CompatiblePartOffer {
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
  supplier?: { id: string; name: string; default_lead_time_days?: number | null };
}

export interface CompatiblePartsItem {
  fitmentId: string;
  tier?: number;
  tierLabel?: string;
  matchReason?: string;
  confirmedFit?: boolean;
  confirmedInstalls?: number;
  position?: string | null;
  ruleSource?: string | null;
  alsoKnownAs?: string[];
  stockQty?: number;
  part: PartMasterRecord & {
    part_category?: { id: string; slug: string; label: string; parent_id?: string | null; sort_order?: number };
  };
  offers: Array<CompatiblePartOffer & {
    landedCostJmd?: number;
    totalImpactJmd?: number;
    priceStale?: boolean;
    core_charge?: number | null;
    warranty_months?: number | null;
  }>;
}

export interface UniversalSpecSection {
  specKey: string;
  label: string;
  value: string;
  unit?: string | null;
  items: Array<{
    id: string;
    manufacturer?: string;
    partNumber?: string;
    name?: string;
    extra?: Record<string, unknown>;
    stockQty?: number;
    inYourStock?: boolean;
  }>;
}

export interface RelatedSupply {
  id: string;
  component_id: string;
  supply_name: string;
  note?: string | null;
}

export interface CompatiblePartsResponse {
  catalogMatched: boolean;
  catalogId?: string;
  items: CompatiblePartsItem[];
  count?: number;
  message?: string;
  tiered?: boolean;
  universal?: UniversalSpecSection[];
  sections?: Array<{ tier: number; label: string; sisterNames?: string; items?: CompatiblePartsItem[] }>;
  relatedSupplies?: RelatedSupply[];
}
