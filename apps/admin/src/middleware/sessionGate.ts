/**
 * Client companion to Vercel Edge Middleware (apps/<app>/middleware.js).
 * Edge checks sb-*-auth-token cookies; SPA auth today is mostly localStorage,
 * so AuthProvider remains authoritative — this helper shares path rules.
 */

const PUBLIC_PREFIXES = ["/login", "/auth", "/signup", "/reset-password", "/assets"] as const;
const PROTECTED_PREFIXES = ["/dashboard", "/admin", "/app"] as const;

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** True if Cookie header contains a Supabase auth token cookie. */
export function hasSupabaseAuthCookie(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false;
  return /(?:^|;\s*)sb-[^=]+-auth-token=/.test(cookieHeader);
}

/**
 * Soft gate for path-based SPA routes.
 * Returns true when the client should treat the route as requiring a session.
 */
export function requiresSessionGate(pathname: string): boolean {
  return isProtectedPath(pathname) && !isPublicPath(pathname);
}
