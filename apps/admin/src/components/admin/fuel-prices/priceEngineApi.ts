import { API_ENDPOINTS } from "../../../services/apiConfig";
import { supabase } from "../../../utils/supabase/client";

export type Tab = "overview" | "review" | "published" | "reporters" | "settings";

export type ReviewItem = {
  source: string;
  report_id: string;
  status: string;
  reasons: string[];
  detail: { price?: number; grade?: string; place_name?: string; wholesale?: number };
  checked_at: string;
  place_id?: string;
  grade?: string;
  price_per_litre?: number;
  reported_at?: string;
  reporter_key?: string;
  place_name?: string;
  parish?: string;
  weight?: number;
  litres?: number | null;
  amount?: number | null;
};

export type Published = {
  place_id: string;
  place_name?: string;
  grade: string;
  price_per_litre: number;
  confidence: string | null;
  report_count: number | null;
  fleet_count?: number | null;
  plug_count?: number | null;
  outdated: boolean;
  observed_at: string | null;
  petrojam_week?: string | null;
  valid_until?: string | null;
};

export type Reporter = {
  reporter_key: string;
  source: string;
  trust_weight: number;
  reports: number;
  accepted: number;
  owner_rejected: number;
  last_report_at?: string | null;
};

export type Settings = {
  bounds_low: number;
  bounds_high: number;
  change_pct: number;
  mad_k: number;
  mad_min_reports: number;
  window_days: number;
  fleet_weight: number;
  plug_weight: number;
  updated_at?: string;
};

export type OverviewPayload = {
  petrojamWeek?: string;
  verifiedStations?: number;
  livePrices?: number;
  outdatedPrices?: number;
  reviewCount?: number;
  oldestReviewAt?: string | null;
  reportsThisWeek?: number;
  fleetThisWeek?: number;
  plugThisWeek?: number;
  medianReports?: number | string | null;
  reasons?: Record<string, number>;
  parishes?: Array<{ parish: string; stations: number; live: number; outdated: number }>;
  dailyJobOk?: boolean;
  health?: Record<string, unknown>;
};

export type OverviewResponse = {
  review: number;
  published: number;
  outdated: number;
  overview?: OverviewPayload;
  health?: Record<string, unknown>;
};

export async function peFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  const response = await fetch(`${API_ENDPOINTS.explorer}${path}`, {
    ...init,
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not load the price engine");
  return body as T;
}

export function money(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `J$${Number(value).toFixed(2)}`;
}

export function gradeLabel(grade: string | undefined): string {
  switch (grade) {
    case "e10_87":
      return "E-10 87";
    case "e10_90":
      return "E-10 90";
    case "diesel":
      return "Diesel";
    case "ulsd":
      return "ULSD";
    case "unknown":
      return "Grade unknown";
    default:
      return grade || "—";
  }
}

const REASON_LABELS: Record<string, string> = {
  BIG_CHANGE: "Big jump vs published",
  MAD_OUTLIER: "Unusual for station",
  UNKNOWN_GRADE: "Grade unknown",
  GRADE_UNKNOWN: "Grade unknown",
  DUPLICATE: "Duplicate report",
};

export function reasonLabel(code: string, benchmarkName = ""): string {
  if (code === "OUT_OF_BOUNDS") return `Outside ${benchmarkName || "benchmark"} band`;
  return REASON_LABELS[code] || code.replace(/_/g, " ").toLowerCase();
}

export function stationName(item: ReviewItem): string {
  return item.place_name || item.detail?.place_name || "Station";
}

export function reportPrice(item: ReviewItem): number | undefined {
  return item.price_per_litre ?? item.detail?.price;
}

export function reportGrade(item: ReviewItem): string {
  return item.grade || item.detail?.grade || "unknown";
}

export function rowKey(item: ReviewItem): string {
  return `${item.source}:${item.report_id}`;
}
