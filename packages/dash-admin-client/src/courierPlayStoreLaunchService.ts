import { dashAdminFetchRaw, parseDashAdminError } from './fetch';
import {
  computePlayStoreProgress,
  DASH_COURIER_DATA_SAFETY_TEMPLATE_VERSION,
  DASH_COURIER_PLAY_STORE_CATALOG,
  DASH_COURIER_PLAY_STORE_META,
  type DataSafetyImportDiffPayload,
  type DataSafetyRowsPayload,
  type PlayStoreChecklistPatch,
  type PlayStoreChecklistState,
  type PlayStoreLaunchPayload,
  type PlayStoreReleaseInput,
  type PlayStoreReleaseRow,
} from '@roam/play-store-launch';
import type { DataSafetyState, DataSafetyValidationIssue } from '@roam/play-store-launch';

const PLAY_STORE_BASE = '/courier-play-store';
const parseError = parseDashAdminError;
const adminFetch = (accessToken: string, path: string, init?: Omit<RequestInit, 'headers'>) =>
  dashAdminFetchRaw(accessToken, `${PLAY_STORE_BASE}${path}`);

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

function normalizeRowsPayload(raw: unknown): DataSafetyRowsPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as { rows?: unknown; templateVersion?: unknown };
  if (!Array.isArray(obj.rows)) return null;
  return {
    rows: obj.rows as DataSafetyRowsPayload['rows'],
    templateVersion: typeof obj.templateVersion === 'string' ? obj.templateVersion : null,
  };
}

function mapPayload(data: ApiPayload): PlayStoreLaunchPayload {
  const checklist = data.checklist ?? {};
  return {
    meta: DASH_COURIER_PLAY_STORE_META,
    catalog: DASH_COURIER_PLAY_STORE_CATALOG,
    checklist,
    data_safety_notes: data.data_safety_notes,
    data_safety_rows: normalizeRowsPayload(data.data_safety_rows),
    data_safety_imported_at: data.data_safety_imported_at,
    data_safety_source_hash: data.data_safety_source_hash,
    data_safety_template_version: data.data_safety_template_version,
    updated_at: data.updated_at,
    updated_by: data.updated_by,
    releases: data.releases ?? [],
    progress: computePlayStoreProgress(DASH_COURIER_PLAY_STORE_CATALOG, checklist),
  };
}

export async function getCourierPlayStoreLaunch(
  accessToken: string,
): Promise<PlayStoreLaunchPayload> {
  const res = await adminFetch(accessToken, '');
  if (!res.ok) throw new Error(await parseError(res));
  return mapPayload((await res.json()) as ApiPayload);
}

export async function patchCourierPlayStoreChecklist(
  accessToken: string,
  patches: PlayStoreChecklistPatch[],
): Promise<Pick<PlayStoreLaunchPayload, 'checklist' | 'data_safety_notes' | 'progress'>> {
  const res = await adminFetch(accessToken, '/checklist', {
    method: 'PATCH',
    body: JSON.stringify({ patches }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as ApiPayload;
  const checklist = data.checklist ?? {};
  return {
    checklist,
    data_safety_notes: data.data_safety_notes,
    progress: computePlayStoreProgress(DASH_COURIER_PLAY_STORE_CATALOG, checklist),
  };
}

export async function saveCourierPlayStoreDataSafetyNotes(
  accessToken: string,
  notes: string,
): Promise<Pick<PlayStoreLaunchPayload, 'data_safety_notes'>> {
  const res = await adminFetch(accessToken, '/checklist', {
    method: 'PATCH',
    body: JSON.stringify({ data_safety_notes: notes }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as ApiPayload;
  return { data_safety_notes: data.data_safety_notes };
}

export async function addCourierPlayStoreRelease(
  accessToken: string,
  input: PlayStoreReleaseInput,
): Promise<PlayStoreReleaseRow> {
  const res = await adminFetch(accessToken, '/releases', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { release: PlayStoreReleaseRow };
  return data.release;
}

export async function deleteCourierPlayStoreRelease(
  accessToken: string,
  id: string,
): Promise<void> {
  const res = await adminFetch(accessToken, `/releases/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function importCourierPlayStoreDataSafetyCsv(
  accessToken: string,
  csv: string,
  dryRun = false,
): Promise<{
  diff?: DataSafetyImportDiffPayload;
  issues?: DataSafetyValidationIssue[];
  payload?: Partial<PlayStoreLaunchPayload>;
}> {
  const res = await adminFetch(accessToken, '/data-safety/import', {
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

export async function exportCourierPlayStoreDataSafetyCsv(accessToken: string): Promise<void> {
  const res = await adminFetch(accessToken, '/data-safety/export');
  if (!res.ok) throw new Error(await parseError(res));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'data_safety_export.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export async function saveCourierPlayStoreDataSafetyRows(
  accessToken: string,
  state: DataSafetyState,
  expectedUpdatedAt?: string | null,
): Promise<Partial<PlayStoreLaunchPayload>> {
  const res = await adminFetch(accessToken, '/data-safety', {
    method: 'PUT',
    body: JSON.stringify({
      rows: state.rows,
      templateVersion: state.templateVersion ?? DASH_COURIER_DATA_SAFETY_TEMPLATE_VERSION,
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
