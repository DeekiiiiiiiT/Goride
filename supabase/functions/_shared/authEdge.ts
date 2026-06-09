/**
 * Shared JWT / metadata helpers for Supabase Edge Functions (Deno).
 * Keep responses small and consistent: `{ error: "forbidden" | "forbidden_role" }` at 403.
 */

export type EdgeForbiddenError = "forbidden" | "forbidden_role";

function readRolesArray(meta: Record<string, unknown> | undefined): string[] {
  const raw = meta?.roles;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is string => typeof r === "string" && r.trim().length > 0)
    .map((r) => r.trim());
}

export function ridesUserSurfaceRole(user: {
  user_metadata?: Record<string, unknown>;
}): string | undefined {
  const surface = user.user_metadata?.surface;
  if (typeof surface === "string" && surface.trim()) return surface.trim();
  const r = user.user_metadata?.role;
  return typeof r === "string" ? r : undefined;
}

/** Passenger app routes — allow passenger JWT role even when surface metadata says driver. */
export function allowsPassengerSurface(user: {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}): boolean {
  const roles = getJwtRoles(user);
  if (roles.includes("passenger")) return true;
  const role = ridesUserSurfaceRole(user);
  if (!role) return true;
  return role === "passenger";
}

/** All roles on JWT: app_metadata.roles[], else primary, else user_metadata.role */
export function getJwtRoles(user: {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}): string[] {
  const fromApp = readRolesArray(user.app_metadata as Record<string, unknown> | undefined);
  if (fromApp.length > 0) return fromApp;
  const primary = jwtPrimaryRole(user);
  return primary ? [primary] : [];
}

/**
 * Primary role: app_metadata.role, else first roles[], else user_metadata.role.
 */
export function jwtPrimaryRole(user: {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}): string {
  const appMeta = user.app_metadata as Record<string, unknown> | undefined;
  const explicit = appMeta?.role;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();

  const fromArray = readRolesArray(appMeta);
  if (fromArray.length > 0) return fromArray[0];

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
