import { dashAdminFetch, dashAdminFetchRaw, parseDashAdminJson } from './fetch';
import type {
  CourierApproveResult,
  CourierAdminPermissions,
  CourierComplianceRow,
  CourierDetailDto,
  CourierDirectoryRow,
  CourierDeliveryLedgerRow,
  CourierPresenceRow,
  CourierStats,
} from '@roam/types/courier';

export async function getCourierStats(accessToken: string): Promise<CourierStats> {
  return dashAdminFetch(accessToken, '/couriers/stats');
}

export async function listCouriers(
  accessToken: string,
  opts: {
    q?: string;
    status?: string;
    live_status?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<{ couriers: CourierDirectoryRow[]; total: number; page: number; limit: number }> {
  const sp = new URLSearchParams();
  if (opts.q) sp.set('q', opts.q);
  if (opts.status) sp.set('status', opts.status);
  if (opts.live_status) sp.set('live_status', opts.live_status);
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  return dashAdminFetch(accessToken, `/couriers?${sp.toString()}`);
}

export async function getCourierDetail(
  accessToken: string,
  userId: string,
): Promise<{ courier: CourierDetailDto; permissions: CourierAdminPermissions }> {
  return dashAdminFetch(accessToken, `/couriers/${encodeURIComponent(userId)}`);
}

export async function listCourierDeliveries(
  accessToken: string,
  userId: string,
  opts: { page?: number; limit?: number } = {},
): Promise<{ deliveries: Array<Record<string, unknown>>; total: number; page: number; limit: number }> {
  const sp = new URLSearchParams();
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  return dashAdminFetch(
    accessToken,
    `/couriers/${encodeURIComponent(userId)}/deliveries?${sp.toString()}`,
  );
}

export async function listDeliveryLedger(
  accessToken: string,
  opts: {
    page?: number;
    limit?: number;
    courier_user_id?: string;
    status?: string;
    q?: string;
  } = {},
): Promise<{ deliveries: CourierDeliveryLedgerRow[]; total: number; page: number; limit: number }> {
  const sp = new URLSearchParams();
  if (opts.page != null) sp.set('page', String(opts.page));
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  if (opts.courier_user_id) sp.set('courier_user_id', opts.courier_user_id);
  if (opts.status) sp.set('status', opts.status);
  if (opts.q) sp.set('q', opts.q);
  return dashAdminFetch(accessToken, `/couriers/ledger/deliveries?${sp.toString()}`);
}

export async function listCourierPresence(
  accessToken: string,
  opts: { online_only?: boolean; limit?: number } = {},
): Promise<{ couriers: CourierPresenceRow[]; total: number }> {
  const sp = new URLSearchParams();
  if (opts.online_only) sp.set('online_only', 'true');
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  return dashAdminFetch(accessToken, `/couriers/presence?${sp.toString()}`);
}

export async function listComplianceQueue(
  accessToken: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ couriers: CourierComplianceRow[]; total: number }> {
  const sp = new URLSearchParams();
  if (opts.limit != null) sp.set('limit', String(opts.limit));
  if (opts.offset != null) sp.set('offset', String(opts.offset));
  sp.set('queue', 'true');
  return dashAdminFetch(accessToken, `/couriers/compliance?${sp.toString()}`);
}

export async function updateComplianceStatus(
  accessToken: string,
  courierId: string,
  updates: { background_check?: 'pending' | 'approved' | 'rejected' | 'expired' },
): Promise<{ ok: boolean; courier?: CourierComplianceRow }> {
  return dashAdminFetch(accessToken, `/couriers/compliance/${courierId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function approveCourier(
  accessToken: string,
  userId: string,
  opts: { force?: boolean; reason?: string } = {},
): Promise<CourierApproveResult> {
  return dashAdminFetch(accessToken, `/couriers/${encodeURIComponent(userId)}/approve`, {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export type CourierCrossPersonaWarning = {
  error: 'cross_persona_warning';
  message: string;
  customer: { id: string; account_status: string; email?: string | null };
};

export async function suspendCourier(
  accessToken: string,
  userId: string,
  reason: string,
  opts?: { confirmCrossPersona?: boolean },
): Promise<{ ok: boolean; status: string }> {
  const res = await dashAdminFetchRaw(
    accessToken,
    `/couriers/${encodeURIComponent(userId)}/suspend`,
    {
      method: 'POST',
      body: JSON.stringify({ reason, confirmCrossPersona: opts?.confirmCrossPersona === true }),
    },
  );
  if (res.status === 409) {
    const body = await res.json().catch(() => ({})) as CourierCrossPersonaWarning;
    if (body.error === 'cross_persona_warning') {
      const err = new Error(body.message || 'Cross-persona warning') as Error & {
        crossPersona?: CourierCrossPersonaWarning;
      };
      err.crossPersona = body;
      throw err;
    }
  }
  return parseDashAdminJson<{ ok: boolean; status: string }>(res);
}

export async function unsuspendCourier(
  accessToken: string,
  userId: string,
): Promise<{ ok: boolean; status: string }> {
  return dashAdminFetch(accessToken, `/couriers/${encodeURIComponent(userId)}/unsuspend`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function deactivateCourier(
  accessToken: string,
  userId: string,
  reason: string,
): Promise<{ ok: boolean; status: string }> {
  return dashAdminFetch(accessToken, `/couriers/${encodeURIComponent(userId)}/deactivate`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function reactivateCourier(
  accessToken: string,
  userId: string,
): Promise<{ ok: boolean; status: string }> {
  return dashAdminFetch(accessToken, `/couriers/${encodeURIComponent(userId)}/reactivate`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function signOutCourier(
  accessToken: string,
  userId: string,
): Promise<{ ok: boolean }> {
  return dashAdminFetch(accessToken, `/couriers/${encodeURIComponent(userId)}/sign-out`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function resetCourierPassword(
  accessToken: string,
  userId: string,
): Promise<{ ok: boolean; message: string; email?: string; recovery_link?: string }> {
  return dashAdminFetch(accessToken, `/couriers/${encodeURIComponent(userId)}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function deleteCourier(
  accessToken: string,
  userId: string,
): Promise<{ ok: boolean; message: string }> {
  return dashAdminFetch(accessToken, `/couriers/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}
