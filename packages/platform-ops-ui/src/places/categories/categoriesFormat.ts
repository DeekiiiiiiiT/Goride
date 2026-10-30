// Stitch: dominion-redesign/categories_tree_tab_gas_station_selected

export type TaxonomyTable = "category_group" | "category" | "place_type" | "facility_type" | "brand";

export type BlockedBy = {
  places: number;
  plug_chip: boolean;
  search_as: number;
  children: number;
  facilities: number;
  default_facilities: number;
};

export type Summary = {
  groups: number;
  categories: number;
  categories_in_use: number;
  place_types: number;
  place_types_in_use: number;
  facility_types: number;
  facility_types_in_use: number;
  brands: number;
  logos: number;
  retired: number;
};

export type GroupRow = {
  code: string;
  slug: string;
  label: string;
  colour: string;
  sort: number;
  active: boolean;
  type_count: number;
  places: number;
  blocked_by: BlockedBy;
};

export type CategoryRow = {
  code: string;
  group_code: string;
  slug: string;
  label: string;
  icon: string | null;
  sort: number;
  active: boolean;
  type_count: number;
  facility_count: number;
  parent_label: string;
  parent_active: boolean;
  blocked_by: BlockedBy;
};

export type PlaceTypeRow = {
  slug: string;
  category_code: string;
  label: string;
  icon: string | null;
  sort: number;
  default_geofence_m: number;
  default_facilities: string[];
  match_profile: string;
  search_as_facility: string | null;
  attribute_schema: { properties?: Record<string, { type?: string; title?: string; items?: { type?: string; enum?: string[] } }> } | null;
  active: boolean;
  plug_chip: string | null;
  plug_label: string | null;
  plug_map_label: string | null;
  grid_icon: string | null;
  grid_sort: number | null;
  empty_hint: string | null;
  places: number;
  in_plug: boolean;
  parent_label: string;
  parent_active: boolean;
  parent_restore_label: string | null;
  group_label: string;
  group_code: string;
  blocked_by: BlockedBy;
};

export type FacilityRow = {
  slug: string;
  category_code: string;
  label: string;
  icon: string | null;
  sort: number;
  searchable: boolean;
  attribute_schema: { properties?: Record<string, { type?: string; title?: string }> } | null;
  active: boolean;
  facilities_used: number;
  parent_label: string;
  parent_active: boolean;
  parent_restore_label: string | null;
  group_label: string;
  blocked_by: BlockedBy;
};

export type BrandRow = {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  logo_url: string | null;
  place_types: string[];
  sort: number;
  active: boolean;
  places: number;
  blocked_by: BlockedBy;
};

export type AdminTaxonomy = {
  summary: Summary;
  groups: GroupRow[];
  categories: CategoryRow[];
  placeTypes: PlaceTypeRow[];
  facilityTypes: FacilityRow[];
  brands: BrandRow[];
};

export type ChangeRow = {
  id: string;
  table_name: TaxonomyTable;
  row_key: string;
  action: string;
  reason: string | null;
  actor_id: string | null;
  at: string;
  item_label: string;
};

export type SelectedRef = { table: TaxonomyTable; id: string };

const EMPTY_BLOCK: BlockedBy = {
  places: 0,
  plug_chip: false,
  search_as: 0,
  children: 0,
  facilities: 0,
  default_facilities: 0,
};

export function isRetireBlocked(blocked: Partial<BlockedBy> | null | undefined): boolean {
  const row = { ...EMPTY_BLOCK, ...(blocked || {}) };
  return Boolean(row.plug_chip)
    || Number(row.places) > 0
    || Number(row.search_as) > 0
    || Number(row.children) > 0
    || Number(row.facilities) > 0
    || Number(row.default_facilities) > 0;
}

/** Allowed retire state keeps the button. A blocked item does not. */
export function retireDialogShowsButton(blocked: Partial<BlockedBy> | null | undefined): boolean {
  return !isRetireBlocked(blocked);
}

/** Colour sits on a 12px swatch. The row itself stays a Dominion surface. */
export function groupSwatchStyle(colour: string): { backgroundColor: string; width: string; height: string } {
  return { backgroundColor: colour || "#e1e2ed", width: "12px", height: "12px" };
}

export function groupRowUsesColourBackground(): boolean {
  return false;
}

export function monogram(name: string): string {
  const parts = name.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "•";
}

export function registerHref(slug: string): string {
  return `/?page=places-register&type=${encodeURIComponent(slug)}`;
}

export function changeWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function changeBy(actorId: string | null | undefined): string {
  return actorId ? "Owner" : "System";
}

export function matchLabel(profile: string): string {
  if (profile === "fuel") return "Fuel matching";
  if (profile === "toll") return "Toll matching";
  return "No matching";
}

const MARKS: Record<string, string> = {
  gas_station: "⛽",
  bus_terminal: "🚏",
  toll_plaza: "🚧",
};

export function typeMark(slug: string, icon: string | null): string {
  return MARKS[slug] || (icon && /\p{Extended_Pictographic}/u.test(icon) ? icon : "");
}

export function retireTitle(label: string): string {
  if (label === "Gas station") return "Retire Gas station?";
  if (label === "Beach") return "Retire Beach?";
  return `Retire ${label}?`;
}

export function emptySummary(): Summary {
  return {
    groups: 0,
    categories: 0,
    categories_in_use: 0,
    place_types: 0,
    place_types_in_use: 0,
    facility_types: 0,
    facility_types_in_use: 0,
    brands: 0,
    logos: 0,
    retired: 0,
  };
}
