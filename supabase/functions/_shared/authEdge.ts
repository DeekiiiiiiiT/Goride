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
  app_metadata?: Record<string, unknown>;
}): string | undefined {
  // Prefer app_metadata roles for authz; surface is display-only after Wave 3
  const roles = getJwtRoles(user);
  if (roles.includes("driver")) return "driver";
  if (roles.includes("hauler")) return "hauler";
  if (roles.includes("passenger")) return "passenger";
  const surface = user.user_metadata?.surface;
  if (typeof surface === "string" && surface.trim()) return surface.trim();
  return undefined;
}

/** Passenger app routes — allow passenger JWT role (app_metadata) or unmarked users. */
export function allowsPassengerSurface(user: {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}): boolean {
  const roles = getJwtRoles(user);
  if (roles.includes("passenger")) return true;
  if (roles.includes("driver") || roles.includes("hauler")) return false;
  const role = ridesUserSurfaceRole(user);
  if (!role) return true;
  return role === "passenger";
}

/**
 * Driver / hauler dispatch routes — app_metadata roles only.
 * Callers that need profile-backed access should pass hasDriverOrHaulerProfile=true after a DB lookup.
 */
export function allowsHaulerOrDriverSurface(
  user: {
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  },
  hasDriverOrHaulerProfile = false,
): boolean {
  if (hasDriverOrHaulerProfile) return true;
  const roles = getJwtRoles(user);
  return roles.includes("driver") || roles.includes("hauler");
}

/** Shared gate for contacts, Roam Tag, book-for-others, and related passenger APIs. */
export function deniesPassengerSurface(user: {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}): boolean {
  return !allowsPassengerSurface(user);
}

/** True when user has a driver_profiles (or hauler) row — for surface gates. */
export async function hasDriverOrHaulerProfile(
  userId: string,
  lookup: (userId: string) => Promise<boolean>,
): Promise<boolean> {
  return lookup(userId);
}

/**
 * Driver/hauler gate: app_metadata roles OR verified profile via lookup.
 */
export async function allowsHaulerOrDriverSurfaceAsync(
  user: {
    id: string;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  },
  profileLookup: (userId: string) => Promise<boolean>,
): Promise<boolean> {
  if (allowsHaulerOrDriverSurface(user)) return true;
  return profileLookup(user.id);
}

/** All roles on JWT from app_metadata only (never user_metadata). */
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
 * Primary role: app_metadata.role, else first app_metadata.roles[].
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
  return "";
}

export function jsonEdgeForbidden(
  c: { json: (body: unknown, status?: number) => Response },
  kind: EdgeForbiddenError,
  status = 403,
): Response {
  return c.json({ error: kind }, status);
}
