// Stitch: dominion-redesign/15a24b12ad9e4893a6b13d7da4709860
import { API_ENDPOINTS } from "../../../services/apiConfig";
import { supabase } from "../../../utils/supabase/client";

export type QualityRule = {
  key: string;
  label: string;
  pass: number;
  fail: number;
  applies_to?: number;
};

export type PlaceTypeCount = { type: string; label: string; count: number };

export type PlacesActivity = { kind: string; at: string | null };

export type PlacesOverview = {
  generated_at: string;
  places: {
    total: number;
    verified: number;
    pending: number;
    learnt: number;
    on_plug: number;
    types_used: number;
    types_active: number;
    by_type: PlaceTypeCount[];
    area_depth: { parish: number; town: number; community: number };
  };
  places_quality: {
    score: number | null;
    failing: number;
    checked_at: string | null;
    rules: QualityRule[];
  };
  map: {
    score: number | null;
    checked_at: string | null;
    areas: { country: number; parish: number; town: number; community: number };
    drafts: number;
    last_publish_at: string | null;
    publishes: number;
    pins: number;
    pins_pass: number;
    borders_total: number;
    borders_pass: number;
    imports: number;
    last_import_at: string | null;
    open_checks: number;
  };
  review: {
    new_places: number;
    learnt: number;
    suggestions: number;
    evidence: number;
    oldest_at: string | null;
  };
  issues: {
    pin_unchecked: number;
    verified_pin_unchecked: number;
    no_brand: number;
    area_parish_only: number;
  };
  activity: PlacesActivity[];
};

export async function fetchPlacesOverview(): Promise<PlacesOverview> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  const response = await fetch(`${API_ENDPOINTS.explorer}/admin/places/overview`, {
    headers: { Authorization: token ? `Bearer ${token}` : "" },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "Could not load Places and Maps");
  }
  return body as PlacesOverview;
}
