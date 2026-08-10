/**
 * Installed Enterprise PWAs now open start_url `/` (door landing).
 * Browser and standalone both get the marketing/product home first; sign-in is opt-in.
 * Kept as a no-op mount so older imports do not break if referenced elsewhere.
 */
export function StandaloneHomeToLoginRedirect() {
  return null;
}
