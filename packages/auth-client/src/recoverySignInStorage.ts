const STORAGE_KEY = 'roam_recovery_sign_in_href';

/** Remember where the user should sign in after completing password recovery. */
export function rememberRecoverySignInHref(href: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, href);
  } catch {
    /* quota / private mode */
  }
}

/** Read and clear the stored sign-in path, or return the fallback. */
export function consumeRecoverySignInHref(fallback: string): string {
  if (typeof sessionStorage === 'undefined') return fallback;
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      sessionStorage.removeItem(STORAGE_KEY);
      return stored;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}
