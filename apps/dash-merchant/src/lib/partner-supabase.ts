import { projectId } from '@roam/api-client';
import { createRoamAuthClient } from '@roam/auth-client';
import type { Session } from '@supabase/supabase-js';

const PARTNER_STORAGE_KEY = `sb-${projectId}-auth-dash-partner`;
const LEGACY_DRIVER_STORAGE_KEY = `sb-${projectId}-auth-driver`;
const REMEMBER_ME_KEY = 'roam-partner-remember-me';

/** One-time copy for partners who signed in before the dedicated partner session key existed. */
export function migrateLegacyPartnerSession() {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(PARTNER_STORAGE_KEY) || sessionStorage.getItem(PARTNER_STORAGE_KEY)) {
      return;
    }
    const legacy = localStorage.getItem(LEGACY_DRIVER_STORAGE_KEY);
    if (legacy) localStorage.setItem(PARTNER_STORAGE_KEY, legacy);
  } catch {
    // ignore quota / private mode
  }
}

function rememberMeEnabled(): boolean {
  try {
    // Unset = keep signed in. Only explicit "0" is ephemeral.
    return localStorage.getItem(REMEMBER_ME_KEY) !== '0';
  } catch {
    return true;
  }
}

/**
 * Remember-me without pagehide storage moves.
 * The old pagehide wipe raced Google OAuth (PKCE verifier lives in the same key)
 * and bounced partners back to the sign-in screen after redirect.
 */
const partnerAuthStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key) ?? sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      if (rememberMeEnabled()) {
        localStorage.setItem(key, value);
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, value);
        localStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

/** Partner app auth — isolated from admin/driver sessions on the same host. */
export const supabase = createRoamAuthClient(PARTNER_STORAGE_KEY, {
  storage: partnerAuthStorage,
  flowType: 'pkce',
});

export function applyPartnerRememberMe(remember: boolean) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(REMEMBER_ME_KEY, remember ? '1' : '0');
    const raw =
      localStorage.getItem(PARTNER_STORAGE_KEY) ?? sessionStorage.getItem(PARTNER_STORAGE_KEY);
    if (!raw) return;
    if (remember) {
      localStorage.setItem(PARTNER_STORAGE_KEY, raw);
      sessionStorage.removeItem(PARTNER_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(PARTNER_STORAGE_KEY, raw);
    localStorage.removeItem(PARTNER_STORAGE_KEY);
  } catch {
    // ignore
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
