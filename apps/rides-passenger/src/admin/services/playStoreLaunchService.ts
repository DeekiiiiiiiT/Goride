import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import {
  computePlayStoreProgress,
  RIDES_PLAY_STORE_CATALOG,
  RIDES_PLAY_STORE_META,
  RIDES_DATA_SAFETY_TEMPLATE_VERSION,
  type DataSafetyImportDiffPayload,
  type DataSafetyRowsPayload,
  type PlayStoreChecklistPatch,
  type PlayStoreChecklistState,
  type PlayStoreLaunchPayload,
  type PlayStoreReleaseInput,
  type PlayStoreReleaseRow,
} from '@roam/play-store-launch';
import type { DataSafetyState, DataSafetyValidationIssue } from '@roam/play-store-launch';
import { supabase } from '@roam/auth-client';

const RIDES_BASE = API_ENDPOINTS.rides;

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
  data_safety_rows: DataSafetyRowsPayload | null;
  data_safety_imported_at: string | null;
  data_safety_source_hash: string | null;
  data_safety_template_version: string | null;
  updated_at: string | null;
  updated_by: string | null;
  releases: PlayStoreReleaseRow[];
};

function mapPayload(data: ApiPayload): PlayStoreLaunchPayload {
  const checklist = data.checklist ?? {};
  const progress = computePlayStoreProgress(RIDES_PLAY_STORE_CATALOG, checklist);
  return {
    meta: RIDES_PLAY_STORE_META,
    catalog: RIDES_PLAY_STORE_CATALOG,
    checklist,
    data_safety_notes: data.data_safety_notes,
    data_safety_rows: normalizeRowsPayload(data.data_safety_rows),
    data_safety_imported_at: data.data_safety_imported_at,
    data_safety_source_hash: data.data_safety_source_hash,
    data_safety_template_version: data.data_safety_template_version,
    updated_at: data.updated_at,
    updated_by: data.updated_by,
    releases: data.releases ?? [],
    progress,
  };
}

function normalizeRowsPayload(raw: unknown): DataSafetyRowsPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as { rows?: unknown; templateVersion?: unknown };
  if (!Array.isArray(obj.rows)) return null;
  return {
    rows: obj.rows as DataSafetyRowsPayload['rows'],
    templateVersion:
      typeof obj.templateVersion === 'string' ? obj.templateVersion : null,
  };
}

export async function getPlayStoreLaunch(accessToken: string): Promise<PlayStoreLaunchPayload> {
  const res = await adminFetch(accessToken, `${RIDES_BASE}/admin/play-store`);
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as ApiPayload;
  return mapPayload(data);
}

export async function patchPlayStoreChecklist(
  accessToken: string,
  patches: PlayStoreChecklistPatch[],
): Promise<Pick<PlayStoreLaunchPayload, 'checklist' | 'data_safety_notes' | 'progress'>> {
  const res = await adminFetch(accessToken, `${RIDES_BASE}/admin/play-store/checklist`, {
    method: 'PATCH',
    body: JSON.stringify({ patches }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as ApiPayload;
  const checklist = data.checklist ?? {};
  return {
    checklist,
    data_safety_notes: data.data_safety_notes,
    progress: computePlayStoreProgress(RIDES_PLAY_STORE_CATALOG, checklist),
  };
}

export async function savePlayStoreDataSafetyNotes(
  accessToken: string,
  notes: string,
): Promise<Pick<PlayStoreLaunchPayload, 'data_safety_notes'>> {
  const res = await adminFetch(accessToken, `${RIDES_BASE}/admin/play-store/checklist`, {
    method: 'PATCH',
    body: JSON.stringify({ data_safety_notes: notes }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as ApiPayload;
  return { data_safety_notes: data.data_safety_notes };
}

export async function addPlayStoreRelease(
  accessToken: string,
  input: PlayStoreReleaseInput,
): Promise<PlayStoreReleaseRow> {
  const res = await adminFetch(accessToken, `${RIDES_BASE}/admin/play-store/releases`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { release: PlayStoreReleaseRow };
  return data.release;
}

export async function deletePlayStoreRelease(accessToken: string, id: string): Promise<void> {
  const res = await adminFetch(accessToken, `${RIDES_BASE}/admin/play-store/releases/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function importPlayStoreDataSafetyCsv(
  accessToken: string,
  csv: string,
  dryRun = false,
): Promise<{
  diff?: DataSafetyImportDiffPayload;
  issues?: DataSafetyValidationIssue[];
  payload?: Partial<PlayStoreLaunchPayload>;
}> {
  const res = await adminFetch(accessToken, `${RIDES_BASE}/admin/play-store/data-safety/import`, {
    method: 'POST',
    body: JSON.stringify({ csv, dryRun }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as Record<string, unknown>;
  if (dryRun) {
    return {
      diff: data.diff as DataSafetyImportDiffPayload,
      issues: data.issues as DataSafetyValidationIssue[],
    };
  }
  return {
    diff: data.diff as DataSafetyImportDiffPayload | undefined,
    issues: data.issues as DataSafetyValidationIssue[] | undefined,
    payload: {
      data_safety_rows: normalizeRowsPayload(data.data_safety_rows),
      data_safety_imported_at: data.data_safety_imported_at as string,
      data_safety_source_hash: data.data_safety_source_hash as string,
      data_safety_template_version: data.data_safety_template_version as string,
      updated_at: data.updated_at as string,
    },
  };
}

export async function exportPlayStoreDataSafetyCsv(accessToken: string): Promise<void> {
  const res = await adminFetch(accessToken, `${RIDES_BASE}/admin/play-store/data-safety/export`);
  if (!res.ok) throw new Error(await parseError(res));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'data_safety_export.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export async function savePlayStoreDataSafetyRows(
  accessToken: string,
  state: DataSafetyState,
  expectedUpdatedAt?: string | null,
): Promise<Partial<PlayStoreLaunchPayload>> {
  const res = await adminFetch(accessToken, `${RIDES_BASE}/admin/play-store/data-safety`, {
    method: 'PUT',
    body: JSON.stringify({
      rows: state.rows,
      templateVersion: state.templateVersion ?? RIDES_DATA_SAFETY_TEMPLATE_VERSION,
      expectedUpdatedAt: expectedUpdatedAt ?? undefined,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as Record<string, unknown>;
  return {
    data_safety_rows: normalizeRowsPayload(data.data_safety_rows),
    data_safety_template_version: data.data_safety_template_version as string,
    updated_at: data.updated_at as string,
  };
}
