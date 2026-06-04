import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import {
  computePlayStoreProgress,
  DRIVER_PLAY_STORE_CATALOG,
  DRIVER_PLAY_STORE_META,
  type PlayStoreChecklistPatch,
  type PlayStoreChecklistState,
  type PlayStoreLaunchPayload,
  type PlayStoreReleaseInput,
  type PlayStoreReleaseRow,
} from '@roam/play-store-launch';
import { supabaseDriverAdmin as supabase } from '@roam/auth-client';

const DRIVER_BASE = API_ENDPOINTS.driver;

async function resolveAccessToken(accessToken: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const active = session?.access_token ?? accessToken;
  const expiresAt = session?.expires_at ?? 0;
  const now = Math.floor(Date.now() / 1000);
  if (session && expiresAt - now < 90) {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session?.access_token) return data.session.access_token;
  }
  return active;
}

async function adminFetch(
  accessToken: string,
  url: string,
  init?: Omit<RequestInit, 'headers'>,
): Promise<Response> {
  let token = await resolveAccessToken(accessToken);
  const headers = (t: string): HeadersInit => ({
    Authorization: `Bearer ${t}`,
    apikey: publicAnonKey,
    ...(init?.body != null ? { 'Content-Type': 'application/json' } : {}),
  });
  let res = await fetch(url, { ...init, headers: headers(token) });
  if (res.status === 401) {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session?.access_token) {
      token = data.session.access_token;
      res = await fetch(url, { ...init, headers: headers(token) });
    }
  }
  return res;
}

async function parseError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const body = text ? (JSON.parse(text) as { message?: string; error?: string }) : {};
    return body.message ?? body.error ?? `HTTP ${res.status}`;
  } catch {
    return text || `HTTP ${res.status}`;
  }
}

type ApiPayload = {
  checklist: PlayStoreChecklistState;
  data_safety_notes: string | null;
  releases: PlayStoreReleaseRow[];
};

export async function getDriverPlayStoreLaunch(
  accessToken: string,
): Promise<PlayStoreLaunchPayload> {
  const res = await adminFetch(accessToken, `${DRIVER_BASE}/admin/play-store`);
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as ApiPayload;
  const checklist = data.checklist ?? {};
  return {
    meta: DRIVER_PLAY_STORE_META,
    catalog: DRIVER_PLAY_STORE_CATALOG,
    checklist,
    data_safety_notes: data.data_safety_notes,
    releases: data.releases ?? [],
    progress: computePlayStoreProgress(DRIVER_PLAY_STORE_CATALOG, checklist),
  };
}

export async function patchDriverPlayStoreChecklist(
  accessToken: string,
  patches: PlayStoreChecklistPatch[],
): Promise<Pick<PlayStoreLaunchPayload, 'checklist' | 'data_safety_notes' | 'progress'>> {
  const res = await adminFetch(accessToken, `${DRIVER_BASE}/admin/play-store/checklist`, {
    method: 'PATCH',
    body: JSON.stringify({ patches }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as ApiPayload;
  const checklist = data.checklist ?? {};
  return {
    checklist,
    data_safety_notes: data.data_safety_notes,
    progress: computePlayStoreProgress(DRIVER_PLAY_STORE_CATALOG, checklist),
  };
}

export async function saveDriverPlayStoreDataSafetyNotes(
  accessToken: string,
  notes: string,
): Promise<Pick<PlayStoreLaunchPayload, 'data_safety_notes'>> {
  const res = await adminFetch(accessToken, `${DRIVER_BASE}/admin/play-store/checklist`, {
    method: 'PATCH',
    body: JSON.stringify({ data_safety_notes: notes }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as ApiPayload;
  return { data_safety_notes: data.data_safety_notes };
}

export async function addDriverPlayStoreRelease(
  accessToken: string,
  input: PlayStoreReleaseInput,
): Promise<PlayStoreReleaseRow> {
  const res = await adminFetch(accessToken, `${DRIVER_BASE}/admin/play-store/releases`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { release: PlayStoreReleaseRow };
  return data.release;
}

export async function deleteDriverPlayStoreRelease(
  accessToken: string,
  id: string,
): Promise<void> {
  const res = await adminFetch(accessToken, `${DRIVER_BASE}/admin/play-store/releases/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await parseError(res));
}
