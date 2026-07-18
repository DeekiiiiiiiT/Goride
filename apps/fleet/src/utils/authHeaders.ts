import { publicAnonKey } from './supabase/info';
import { supabase } from './supabase/client';
import { getProductLineHeaders } from '../config/productLine';

/**
 * Thrown when a protected (money / admin / data-mutation) endpoint is called
 * without an authenticated session. Carries 401 semantics so callers/UI can
 * prompt re-login instead of silently sending an unscoped anon request.
 */
export class AuthRequiredError extends Error {
  readonly status = 401;
  readonly code = 'AUTH_REQUIRED';
  constructor(message = 'You must be signed in to perform this action.') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

/**
 * Canonical authorization headers for Fleet API calls.
 *
 * SECURITY (Fleet Data Isolation):
 * - Always includes the X-Roam-Product-Line header for product separation.
 * - Uses the session JWT for proper org scoping.
 * - NEVER silently falls back to the anon key for protected calls: if there is
 *   no session it throws AuthRequiredError. Pass { allowAnon: true } ONLY for
 *   genuinely public endpoints.
 *
 * @param contentType - Content-Type header value, or null to omit
 * @param options.allowAnon - If true, permits anon-key fallback for public endpoints
 */
export async function getHeaders(
  contentType: string | null = 'application/json',
  options?: { allowAnon?: boolean },
): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  // Protected endpoints require a real session JWT — never leak an unscoped anon request.
  if (!token && !options?.allowAnon) {
    throw new AuthRequiredError();
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token || publicAnonKey}`,
    ...getProductLineHeaders(),
  };

  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  return headers;
}

/**
 * Strict auth headers for money / admin / data-mutation endpoints.
 * Returns session-JWT headers or throws AuthRequiredError when logged out.
 * @param contentType - Content-Type header value, or null to omit
 */
export async function requireAuthHeaders(
  contentType: string | null = 'application/json',
): Promise<Record<string, string>> {
  return getHeaders(contentType);
}
