/**
 * Rush settings admin API — mirrors delivery/admin/settingsRoutes.ts
 */
import { dashAdminFetch } from './fetch';

export type AdminSettingRow = {
  key: string;
  app: string;
  section: string;
  kind: string;
  default: unknown;
  scopes: string[];
  clientVisible: boolean;
  risk: 'normal' | 'high' | 'locked' | string;
  editRoles?: string[];
  envOverride: string | null;
  onReadError: string;
  value: unknown;
  version: number;
  scope: string;
  scope_id: string | null;
  updated_by: string | null;
  updated_at: string | null;
  source: 'platform' | 'market' | 'default' | string;
  envActive: boolean;
};

export type PendingChangeRow = {
  id: string;
  key: string;
  scope: string;
  scope_id: string | null;
  new_value: unknown;
  reason: string;
  requested_by: string;
  expected_version?: number;
  risk_high?: boolean;
  effective_at: string | null;
  status: string;
  decided_by?: string | null;
  decided_at?: string | null;
  created_at: string;
};

export type SettingChangeRow = {
  id: number;
  key: string;
  scope: string;
  scope_id: string | null;
  old_value: unknown;
  new_value: unknown;
  reason: string;
  changed_by: string;
  approved_by: string | null;
  effective_at: string;
  created_at: string;
};

export type SettingsListResponse = {
  settings: AdminSettingRow[];
  pending: PendingChangeRow[];
};

export type SettingsChangeBody = {
  key: string;
  value: unknown;
  reason: string;
  scope?: 'platform' | 'market';
  scope_id?: string | null;
  expected_version?: number;
  effective_at?: string | null;
};

export type SettingsChangeResult =
  | { status: 'applied'; result: unknown }
  | { status: 'pending'; pending: PendingChangeRow }
  | { status: 'scheduled'; pending: PendingChangeRow };

export function listAdminSettings(accessToken: string, opts?: { marketId?: string | null }) {
  const sp = new URLSearchParams();
  if (opts?.marketId) sp.set('marketId', opts.marketId);
  const qs = sp.toString();
  return dashAdminFetch<SettingsListResponse>(
    accessToken,
    `/admin/settings${qs ? `?${qs}` : ''}`,
  );
}

export function changeAdminSetting(accessToken: string, body: SettingsChangeBody) {
  return dashAdminFetch<SettingsChangeResult>(accessToken, '/admin/settings/change', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function approvePendingSetting(accessToken: string, pendingId: string) {
  return dashAdminFetch<{ status: string; result?: unknown; pending?: PendingChangeRow }>(
    accessToken,
    `/admin/settings/pending/${pendingId}/approve`,
    { method: 'POST', body: '{}' },
  );
}

export function rejectPendingSetting(accessToken: string, pendingId: string) {
  return dashAdminFetch<{ status: string; pending?: PendingChangeRow }>(
    accessToken,
    `/admin/settings/pending/${pendingId}/reject`,
    { method: 'POST', body: '{}' },
  );
}

export function listSettingHistory(accessToken: string, opts?: { key?: string; limit?: number }) {
  const sp = new URLSearchParams();
  if (opts?.key) sp.set('key', opts.key);
  if (opts?.limit != null) sp.set('limit', String(opts.limit));
  const qs = sp.toString();
  return dashAdminFetch<{ history: SettingChangeRow[] }>(
    accessToken,
    `/admin/settings/history${qs ? `?${qs}` : ''}`,
  );
}

export function undoSettingChange(
  accessToken: string,
  body: { change_id: number; reason?: string },
) {
  return dashAdminFetch<SettingsChangeResult>(accessToken, '/admin/settings/undo', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
