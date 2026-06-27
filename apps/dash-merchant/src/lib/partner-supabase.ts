import { projectId } from '@roam/api-client';
import { supabaseDashPartner } from '@roam/auth-client';
import type { Session } from '@supabase/supabase-js';

/** Partner app auth — isolated from admin/driver sessions on the same host. */
export const supabase = supabaseDashPartner;

const PARTNER_STORAGE_KEY = `sb-${projectId}-auth-dash-partner`;
const LEGACY_DRIVER_STORAGE_KEY = `sb-${projectId}-auth-driver`;

/** One-time copy for partners who signed in before the dedicated partner session key existed. */
export function migrateLegacyPartnerSession() {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(PARTNER_STORAGE_KEY)) return;
    const legacy = localStorage.getItem(LEGACY_DRIVER_STORAGE_KEY);
    if (legacy) localStorage.setItem(PARTNER_STORAGE_KEY, legacy);
  } catch {
    // ignore quota / private mode
  }
}

/** Drop cached sessions revoked server-side (getSession can still return stale data). */
export async function ensureValidPartnerSession(): Promise<Session | null> {
  const withTimeout = async <T,>(promise: Promise<T>, ms = 8_000): Promise<T | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  const userResult = await withTimeout(supabase.auth.getUser());
  if (userResult?.data?.user && !userResult.error) return session;

  const refreshResult = await withTimeout(supabase.auth.refreshSession());
  if (refreshResult?.data?.session && !refreshResult.error) {
    return refreshResult.data.session;
  }

  await supabase.auth.signOut();
  return null;
}

/** Ensure access token is valid before calling delivery APIs. */
export async function refreshPartnerSessionIfNeeded(): Promise<Session> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (user && !error) return session;

  const {
    data: { session: refreshed },
    error: refreshError,
  } = await supabase.auth.refreshSession();
  if (refreshError || !refreshed) throw new Error('Session expired');

  return refreshed;
}
