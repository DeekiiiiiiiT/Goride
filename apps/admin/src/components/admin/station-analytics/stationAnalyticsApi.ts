import { API_ENDPOINTS } from "../../../services/apiConfig";
import { supabase } from "../../../utils/supabase/client";

export type AnalyticsFilters = {
  grade: string;
  week: string;
  pcode: string;
  brand: string;
};

export type StationPoint = {
  placeId: string;
  name: string;
  price: number;
};

export type StationRow = {
  placeId: string;
  name: string;
  address: string | null;
  brand: string | null;
  brandId: string | null;
  pcode: string | null;
  parish: string | null;
  status: string;
  price: number | null;
  gap: number | null;
  vsParish: number | null;
  reportCount: number | null;
  reporterCount: number | null;
  confidence: string | null;
  lastReportAt: string | null;
  outdated: boolean | null;
  pinState: string | null;
  parishTextMismatch: boolean;
  lat: number | null;
  lng: number | null;
};

export type StationAnalytics = {
  meta: {
    grade: string;
    week: string | null;
    prevWeek: string | null;
    petrojam: number | null;
    petrojamPrev: number | null;
    petrojamYearAgo: number | null;
    latestPetrojamDate: string | null;
    lastReportAt: string | null;
    generatedAt: string;
    grades: string[];
    availableWeeks: string[];
  };
  kpis: {
    pumpMedian: number | null;
    pumpMedianPrev: number | null;
    nStations: number;
    nReports: number;
    min: StationPoint | null;
    max: StationPoint | null;
    stationsPriced: number;
    stationsInScope: number;
    stationsPricedPrev: number;
    verified: number;
  };
  trust: {
    reporters: number;
    topReporterShare: number;
    fleet: number;
    plug: number;
    accepted: number;
    duplicate: number;
    rejected: number;
    review: number;
    outdated: number;
    live: number;
    outdatedShare: number;
  };
  trend: Array<{
    week: string;
    petrojam: number | null;
    pumpMedian: number | null;
    pumpMin: number | null;
    pumpMax: number | null;
    reports: number;
    stations: number;
  }>;
  parishes: Array<{
    pcode: string;
    name: string;
    stations: number;
    verified: number;
    priced: number;
    median: number | null;
    gap: number | null;
    vsNational: number | null;
  }>;
  brands: Array<{
    brandId: string | null;
    name: string;
    stations: number;
    priced: number;
    median: number | null;
  }>;
  stations: StationRow[];
  quality: {
    parishMismatch: number;
    noBrand: number;
    pinUnchecked: number;
    verifiedNoDate: number;
    inReview: number;
  };
};

export async function fetchStationAnalytics(filters: AnalyticsFilters): Promise<StationAnalytics> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  const query = new URLSearchParams();
  if (filters.grade) query.set("grade", filters.grade);
  if (filters.week) query.set("week", filters.week);
  if (filters.pcode) query.set("pcode", filters.pcode);
  if (filters.brand) query.set("brand", filters.brand);
  const response = await fetch(`${API_ENDPOINTS.explorer}/admin/analytics/stations?${query}`, {
    headers: { Authorization: token ? `Bearer ${token}` : "" },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "Could not load station analytics. This is not the same as no data.");
  }
  return body as StationAnalytics;
}
