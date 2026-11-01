import { publicAnonKey, withSettingsSegmentHeaders } from '@roam/api-client';
import { supabase } from './supabase/client';

export class AuthRequiredError extends Error {
  readonly status = 401;
  readonly code = 'AUTH_REQUIRED';
  constructor(message = 'You must be signed in to perform this action.') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

/** Fleet inventory + driver car kit — session JWT, apikey, segment headers (R5-16). */
export async function getInventoryAuthHeaders(
  contentType: string | null = 'application/json',
): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new AuthRequiredError();
  }
  return withSettingsSegmentHeaders('driver', {
    Authorization: `Bearer ${token}`,
    ...(contentType ? { 'Content-Type': contentType } : {}),
  });
}

/** Public platform flags — anon fallback allowed before login. */
export async function getPlatformFlagsHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return withSettingsSegmentHeaders('driver', {
    Authorization: `Bearer ${session?.access_token || publicAnonKey}`,
  });
}
