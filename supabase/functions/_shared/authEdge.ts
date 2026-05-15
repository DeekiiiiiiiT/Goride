/**
 * Shared JWT / user_metadata helpers for Supabase Edge Functions (Deno).
 * Keep responses small and consistent: `{ error: "forbidden" | "forbidden_role" }` at 403.
 */

export type EdgeForbiddenError = "forbidden" | "forbidden_role";

export function ridesUserSurfaceRole(user: {
  user_metadata?: Record<string, unknown>;
}): string | undefined {
  const r = user.user_metadata?.role;
  return typeof r === "string" ? r : undefined;
}

/** Prefer app_metadata.role, then user_metadata.role (matches delivery admin guard). */
export function jwtPrimaryRole(user: {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}): string {
  const app = user.app_metadata?.role;
  if (typeof app === "string" && app.trim()) return app.trim();
  const um = user.user_metadata?.role;
  if (typeof um === "string" && um.trim()) return um.trim();
  return "";
}

export function jsonEdgeForbidden(
  c: { json: (body: unknown, status?: number) => Response },
  kind: EdgeForbiddenError,
  status = 403,
): Response {
  return c.json({ error: kind }, status);
}
