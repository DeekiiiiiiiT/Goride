/**
 * Toll dispatch flags — read/write via rides admin dispatch-settings API.
 */
import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';

const RIDES_BASE = API_ENDPOINTS.rides;

export type TollDispatchSettings = {
  toll_detection_enabled: boolean;
  toll_geofence_radius_m: number;
  toll_detect_enroute: boolean;
  route_toll_estimation_enabled: boolean;
};

function headers(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    apikey: publicAnonKey,
    'Content-Type': 'application/json',
  };
}

async function parseError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { error?: string; message?: string };
    return body.message ?? body.error ?? text.slice(0, 200) ?? `HTTP ${res.status}`;
  } catch {
    return text.slice(0, 200) || `HTTP ${res.status}`;
  }
}

function pickTollFields(settings: Record<string, unknown>): TollDispatchSettings {
  return {
    toll_detection_enabled: settings.toll_detection_enabled === true,
    toll_geofence_radius_m: Number(settings.toll_geofence_radius_m ?? 100),
    toll_detect_enroute: settings.toll_detect_enroute === true,
    route_toll_estimation_enabled: settings.route_toll_estimation_enabled === true,
  };
}

export async function getTollDispatchSettings(accessToken: string): Promise<TollDispatchSettings> {
  const res = await fetch(`${RIDES_BASE}/admin/dispatch-settings`, {
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { settings?: Record<string, unknown> };
  return pickTollFields(body.settings ?? {});
}

export async function updateTollDispatchSettings(
  accessToken: string,
  patch: Partial<TollDispatchSettings>,
): Promise<TollDispatchSettings> {
  const res = await fetch(`${RIDES_BASE}/admin/dispatch-settings`, {
    method: 'PATCH',
    headers: headers(accessToken),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { settings?: Record<string, unknown> };
  return pickTollFields(body.settings ?? {});
}
