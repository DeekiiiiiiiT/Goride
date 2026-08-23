import { dashAdminFetch } from './fetch';

export type IdentityPersona = {
  persona: string;
  ref_id: string;
  status: string;
  market_id?: string | null;
};

export type IdentityListRow = {
  user_id: string;
  primary_email?: string | null;
  primary_phone?: string | null;
  display_name?: string | null;
  global_status: string;
  risk_score?: number;
  last_active_at?: string | null;
  personas: IdentityPersona[];
};

export type IdentityPermissions = {
  can_ban: boolean;
  can_unban: boolean;
  can_revoke_sessions: boolean;
  can_restrict: boolean;
  can_revoke_staff: boolean;
  can_view_pii: boolean;
  can_export: boolean;
  can_delete: boolean;
};

export type IdentityDetail = {
  identity: Record<string, unknown>;
  authEmail: string;
  personas: IdentityPersona[];
  customer: Record<string, unknown> | null;
  courier: Record<string, unknown> | null;
  ownedMerchants: Array<Record<string, unknown>>;
  staffMemberships: Array<Record<string, unknown>>;
  consoleRoles: string[];
  permissions?: IdentityPermissions;
};

export type IdentitySession = {
  id: string;
  device?: string;
  last_seen?: string;
  created_at?: string;
};

export async function listIdentities(
  accessToken: string,
  opts?: {
    q?: string;
    persona?: string;
    page?: number;
    limit?: number;
    sort?: string;
    order?: 'asc' | 'desc';
  },
): Promise<{ identities: IdentityListRow[]; total: number; page?: number; limit?: number }> {
  const params = new URLSearchParams();
  if (opts?.q) params.set('q', opts.q);
  if (opts?.persona) params.set('persona', opts.persona);
  if (opts?.page) params.set('page', String(opts.page));
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.sort) params.set('sort', opts.sort);
  if (opts?.order) params.set('order', opts.order);
  const qs = params.toString();
  return dashAdminFetch(accessToken, `/identities${qs ? `?${qs}` : ''}`);
}

export async function getIdentityDetail(
  accessToken: string,
  userId: string,
): Promise<IdentityDetail> {
  return dashAdminFetch(accessToken, `/identities/${encodeURIComponent(userId)}`);
}

export async function banIdentity(
  accessToken: string,
  userId: string,
  reason: string,
): Promise<{ ok: boolean; global_status: string }> {
  return dashAdminFetch(accessToken, `/identities/${encodeURIComponent(userId)}/ban`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function unbanIdentity(
  accessToken: string,
  userId: string,
  reason: string,
): Promise<{ ok: boolean; global_status: string }> {
  return dashAdminFetch(accessToken, `/identities/${encodeURIComponent(userId)}/unban`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function restrictIdentity(
  accessToken: string,
  userId: string,
  reason: string,
  status?: 'restricted' | 'suspended',
): Promise<{ ok: boolean; global_status: string }> {
  return dashAdminFetch(accessToken, `/identities/${encodeURIComponent(userId)}/restrict`, {
    method: 'POST',
    body: JSON.stringify({ reason, status }),
  });
}

export async function unrestrictIdentity(
  accessToken: string,
  userId: string,
  reason: string,
): Promise<{ ok: boolean; global_status: string }> {
  return dashAdminFetch(accessToken, `/identities/${encodeURIComponent(userId)}/unrestrict`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function restrictPersona(
  accessToken: string,
  userId: string,
  persona: string,
  reason: string,
): Promise<{ ok: boolean; persona: string; status: string }> {
  return dashAdminFetch(
    accessToken,
    `/identities/${encodeURIComponent(userId)}/personas/${encodeURIComponent(persona)}/restrict`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
}

export async function unrestrictPersona(
  accessToken: string,
  userId: string,
  persona: string,
  reason: string,
): Promise<{ ok: boolean; persona: string; status: string }> {
  return dashAdminFetch(
    accessToken,
    `/identities/${encodeURIComponent(userId)}/personas/${encodeURIComponent(persona)}/unrestrict`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
}

export async function revokeAllSessions(
  accessToken: string,
  userId: string,
  reason: string,
): Promise<{ ok: boolean }> {
  return dashAdminFetch(
    accessToken,
    `/identities/${encodeURIComponent(userId)}/sessions/revoke-all`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
}

export async function listIdentitySessions(
  accessToken: string,
  userId: string,
): Promise<{ sessions: IdentitySession[]; note?: string }> {
  return dashAdminFetch(accessToken, `/identities/${encodeURIComponent(userId)}/sessions`);
}

export async function exportIdentityData(
  accessToken: string,
  userId: string,
  reason: string,
): Promise<Record<string, unknown>> {
  return dashAdminFetch(accessToken, `/identities/${encodeURIComponent(userId)}/export`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function mergeIdentity(
  accessToken: string,
  targetUserId: string,
  sourceUserId: string,
  reason: string,
): Promise<{ ok: boolean; status: string }> {
  return dashAdminFetch(accessToken, `/identities/${encodeURIComponent(targetUserId)}/merge`, {
    method: 'POST',
    body: JSON.stringify({ source_user_id: sourceUserId, reason }),
  });
}

export async function revokeMerchantStaff(
  accessToken: string,
  memberId: string,
  reason: string,
): Promise<{ ok: boolean }> {
  return dashAdminFetch(accessToken, `/identities/merchant-staff/${encodeURIComponent(memberId)}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  });
}

export type AuditEvent = {
  id: string;
  actor_id?: string;
  actor_user_id?: string;
  action: string;
  target_id?: string;
  target_user_id?: string;
  reason?: string | null;
  permission_key?: string;
  details?: string;
  created_at: string;
};

export async function listIdentityAuditEvents(
  accessToken: string,
  opts?: {
    page?: number;
    limit?: number;
    action?: string;
    actor_id?: string;
    target_user_id?: string;
    date_from?: string;
    date_to?: string;
  },
): Promise<{ events: AuditEvent[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.page) params.set('page', String(opts.page));
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.action) params.set('action', opts.action);
  if (opts?.actor_id) params.set('actor_id', opts.actor_id);
  if (opts?.target_user_id) params.set('target_user_id', opts.target_user_id);
  if (opts?.date_from) params.set('date_from', opts.date_from);
  if (opts?.date_to) params.set('date_to', opts.date_to);
  const qs = params.toString();
  return dashAdminFetch(accessToken, `/audit/events${qs ? `?${qs}` : ''}`);
}
