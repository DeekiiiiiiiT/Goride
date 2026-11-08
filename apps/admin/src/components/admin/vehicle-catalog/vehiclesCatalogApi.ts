import { API_ENDPOINTS } from "../../../services/apiConfig";
import { publicAnonKey } from "../../../utils/supabase/info";
import { supabase } from "../../../utils/supabase/client";
import { getJson, patchJson, postJson } from "../parts-database/partsDatabaseApi";

export type CatalogMakerSummary = {
  make: string;
  logo_storage_path?: string | null;
  country?: string | null;
  version_count?: number;
  model_count?: number;
};

export type CatalogRevisionRow = {
  id: string;
  createdAt: string;
  actor?: string | null;
  oldRow?: Record<string, unknown>;
  newRow?: Record<string, unknown>;
};

export type VehiclesDashboardChange = {
  id: string;
  carId: string;
  at: string;
  kind: "car" | "spec";
  action: "added" | "edited" | "removed";
  specLabel?: string | null;
  fields?: string[];
  actor?: string | null;
};

export type VehiclesDashboard = {
  versions: number;
  completeness: { high: number; mid: number; low: number; none: number };
  withSpecs: number;
  withoutSpecs: number;
  mostComplete: Array<{ id: string; keyParts: number; specCount: number }>;
  /** Readiness for the car ids asked for (Recently opened). */
  cars: Array<{ id: string; keyParts: number; specCount: number }>;
  pendingApproval: number;
  recentParts: Array<{ id: string; name: string; brand?: string | null; at: string; cars: string[]; carCount: number }>;
  recentChanges: VehiclesDashboardChange[];
};

/** Database-only numbers for the Vehicles home (nothing from the apps). */
export function fetchVehiclesDashboard(carIds: string[] = []) {
  const ids = carIds.slice(0, 100).join(",");
  return getJson<VehiclesDashboard>(ids ? `vehicles-dashboard?ids=${ids}` : "vehicles-dashboard");
}

export function fetchCatalogMakers() {
  return getJson<{ items: CatalogMakerSummary[] }>("makers");
}

export function patchCatalogMaker(make: string, body: { country?: string; logo_storage_path?: string | null }) {
  return patchJson<Record<string, unknown>>(`makers/${encodeURIComponent(make)}`, body);
}

export async function uploadCatalogMakerLogo(make: string, file: File) {
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(
    `${API_ENDPOINTS.admin}/admin/catalog/makers/${encodeURIComponent(make)}/logo`,
    {
      method: "POST",
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        apikey: publicAnonKey,
      },
      body: form,
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error || "Could not upload logo");
  return body as { make: string; logo_storage_path: string; publicUrl?: string | null };
}

export function saveCatalogSpecsBulk(payload: {
  specKey: string;
  value: string;
  evidenceUrl: string;
  vehicleIds: string[];
}) {
  return postJson<{ ok: boolean; savedCount: number }>("specs/bulk", payload);
}

export function fetchVariantRevisions(variantId: string) {
  return getJson<{ items: CatalogRevisionRow[] }>(`variants/${variantId}/revisions`);
}

export type SisterVehicleRow = {
  id: string;
  make: string;
  model: string;
  chassis_code?: string | null;
};

export function fetchSisterVehicles(ids: string[]) {
  if (!ids.length) return Promise.resolve({ items: [] as SisterVehicleRow[] });
  return getJson<{ items: SisterVehicleRow[] }>(`add-part/sister-vehicles?ids=${encodeURIComponent(ids.join(","))}`);
}
