/**
 * Dominion platform identity lookups (monolith `/admin/users/*`).
 */
import { API_ENDPOINTS } from '../apiConfig';

const BASE = `${API_ENDPOINTS.admin}/admin/users`;

async function parseError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { error?: string; message?: string };
    return body.message || body.error || `HTTP ${res.status}`;
  } catch {
    return text.trim() || `HTTP ${res.status}`;
  }
}

function authHeaders(accessToken: string, contentType?: string): HeadersInit {
  const h: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (contentType) h['Content-Type'] = contentType;
  return h;
}

export interface CrossProductAuthStatus {
  banned_until: string | null;
  is_banned: boolean;
  email_confirmed_at: string | null;
}

export interface CrossProductDriverSlice {
  exists: boolean;
  profile_id?: string;
  status?: string;
  mode?: string;
  onboarding_complete?: boolean;
  suspended_at?: string | null;
  deactivated_at?: string | null;
  created_at?: string;
}

export interface CrossProductRiderSlice {
  exists: boolean;
  display_name?: string;
  account_status?: string;
  suspended_at?: string | null;
  suspended_reason?: string | null;
  created_at?: string;
  error?: string;
}

export interface CrossProductFleetSlice {
  exists: boolean;
  role?: string;
  company_name?: string;
  business_type?: string;
  account_status?: string;
  organization_id?: string | null;
  product_line?: string;
}

export interface CrossProductStatus {
  user_id: string;
  email: string;
  phone: string | null;
  name?: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  auth_status: CrossProductAuthStatus;
  products: {
    driver?: CrossProductDriverSlice;
    rider?: CrossProductRiderSlice;
    fleet?: CrossProductFleetSlice;
  };
}

/** GET /admin/users/lookup?email= */
export async function lookupUserByEmail(
  accessToken: string,
  email: string,
): Promise<CrossProductStatus> {
  const sp = new URLSearchParams({ email: email.trim().toLowerCase() });
  const res = await fetch(`${BASE}/lookup?${sp.toString()}`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<CrossProductStatus>;
}

/** GET /admin/users/:userId/cross-product-status */
export async function getCrossProductStatus(
  accessToken: string,
  userId: string,
): Promise<CrossProductStatus> {
  const res = await fetch(`${BASE}/${encodeURIComponent(userId)}/cross-product-status`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<CrossProductStatus>;
}

/** DELETE /admin/users/:userId/full-delete — platform owner only */
export async function fullDeleteUser(
  accessToken: string,
  userId: string,
): Promise<{ success: boolean; message?: string; cleaned_up?: string[] }> {
  const res = await fetch(`${BASE}/${encodeURIComponent(userId)}/full-delete`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<{ success: boolean; message?: string; cleaned_up?: string[] }>;
}

/** POST /admin/force-logout { userId } */
export async function forceLogout(accessToken: string, userId: string): Promise<void> {
  const res = await fetch(`${API_ENDPOINTS.admin}/admin/force-logout`, {
    method: 'POST',
    headers: authHeaders(accessToken, 'application/json'),
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}
