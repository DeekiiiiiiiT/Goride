/** Haulage catalog + booking contracts (shared rider, driver, admin, edge). */

export type HaulageStairsLevel = 'none' | '1_flight' | '2_plus';
export type HaulagePrepStatus = 'ready' | 'needs_unhooking';

export type HaulageCategoryDto = {
  id: string;
  title: string;
  description: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
};

export type HaulageItemSubgroupDto = {
  id: string;
  category_id: string;
  title: string;
  sort_order: number;
};

export type HaulageVariantDto = {
  id: string;
  item_id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  weight_kg: number;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  min_body_type_slug: string | null;
  upright_only: boolean;
  fragile_default: boolean;
  requires_disassembly_default: boolean;
  gear_tags: string[];
};

export type HaulageItemDto = {
  id: string;
  category_id: string;
  subgroup_id: string | null;
  title: string;
  subtitle: string;
  icon: string;
  emoji: string | null;
  sort_order: number;
  is_active: boolean;
  requires_manual_specs: boolean;
  variants: HaulageVariantDto[];
};

export type HaulageCatalogResponse = {
  categories: HaulageCategoryDto[];
  subgroups: HaulageItemSubgroupDto[];
  items: HaulageItemDto[];
};

export type HaulageQuoteLineInput = {
  item_id: string;
  variant_id: string;
  qty?: number;
};

export type HaulagePlaceInput = {
  address: string;
  lat: number;
  lng: number;
};

export type HaulageQuoteRequest = {
  items: HaulageQuoteLineInput[];
  pickup: HaulagePlaceInput;
  dropoff: HaulagePlaceInput;
  stairs_level: HaulageStairsLevel;
  prep_status: HaulagePrepStatus;
  scheduled_pickup_at?: string | null;
};

export type HaulageFareBreakdown = {
  base_minor: number;
  weight_minor: number;
  distance_minor: number;
  stairs_multiplier: number;
  prep_surcharge_minor: number;
  fragile_surcharge_minor: number;
  disassembly_surcharge_minor: number;
  surge_multiplier: number;
  total_minor: number;
  currency: string;
};

export type HaulageQuoteResponse = {
  quote_token: string;
  expires_at: string;
  min_body_type_slug: string | null;
  total_weight_kg: number;
  total_volume_cm3: number;
  fill_percent: number;
  recommended_gear: string[];
  manifest_summary: string;
  distance_km: number | null;
  duration_minutes: number | null;
  breakdown: HaulageFareBreakdown;
  booking_kind: 'immediate' | 'scheduled';
  scheduled_pickup_at?: string | null;
};

export type HaulageBookRequest = {
  quote_token: string;
  idempotency_key: string;
  payment_method?: string | null;
};

export type HaulageBookingLineSnapshot = {
  id: string;
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
};

export type HaulageBookingManifest = {
  haulage_booking_id: string;
  stairs_level: HaulageStairsLevel;
  prep_status: HaulagePrepStatus;
  total_weight_kg: number;
  total_volume_cm3: number;
  min_body_type_slug: string | null;
  fill_percent: number;
  recommended_gear: string[];
  manifest_summary: string;
  lines: HaulageBookingLineSnapshot[];
};

export type HaulageBookResponse = {
  ride_request_id: string;
  haulage_booking_id: string;
  booking_ref: string;
  status: string;
  booking_kind: 'immediate' | 'scheduled';
  estimated_total_minor: number;
  currency: string;
  scheduled_pickup_at?: string | null;
};

export type HaulageBodyCapacityInput = {
  max_payload_kg?: number | null;
  cargo_length_cm?: number | null;
  cargo_width_cm?: number | null;
  cargo_height_cm?: number | null;
  supports_upright_load?: boolean;
};
