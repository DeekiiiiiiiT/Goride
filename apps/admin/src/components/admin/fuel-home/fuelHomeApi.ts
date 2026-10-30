import { API_ENDPOINTS } from "../../../services/apiConfig";
import { supabase } from "../../../utils/supabase/client";

export type QualityRule = {
  key: "pin_checked" | "brand_set" | "parish_match" | string;
  label: string;
  pass: number;
  fail: number;
};

export type GradePrice = {
  grade: string;
  label: string;
  live: number;
  avg_pump: number | null;
  benchmark: number | null;
  diff: number | null;
  diff_pct: number | null;
};

export type FuelActivity = {
  kind: "report" | "publish" | "refinery_week" | "station_edit" | string;
  at: string | null;
};

export type FuelOverview = {
  generated_at: string;
  stations: { total: number; verified: number; pending: number };
  quality: {
    score: number | null;
    failing: number;
    rules: QualityRule[];
    checked_at: string | null;
  };
  prices: {
    live: number;
    priced_stations: number;
    coverage_pct: number;
    by_grade: GradePrice[];
    review_waiting: number;
    oldest_review_at: string | null;
    top_reporter_share: number;
    outdated_share: number;
    reports_7d: number;
    last_report_at: string | null;
    last_published_at: string | null;
  };
  benchmark: {
    slug: string | null;
    name: string | null;
    refineries: number;
    latest_week: string | null;
    freshness: "current" | "due" | "stale" | string;
    headline: { product: string; label: string; price: number | null };
    last_run_at: string | null;
  };
  gas_cards: { programs: number };
  activity: FuelActivity[];
};

export async function fetchFuelOverview(): Promise<FuelOverview> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  const response = await fetch(`${API_ENDPOINTS.explorer}/admin/fuel/overview`, {
    headers: { Authorization: token ? `Bearer ${token}` : "" },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "Could not load fuel overview");
  }
  return body as FuelOverview;
}
