import { API_ENDPOINTS, getProductLineHeaders, publicAnonKey } from '@roam/api-client';
import { supabaseEnterpriseApp } from '@roam/auth-client';

async function authHeaders(organizationId?: string | null): Promise<HeadersInit> {
  const { data } = await supabaseEnterpriseApp.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return {
    Authorization: `Bearer ${token}`,
    apikey: publicAnonKey,
    'Content-Type': 'application/json',
    ...getProductLineHeaders(),
    ...(organizationId ? { 'X-Roam-Organization-Id': organizationId } : {}),
  };
}

async function logisticsFetch<T>(
  path: string,
  init?: RequestInit & { organizationId?: string | null },
): Promise<T> {
  const { organizationId, ...rest } = init ?? {};
  const headers = await authHeaders(organizationId);
  const res = await fetch(`${API_ENDPOINTS.logistics}${path}`, {
    ...rest,
    headers: { ...headers, ...(rest.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      typeof json.message === 'string'
        ? json.message
        : typeof json.error === 'string'
          ? json.error
          : json.error?.formErrors?.[0] ||
            res.statusText ||
            'Request failed';
    throw new Error(`${res.status}: ${detail}`);
  }
  return json as T;
}

export type LogisticsJobRow = Record<string, unknown>;

export const logisticsService = {
  listJobs: (organizationId?: string | null, status?: string) =>
    logisticsFetch<{ jobs: LogisticsJobRow[] }>(
      `/jobs${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      { organizationId },
    ),

  getJob: (id: string, organizationId?: string | null) =>
    logisticsFetch<{
      job: LogisticsJobRow;
      stops: LogisticsJobRow[];
      events: LogisticsJobRow[];
    }>(`/jobs/${id}`, { organizationId }),

  assignJob: (
    id: string,
    body: {
      assigneeType: 'org_fleet' | 'client_fleet' | 'third_party' | 'roam_marketplace';
      assigneeDriverId?: string | null;
      assigneeVehicleId?: string | null;
      clientFleetAssetId?: string | null;
      thirdPartyCarrierId?: string | null;
      note?: string;
    },
    organizationId?: string | null,
  ) =>
    logisticsFetch<{ job: LogisticsJobRow; matching?: Record<string, unknown> }>(`/jobs/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify(body),
      organizationId,
    }),

  transitionJob: (
    id: string,
    status: string,
    note?: string,
    organizationId?: string | null,
  ) =>
    logisticsFetch<{ job: LogisticsJobRow }>(`/jobs/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify({ status, note }),
      organizationId,
    }),
};
