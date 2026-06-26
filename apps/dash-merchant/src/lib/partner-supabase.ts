import { supabaseDashPartner } from '@roam/auth-client';
import type { Session } from '@supabase/supabase-js';

/** Partner app auth — isolated from driver/admin sessions on the same host. */
export const supabase = supabaseDashPartner;

/** Drop cached sessions revoked server-side (getSession can still return stale data). */
export async function ensureValidPartnerSession(): Promise<Session | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (user && !error) return session;

  const {
    data: { session: refreshed },
    error: refreshError,
  } = await supabase.auth.refreshSession();
  if (refreshed && !refreshError) return refreshed;

  await supabase.auth.signOut();
  return null;
}
