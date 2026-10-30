// Stitch: dominion-redesign/7b9231f8dae1411996e38bd680d73727
import Papa from "papaparse";

export type RegisterRow = {
  id: string;
  name: string;
  place_type: string;
  type_label?: string | null;
  match_profile?: string | null;
  address?: string | null;
  plus_code?: string | null;
  town_name?: string | null;
  parish_name?: string | null;
  status?: string | null;
  pin_state?: string | null;
  geofence_display?: number | null;
  geofence_override?: boolean | null;
  facility_count?: number | null;
  brand_name?: string | null;
  brand_id?: string | null;
  updated_at?: string | null;
  phone?: string | null;
  pin_unchecked?: boolean | null;
  no_brand?: boolean | null;
  no_phone?: boolean | null;
  parish_text_mismatch?: boolean | null;
  outside_jamaica?: boolean | null;
  lat?: number | null;
  lng?: number | null;
};

const STATUS_LABEL: Record<string, string> = {
  verified: "Verified",
  pending: "Pending",
  learnt: "Learnt",
  rejected: "Rejected",
  duplicate: "Duplicate",
  closed: "Closed",
  anomaly: "Anomaly",
};

const GRADE_LABEL: Record<string, string> = {
  e10_87: "Gasolene 87",
  e10_90: "Gasolene 90",
  diesel: "Auto diesel",
  ulsd: "Ultra low sulfur",
};

export function drawerFor(matchProfile: string | null | undefined) {
  return matchProfile === "fuel" ? "station" : "place";
}

export function titleCaseName(name: string) {
  return name.toLowerCase().replace(/\b([a-z])/g, (letter) => letter.toUpperCase());
}

export function stripLeadingPlusCode(address: string) {
  return address.replace(/^[23456789CFGHJMPQRVWX]{4}\+[23456789CFGHJMPQRVWX]{2,3}\s*/i, "").trim();
}

export function locationLine(row: Pick<RegisterRow, "address" | "town_name" | "parish_name">) {
  const street = stripLeadingPlusCode(row.address || "").replace(/^[\s,]+/, "").trim();
  return [street, row.town_name, row.parish_name].filter(Boolean).join(" · ");
}

export function statusLabel(status: string | null | undefined) {
  return STATUS_LABEL[String(status || "")] || titleCaseName(String(status || "Pending"));
}

export function issueChips(row: RegisterRow) {
  const chips: string[] = [];
  if (row.pin_unchecked || row.pin_state === "unchecked") chips.push("Pin not checked");
  if (row.no_brand || !row.brand_id) chips.push("No brand");
  if (row.no_phone) chips.push("No phone");
  if (row.parish_text_mismatch) chips.push("Parish text differs");
  if (row.outside_jamaica) chips.push("Outside Jamaica");
  return chips;
}

export function gradeLabel(grade: string) {
  return GRADE_LABEL[grade] || grade;
}

export function pinPlaced(lat: number | null, lng: number | null) {
  return lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= 17.6 && lat <= 18.6 && lng >= -78.5 && lng <= -76.1;
}

export function facilitiesAfterTypeChange(existing: string[], defaults: string[]) {
  const next = [...existing];
  for (const slug of defaults) {
    if (!next.includes(slug)) next.push(slug);
  }
  return next;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatUpdated(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function typeIcon(placeType: string | null | undefined, matchProfile: string | null | undefined) {
  if (matchProfile === "fuel" || placeType === "gas_station") return "local_gas_station";
  if (placeType === "toll_plaza" || matchProfile === "toll") return "toll";
  if (matchProfile === "retail") return "storefront";
  return "place";
}

export type CsvPlaceRow = {
  placeType: string;
  name: string;
  lat: string;
  lng: string;
  address: string;
  phone: string;
  facilities: string;
};

export function parsePlacesCsv(text: string): CsvPlaceRow[] {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  return (parsed.data || []).map((row) => {
    const read = (names: string[]) => {
      const hit = Object.keys(row).find((key) => names.includes(key.trim().toLowerCase()));
      return hit ? String(row[hit] || "").trim() : "";
    };
    return {
      placeType: read(["place type", "placetype", "type"]),
      name: read(["name"]),
      lat: read(["lat", "latitude"]),
      lng: read(["lng", "lon", "longitude"]),
      address: read(["address"]),
      phone: read(["phone"]),
      facilities: read(["facilities"]),
    };
  });
}
