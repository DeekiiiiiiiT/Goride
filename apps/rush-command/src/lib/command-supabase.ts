import { projectId } from '@roam/api-client';
import { supabaseDashCommand } from '@roam/auth-client';
import type { Session } from '@supabase/supabase-js';

export const supabase = supabaseDashCommand;

const COMMAND_STORAGE_KEY = `sb-${projectId}-auth-dash-command`;
const PARTNER_STORAGE_KEY = `sb-${projectId}-auth-dash-partner`;

/** Copy partner session once so owners can open Command without re-login on first visit. */
export function migratePartnerSessionToCommand() {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(COMMAND_STORAGE_KEY)) return;
    const partner =
      localStorage.getItem(PARTNER_STORAGE_KEY) ?? sessionStorage.getItem(PARTNER_STORAGE_KEY);
    if (partner) localStorage.setItem(COMMAND_STORAGE_KEY, partner);
  } catch {
    // ignore
  }
}

export async function ensureValidCommandSession(): Promise<Session | null> {
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
  if (refreshError || !refreshed) {
    await supabase.auth.signOut();
    return null;
  }
  return refreshed;
}

export async function refreshCommandSessionIfNeeded(): Promise<Session> {
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
