import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import type {
  CreateAbuseReportBody,
  CreateAbuseReportResponse,
  CreateRoamConnectionRequestBody,
  CreateUserBlockBody,
  RoamConnectionRequestActionResponse,
  RoamConnectionRequestDto,
  RoamConnectionsIncomingResponse,
  RoamConnectionsOutgoingResponse,
  SyncPhoneConnectionRequestsResponse,
  UserBlocksListResponse,
} from '@roam/types/roamConnections';
import type { PassengerAuthorizationListResponse } from '@roam/types/passengerAuthorization';

async function connectionHeaders(): Promise<HeadersInit> {
  const { data: { user } } = await supabase.auth.getUser();
  let token = user ? (await supabase.auth.getSession()).data.session?.access_token : null;
  if (!token) {
    const refreshed = await supabase.auth.refreshSession();
    token = refreshed.data.session?.access_token ?? null;
  }
  return {
    Authorization: `Bearer ${token ?? publicAnonKey}`,
    apikey: publicAnonKey,
    'Content-Type': 'application/json',
  };
}

const base = API_ENDPOINTS.rides;

async function parseError(res: Response): Promise<never> {
  const text = await res.text();
  let message = text || `HTTP ${res.status}`;
  try {
    const body = JSON.parse(text) as { message?: string; error?: string };
    message = body.message ?? body.error ?? message;
  } catch {
    /* use raw */
  }
  throw new Error(message);
}

export async function listOutgoingConnectionRequests(): Promise<RoamConnectionsOutgoingResponse> {
  const res = await fetch(`${base}/v1/roam-connection-requests/outgoing`, {
    headers: await connectionHeaders(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function listIncomingConnectionRequests(): Promise<RoamConnectionsIncomingResponse> {
  const res = await fetch(`${base}/v1/roam-connection-requests/incoming`, {
    headers: await connectionHeaders(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function createRoamConnectionRequest(
  body: CreateRoamConnectionRequestBody,
): Promise<{ request: RoamConnectionRequestDto }> {
  const res = await fetch(`${base}/v1/roam-connection-requests`, {
    method: 'POST',
    headers: await connectionHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function acceptRoamConnectionRequest(
  id: string,
): Promise<RoamConnectionRequestActionResponse> {
  const res = await fetch(`${base}/v1/roam-connection-requests/${id}/accept`, {
    method: 'POST',
    headers: await connectionHeaders(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function rejectRoamConnectionRequest(
  id: string,
): Promise<RoamConnectionRequestActionResponse> {
  const res = await fetch(`${base}/v1/roam-connection-requests/${id}/reject`, {
    method: 'POST',
    headers: await connectionHeaders(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function cancelRoamConnectionRequest(
  id: string,
): Promise<RoamConnectionRequestActionResponse> {
  const res = await fetch(`${base}/v1/roam-connection-requests/${id}/cancel`, {
    method: 'POST',
    headers: await connectionHeaders(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function syncPhoneConnectionRequests(): Promise<SyncPhoneConnectionRequestsResponse> {
  const res = await fetch(`${base}/v1/roam-connection-requests/sync-phone`, {
    method: 'POST',
    headers: await connectionHeaders(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function listOutgoingPassengerAuthorizations(
  status?: 'pending' | 'claimed' | 'all' | 'active',
): Promise<PassengerAuthorizationListResponse> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const qs = params.toString();
  const res = await fetch(`${base}/v1/passenger-authorizations/mine${qs ? `?${qs}` : ''}`, {
    headers: await connectionHeaders(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function createUserBlock(
  body: CreateUserBlockBody,
): Promise<{ block: { id: string; blocked_user_id: string; blocked_display_name: string | null; created_at: string } }> {
  const res = await fetch(`${base}/v1/user-blocks`, {
    method: 'POST',
    headers: await connectionHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function listUserBlocks(): Promise<UserBlocksListResponse> {
  const res = await fetch(`${base}/v1/user-blocks`, {
    headers: await connectionHeaders(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function deleteUserBlock(blockedUserId: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${base}/v1/user-blocks/${blockedUserId}`, {
    method: 'DELETE',
    headers: await connectionHeaders(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function createAbuseReport(
  body: CreateAbuseReportBody,
): Promise<CreateAbuseReportResponse> {
  const res = await fetch(`${base}/v1/abuse-reports`, {
    method: 'POST',
    headers: await connectionHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}
