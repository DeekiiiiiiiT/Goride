import { API_ENDPOINTS } from "./apiConfig";
import { publicAnonKey } from "../utils/supabase/info";

const PARTS_QUEUE_BASE = `${API_ENDPOINTS.catalog}/make-server-37f42386/admin/pending-catalog/parts-queue`;

function edgeHeaders(accessToken: string, contentType?: string): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    apikey: publicAnonKey,
  };
  if (contentType) h["Content-Type"] = contentType;
  return h;
}

export type PendingPartsQueueGroup = {
  groupId: string;
  platformId: string | null;
  componentId: string | null;
  side: string | null;
  fleetCount: number;
  firstAsked: string | null;
  lastAsked: string | null;
  photoCount: number;
  status: string;
  requestIds: string[];
};

export type PendingPartsGroupNote = {
  id: string;
  logRef: string;
  text: string;
  at?: string;
};

export type PendingPartsGroupPhoto = {
  url: string;
  requestId: string;
};

export type PendingPartsGroupDetail = {
  groupId: string;
  fleetCount: number;
  notes: PendingPartsGroupNote[];
  photos: PendingPartsGroupPhoto[];
};

export type PendingPartsPatchAction =
  | { action: "looking"; note?: string }
  | { action: "cant_find"; reason?: string }
  | { action: "added"; resolvedPartId?: string; note?: string };

export type VehicleCatalogBrief = {
  id: string;
  make: string;
  model: string;
  trim_series?: string | null;
  catalog_trim?: string | null;
  chassis_code?: string | null;
  engine_code?: string | null;
  production_start_year?: number | null;
  production_end_year?: number | null;
  drivetrain?: string | null;
  transmission?: string | null;
};

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return typeof body.error === "string" ? body.error : `HTTP ${res.status}`;
}

export async function listPendingPartsQueue(
  accessToken: string,
): Promise<{ items: PendingPartsQueueGroup[]; total: number; weeklyTarget: number }> {
  const res = await fetch(PARTS_QUEUE_BASE, { headers: edgeHeaders(accessToken) });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return {
    items: (data.items || []) as PendingPartsQueueGroup[],
    total: typeof data.total === "number" ? data.total : (data.items || []).length,
    weeklyTarget: typeof data.weeklyTarget === "number" ? data.weeklyTarget : 12,
  };
}

export async function getPendingPartsGroupDetail(
  accessToken: string,
  groupId: string,
): Promise<PendingPartsGroupDetail> {
  const res = await fetch(`${PARTS_QUEUE_BASE}/${encodeURIComponent(groupId)}`, {
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<PendingPartsGroupDetail>;
}

export async function patchPendingPartsGroup(
  accessToken: string,
  groupId: string,
  body: PendingPartsPatchAction,
): Promise<void> {
  const res = await fetch(`${PARTS_QUEUE_BASE}/${encodeURIComponent(groupId)}`, {
    method: "PATCH",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function fetchVehicleCatalogBriefs(
  accessToken: string,
  ids: string[],
): Promise<Map<string, VehicleCatalogBrief>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, VehicleCatalogBrief>();
  await Promise.all(
    unique.map(async (id) => {
      try {
        const res = await fetch(`${API_ENDPOINTS.catalog}/vehicle-catalog?id=${encodeURIComponent(id)}`, {
          headers: edgeHeaders(accessToken),
        });
        if (!res.ok) return;
        const data = await res.json();
        const row = (data.vehicles || [])[0] as VehicleCatalogBrief | undefined;
        if (row?.id) out.set(id, row);
      } catch {
        /* ignore per-id failures */
      }
    }),
  );
  return out;
}

export type PartsBrowseNameMap = Map<string, { plainName: string; areaName?: string }>;

export async function fetchPartsBrowseNameMap(accessToken: string): Promise<PartsBrowseNameMap> {
  const res = await fetch(`${API_ENDPOINTS.admin}/admin/catalog/parts/browse`, {
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) return new Map();
  const data = await res.json();
  const out: PartsBrowseNameMap = new Map();
  for (const system of data.systems || []) {
    const areaName = system.plainName || system.name;
    for (const component of system.components || []) {
      out.set(String(component.id), {
        plainName: component.plainName || component.name || "Part",
        areaName,
      });
    }
  }
  for (const row of data.common || []) {
    out.set(String(row.id), { plainName: row.plainName || row.name || "Part" });
  }
  return out;
}

export function uiStatusBucket(status: string): "new" | "looking" | "added" | "cant_find" {
  if (status === "in_progress") return "looking";
  if (status === "resolved") return "added";
  if (status === "rejected") return "cant_find";
  return "new";
}

export function formatStatusLabel(bucket: ReturnType<typeof uiStatusBucket>): string {
  if (bucket === "looking") return "Looking";
  if (bucket === "added") return "Added";
  if (bucket === "cant_find") return "Can't find";
  return "New";
}

export function formatVehicleHeadline(v: VehicleCatalogBrief | undefined): string {
  if (!v) return "Unknown vehicle version";
  const start = v.production_start_year ?? "";
  const end = v.production_end_year;
  const years =
    start && end ? `${start}–${end}` : start ? `${start}–` : end ? `–${end}` : "";
  const trim = [v.trim_series, v.catalog_trim].filter(Boolean).join(" · ");
  const tail = [trim, v.engine_code, v.drivetrain].filter(Boolean).join(" · ");
  return [v.make, v.model, years].filter(Boolean).join(" ").trim() + (tail ? ` · ${tail}` : "");
}

export function formatVehicleSubline(v: VehicleCatalogBrief | undefined): string {
  if (!v) return "";
  return [v.chassis_code, v.transmission].filter(Boolean).join(" · ");
}

export function formatPartLabel(
  componentId: string | null,
  side: string | null,
  names: PartsBrowseNameMap,
): { title: string; subtitle: string } {
  const meta = componentId ? names.get(componentId) : undefined;
  let title = meta?.plainName || (componentId ? "Requested part" : "Part request");
  if (side) {
    const sideLabel = side.charAt(0).toUpperCase() + side.slice(1);
    title = `${title} · ${sideLabel}`;
  }
  return { title, subtitle: meta?.areaName || "Fleet part request" };
}
