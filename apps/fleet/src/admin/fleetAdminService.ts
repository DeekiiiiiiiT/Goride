import { API_ENDPOINTS } from '../services/apiConfig';
import { withProductLineHeaders } from '../config/productLine';

export type FleetAdminCustomer = {
  id: string;
  email: string;
  name: string;
  businessType: string;
  productLine: string;
  accountStatus: string | null;
  createdAt: string | null;
  lastSignIn: string | null;
  status: string;
  isSuspended: boolean;
};

export async function fetchFleetAdminCustomers(
  accessToken: string,
  refresh = false,
): Promise<FleetAdminCustomer[]> {
  const qs = refresh ? '?refresh=true' : '';
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/customers${qs}`, {
    headers: withProductLineHeaders({ Authorization: `Bearer ${accessToken}` }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.customers || [];
}

export async function approveFleetCustomer(
  accessToken: string,
  userId: string,
): Promise<void> {
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/customers/${userId}/approve`, {
    method: 'POST',
    headers: withProductLineHeaders({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }),
    body: '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
}

// ---------------------------------------------------------------------------
// Fleet Customer Lifecycle Actions
// ---------------------------------------------------------------------------

export async function suspendFleetCustomer(
  accessToken: string,
  userId: string,
  reason: string,
): Promise<{ success: boolean; status: string }> {
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/customers/${userId}/suspend`, {
    method: 'POST',
    headers: withProductLineHeaders({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ reason }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

export async function reactivateFleetCustomer(
  accessToken: string,
  userId: string,
): Promise<{ success: boolean; status: string }> {
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/customers/${userId}/reactivate`, {
    method: 'POST',
    headers: withProductLineHeaders({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }),
    body: '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

export async function signOutFleetCustomer(
  accessToken: string,
  userId: string,
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/customers/${userId}/sign-out`, {
    method: 'POST',
    headers: withProductLineHeaders({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }),
    body: '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

export async function deleteFleetCustomer(
  accessToken: string,
  userId: string,
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/customers/${userId}`, {
    method: 'DELETE',
    headers: withProductLineHeaders({
      Authorization: `Bearer ${accessToken}`,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}
