import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '@roam/api-client';

export { appleSignInEnabled, signInOrder, signInProviderLabel, thisSignInDevice } from './signInOrder';
export type { SignInLayout, SignInMethod } from './signInOrder';

const LINK_KEY = 'plug-auth-link';

const supabaseUrl = `https://${projectId}.supabase.co`;

/** Plug's only login client. Importing the shared client builds the other apps' clients too, and they steal the return link. */
export const supabasePlugApp = createClient(supabaseUrl, publicAnonKey, {
  auth: {
    storageKey: `sb-${projectId}-auth-plug`,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

const RECOVERY_KEY = 'plug-set-password';

export function plugRedirectTo(): string {
  return `${window.location.origin}/`;
}

export function wantsNewPassword(): boolean {
  return sessionStorage.getItem(RECOVERY_KEY) === '1';
}

export function clearNewPassword(): void {
  sessionStorage.removeItem(RECOVERY_KEY);
}

/** Swap a `?code=` return for a Plug session before the app draws. The hash router never sees that code. */
export async function settlePlugAuth(): Promise<void> {
  if (typeof window === 'undefined') return;
  const code = new URLSearchParams(window.location.search).get('code');
  if (!code) {
    await supabasePlugApp.auth.getSession();
    return;
  }
  let recovery = false;
  const { data: { subscription } } = supabasePlugApp.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') recovery = true;
  });
  const { error } = await supabasePlugApp.auth.exchangeCodeForSession(code);
  subscription.unsubscribe();
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, '', next || '/');
  if (error) sessionStorage.setItem(LINK_KEY, 'wrong-browser');
  else if (recovery) sessionStorage.setItem(RECOVERY_KEY, '1');
}

export function takeAuthLinkError(): string | null {
  const value = sessionStorage.getItem(LINK_KEY);
  sessionStorage.removeItem(LINK_KEY);
  if (value) return 'That link opened in a different browser. Sign in here, or ask for a new link';
  return null;
}
