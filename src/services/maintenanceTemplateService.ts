import { API_ENDPOINTS } from "./apiConfig";
import type { MaintenanceTaskTemplate } from "../types/maintenance";
import { publicAnonKey } from "../utils/supabase/info";

const base = () => `${API_ENDPOINTS.admin}`;

/** Coerce API JSON `error` field (string or object) to a displayable string. */
function apiErrorBodyToString(raw: unknown, fallback: string): string {
  if (raw == null || raw === "") return fallback;
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (typeof raw === "object" && raw !== null && "message" in raw) {
    const m = (raw as { message?: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  try {
    return JSON.stringify(raw);
  } catch {
    return fallback;
  }
}

/** Supabase Edge Functions expect both JWT (user) and anon apikey on requests from the browser. */
function edgeHeaders(accessToken: string, contentType?: string): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    apikey: publicAnonKey,
  };
  if (contentType) h["Content-Type"] = contentType;
  return h;
}

async function parseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const err = body.error ?? body.message;
  return apiErrorBodyToString(err, `HTTP ${res.status}`);
}

async function edgeFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Failed to fetch" || msg.includes("NetworkError")) {
      throw new Error(
        "Could not reach the API (network or CORS). Check your connection, redeploy make-server-37f42386 with maintenance routes, and confirm this app’s Supabase project id matches your deployment.",
      );
    }
    throw e;
  }
}

export async function listMaintenanceTemplates(
  accessToken: string,
  catalogId: string,
): Promise<MaintenanceTaskTemplate[]> {
  const res = await edgeFetch(`${base()}/admin/vehicle-catalog/${catalogId}/maintenance-templates`, {
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return (data.items || []) as MaintenanceTaskTemplate[];
}

export async function listGlobalMaintenanceTemplates(
  accessToken: string,
): Promise<MaintenanceTaskTemplate[]> {
  const res = await edgeFetch(`${base()}/admin/maintenance-templates/global`, {
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return (data.items || []) as MaintenanceTaskTemplate[];
}

export async function createMaintenanceTemplate(
  accessToken: string,
  catalogId: string,
  payload: Partial<MaintenanceTaskTemplate> & { task_name: string },
): Promise<MaintenanceTaskTemplate> {
  const res = await edgeFetch(`${base()}/admin/vehicle-catalog/${catalogId}/maintenance-templates`, {
    method: "POST",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.item as MaintenanceTaskTemplate;
}

export async function createGlobalMaintenanceTemplate(
  accessToken: string,
  payload: Partial<MaintenanceTaskTemplate> & { task_name: string },
): Promise<MaintenanceTaskTemplate> {
  const res = await edgeFetch(`${base()}/admin/maintenance-templates/global`, {
    method: "POST",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.item as MaintenanceTaskTemplate;
}

export async function updateMaintenanceTemplate(
  accessToken: string,
  templateId: string,
  payload: Partial<MaintenanceTaskTemplate>,
): Promise<MaintenanceTaskTemplate> {
  const res = await edgeFetch(`${base()}/admin/maintenance-templates/${templateId}`, {
    method: "PATCH",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.item as MaintenanceTaskTemplate;
}

export async function deleteMaintenanceTemplate(accessToken: string, templateId: string): Promise<void> {
  const res = await edgeFetch(`${base()}/admin/maintenance-templates/${templateId}`, {
    method: "DELETE",
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function migrateMaintenanceFromKv(accessToken: string): Promise<{
  ok: boolean;
  inserted: number;
  skipped: number;
  scanned: number;
}> {
  const res = await edgeFetch(`${base()}/admin/migrate-maintenance-from-kv`, {
    method: "POST",
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
