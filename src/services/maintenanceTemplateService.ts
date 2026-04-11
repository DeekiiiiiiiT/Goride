import { API_ENDPOINTS } from "./apiConfig";
import type { MaintenanceTaskTemplate } from "../types/maintenance";

const base = () => `${API_ENDPOINTS.admin}`;

async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return (body as { error?: string }).error || `HTTP ${res.status}`;
}

export async function listMaintenanceTemplates(
  accessToken: string,
  catalogId: string,
): Promise<MaintenanceTaskTemplate[]> {
  const res = await fetch(
    `${base()}/admin/vehicle-catalog/${catalogId}/maintenance-templates`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return (data.items || []) as MaintenanceTaskTemplate[];
}

export async function createMaintenanceTemplate(
  accessToken: string,
  catalogId: string,
  payload: Partial<MaintenanceTaskTemplate> & { task_name: string },
): Promise<MaintenanceTaskTemplate> {
  const res = await fetch(`${base()}/admin/vehicle-catalog/${catalogId}/maintenance-templates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
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
  const res = await fetch(`${base()}/admin/maintenance-templates/${templateId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.item as MaintenanceTaskTemplate;
}

export async function deleteMaintenanceTemplate(accessToken: string, templateId: string): Promise<void> {
  const res = await fetch(`${base()}/admin/maintenance-templates/${templateId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function migrateMaintenanceFromKv(accessToken: string): Promise<{
  ok: boolean;
  inserted: number;
  skipped: number;
  scanned: number;
}> {
  const res = await fetch(`${base()}/admin/migrate-maintenance-from-kv`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
