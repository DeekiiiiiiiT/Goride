import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '@roam/api-client';

/** Isolated client for email recovery links (Site URL redirects). */
export const supabaseRecovery = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey,
  {
    auth: {
      storageKey: `sb-${projectId}-auth-recovery`,
      detectSessionInUrl: true,
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);

/** True when the current URL is a Supabase password-recovery redirect. */
export function isPasswordRecoveryUrl(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.pathname === '/reset-password') return true;

  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return false;

  const params = new URLSearchParams(hash);
  return params.get('type') === 'recovery';
}
