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
  personas: IdentityPersona[];
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
};

export async function listIdentities(
  accessToken: string,
  opts?: { q?: string; persona?: string; page?: number; limit?: number },
): Promise<{ identities: IdentityListRow[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.q) params.set('q', opts.q);
  if (opts?.persona) params.set('persona', opts.persona);
  if (opts?.page) params.set('page', String(opts.page));
  if (opts?.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return dashAdminFetch(accessToken, `/identities${qs ? `?${qs}` : ''}`);
}

export async function getIdentityDetail(
  accessToken: string,
  userId: string,
): Promise<IdentityDetail> {
  return dashAdminFetch(accessToken, `/identities/${encodeURIComponent(userId)}`);
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
