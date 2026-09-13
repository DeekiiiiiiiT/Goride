/**
 * Fleet Tag + join-request routes.
 * Tag = permanent org handle; join-request = request + approve/deny (invite codes stay separate).
 */
import type { Hono } from "npm:hono";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { RbacUser } from "./rbac_middleware.ts";
import { hasPermission, type Permission } from "./rbac_middleware.ts";
import { checkAcceptRateLimit } from "./workforce_invite_rate_limit.ts";
import type { LinkCourierResult, LinkDriverResult } from "./workforce_link.ts";

const RESERVED_FLEET_TAGS = new Set([
  "admin",
  "support",
  "help",
  "roam",
  "rides",
  "official",
  "system",
  "null",
  "undefined",
  "fleet",
  "roamfleet",
  "driver",
  "courier",
]);

function generateInternalFleetTagId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint8Array(10);
  crypto.getRandomValues(arr);
  const body = Array.from(arr, (b) => chars[b % chars.length]).join("");
  return `FT-${body}`;
}

export function normalizeFleetTagName(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, "");
}

/** Returns error code or null if valid. */
export function validateFleetTagName(raw: string): string | null {
  const name = normalizeFleetTagName(raw);
  if (name.length < 3 || name.length > 24) return "tag_length";
  if (!/^[a-z0-9_]+$/.test(name)) return "tag_format";
  if (RESERVED_FLEET_TAGS.has(name)) return "tag_reserved";
  if (/^ft[-_]?[a-z0-9]+$/i.test(name)) return "tag_reserved";
  if (/^rt[-_]?[a-z0-9]+$/i.test(name)) return "tag_reserved";
  return null;
}

function tagValidationMessage(code: string): string {
  switch (code) {
    case "tag_length":
      return "Fleet Tag must be 3–24 characters";
    case "tag_format":
      return "Fleet Tag may only use letters, numbers, and underscores";
    case "tag_reserved":
      return "That Fleet Tag is reserved";
    default:
      return "Invalid Fleet Tag";
  }
}

function rbacFromContext(c: { get: (k: string) => unknown }): RbacUser | null {
  const user = c.get("rbacUser") as RbacUser | undefined;
  return user?.userId ? user : null;
}

function canManageFleetTag(user: RbacUser): boolean {
  // Owners have users.*; managers manage workforce via drivers.create.
  return hasPermission(user.resolvedRole, "users.invite" as Permission) ||
    hasPermission(user.resolvedRole, "users.edit_role" as Permission) ||
    hasPermission(user.resolvedRole, "drivers.create" as Permission) ||
    user.resolvedRole === "fleet_owner" ||
    user.resolvedRole === "fleet_manager";
}

async function ensureOrgFleetTagInternalId(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ id: string; name: string | null; fleet_tag: string | null; fleet_tag_internal_id: string } | null> {
  const { data: org, error } = await supabase
    .from("organizations")
    .select("id, name, fleet_tag, fleet_tag_internal_id")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!org) return null;

  if (org.fleet_tag_internal_id) {
    return org as {
      id: string;
      name: string | null;
      fleet_tag: string | null;
      fleet_tag_internal_id: string;
    };
  }

  // Rare collision retry
  for (let i = 0; i < 5; i++) {
    const internal = generateInternalFleetTagId();
    const { data: updated, error: upErr } = await supabase
      .from("organizations")
      .update({ fleet_tag_internal_id: internal, updated_at: new Date().toISOString() })
      .eq("id", orgId)
      .is("fleet_tag_internal_id", null)
      .select("id, name, fleet_tag, fleet_tag_internal_id")
      .maybeSingle();
    if (upErr) {
      if (String(upErr.message || "").toLowerCase().includes("duplicate") || upErr.code === "23505") {
        continue;
      }
      throw upErr;
    }
    if (updated?.fleet_tag_internal_id) {
      return updated as {
        id: string;
        name: string | null;
        fleet_tag: string | null;
        fleet_tag_internal_id: string;
      };
    }
    // Another writer won — re-read
    const { data: again } = await supabase
      .from("organizations")
      .select("id, name, fleet_tag, fleet_tag_internal_id")
      .eq("id", orgId)
      .maybeSingle();
    if (again?.fleet_tag_internal_id) {
      return again as {
        id: string;
        name: string | null;
        fleet_tag: string | null;
        fleet_tag_internal_id: string;
      };
    }
  }
  throw new Error("Could not allocate Fleet Tag internal id");
}

async function requesterAlreadyInFleet(
  supabase: SupabaseClient,
  userId: string,
  serviceLine: "rideshare" | "rush_delivery",
): Promise<boolean> {
  if (serviceLine === "rush_delivery") {
    const { data } = await supabase.schema("delivery")
      .from("courier_profiles")
      .select("mode, fleet_id")
      .eq("user_id", userId)
      .maybeSingle();
    return !!(data && data.mode === "fleet" && data.fleet_id);
  }
  const { data } = await supabase
    .from("driver_profiles")
    .select("mode, fleet_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (data && data.mode === "fleet" && data.fleet_id) return true;
  // Auth metadata org link (legacy / parallel)
  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  const orgId = (authUser?.user?.app_metadata as Record<string, unknown> | undefined)?.organizationId;
  const role = String((authUser?.user?.app_metadata as Record<string, unknown> | undefined)?.role ?? "");
  if (orgId && (role === "driver" || String(role).includes("driver"))) return true;
  return false;
}

export function registerFleetTagRoutes(
  app: Hono,
  deps: {
    supabase: SupabaseClient;
    requireAuth: () => unknown;
    getOrgId: (c: { get: (k: string) => unknown }) => string | null;
    linkDriverToFleet: (userId: string, fleetId: string) => Promise<LinkDriverResult>;
    linkCourierToFleet: (userId: string, fleetId: string) => Promise<LinkCourierResult>;
  },
): void {
  // ── Ensure / get own org Fleet Tag ─────────────────────────────────────
  const getOrEnsureMe = async (c: {
    get: (k: string) => unknown;
    json: (body: unknown, status?: number) => Response;
  }) => {
    try {
      const orgId = deps.getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 403);
      const org = await ensureOrgFleetTagInternalId(deps.supabase, orgId);
      if (!org) return c.json({ error: "Organization not found" }, 404);
      return c.json({
        fleet_tag: org.fleet_tag,
        has_fleet_tag: !!org.fleet_tag,
        organization_id: org.id,
        organization_name: org.name,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  };

  app.get("/make-server-37f42386/fleet-tag/me", deps.requireAuth() as never, getOrEnsureMe as never);
  app.post("/make-server-37f42386/fleet-tag/me", deps.requireAuth() as never, getOrEnsureMe as never);

  // ── Set / change public Fleet Tag ──────────────────────────────────────
  app.patch("/make-server-37f42386/fleet-tag/me", deps.requireAuth() as never, async (c) => {
    try {
      const rbacUser = rbacFromContext(c);
      if (!rbacUser) return c.json({ error: "Unauthorized" }, 401);
      if (!canManageFleetTag(rbacUser)) {
        return c.json({ error: "Only fleet owners and managers can set the Fleet Tag" }, 403);
      }
      const orgId = deps.getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 403);

      const body = await c.req.json();
      const raw = String(body.fleetTag ?? body.fleet_tag ?? "");
      const invalid = validateFleetTagName(raw);
      if (invalid) return c.json({ error: tagValidationMessage(invalid), code: invalid }, 400);
      const normalized = normalizeFleetTagName(raw);

      const org = await ensureOrgFleetTagInternalId(deps.supabase, orgId);
      if (!org) return c.json({ error: "Organization not found" }, 404);

      // Permanent after first claim (matches Rider Roam Tag UI lock; enforced server-side for fleets).
      if (org.fleet_tag) {
        if (org.fleet_tag === normalized) {
          return c.json({
            fleet_tag: org.fleet_tag,
            has_fleet_tag: true,
            organization_id: org.id,
            organization_name: org.name,
          });
        }
        return c.json({
          error: "Fleet Tag is permanent and cannot be changed once set",
          code: "tag_locked",
        }, 409);
      }

      const { data: clash } = await deps.supabase
        .from("organizations")
        .select("id")
        .eq("fleet_tag", normalized)
        .neq("id", orgId)
        .maybeSingle();
      if (clash) return c.json({ error: "That Fleet Tag is already taken", code: "tag_taken" }, 409);

      // Also block collision with another org's internal id string (paranoia)
      const { data: internalClash } = await deps.supabase
        .from("organizations")
        .select("id")
        .eq("fleet_tag_internal_id", normalized.toUpperCase())
        .maybeSingle();
      if (internalClash) {
        return c.json({ error: "That Fleet Tag is reserved", code: "tag_reserved" }, 400);
      }

      // Only claim when still null — race-safe lock.
      const { data: updated, error } = await deps.supabase
        .from("organizations")
        .update({ fleet_tag: normalized, updated_at: new Date().toISOString() })
        .eq("id", orgId)
        .is("fleet_tag", null)
        .select("id, name, fleet_tag")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") {
          return c.json({ error: "That Fleet Tag is already taken", code: "tag_taken" }, 409);
        }
        throw error;
      }
      if (!updated) {
        return c.json({
          error: "Fleet Tag is permanent and cannot be changed once set",
          code: "tag_locked",
        }, 409);
      }

      return c.json({
        fleet_tag: updated.fleet_tag,
        has_fleet_tag: !!updated.fleet_tag,
        organization_id: updated.id,
        organization_name: updated.name,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  // ── Public lookup (authenticated driver/courier) ───────────────────────
  app.get("/make-server-37f42386/fleet-tag/lookup/:name", deps.requireAuth() as never, async (c) => {
    try {
      const normalized = normalizeFleetTagName(c.req.param("name") ?? "");
      if (validateFleetTagName(normalized)) {
        return c.json({ error: "Fleet not found" }, 404);
      }
      const { data: org, error } = await deps.supabase
        .from("organizations")
        .select("id, name, fleet_tag, status")
        .eq("fleet_tag", normalized)
        .maybeSingle();
      if (error) throw error;
      if (!org || !org.fleet_tag || org.status === "deactivated" || org.status === "suspended") {
        return c.json({ error: "Fleet not found" }, 404);
      }
      return c.json({
        fleet_tag: org.fleet_tag,
        organization_id: org.id,
        organization_name: org.name,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  // ── Create join request ────────────────────────────────────────────────
  app.post("/make-server-37f42386/workforce/join-requests", deps.requireAuth() as never, async (c) => {
    try {
      const rbacUser = rbacFromContext(c);
      if (!rbacUser) return c.json({ error: "Unauthorized" }, 401);
      const userId = rbacUser.userId;

      if (!(await checkAcceptRateLimit(userId))) {
        return c.json({ error: "Too many join attempts. Try again later." }, 429);
      }

      const body = await c.req.json();
      const serviceLine = body.serviceLine === "rush_delivery" ? "rush_delivery" : "rideshare";
      const rawTag = String(body.fleetTag ?? body.fleet_tag ?? "");
      const invalid = validateFleetTagName(rawTag);
      if (invalid) return c.json({ error: "Enter a valid Fleet Tag" }, 400);
      const tag = normalizeFleetTagName(rawTag);

      if (await requesterAlreadyInFleet(deps.supabase, userId, serviceLine)) {
        return c.json({ error: "Already linked to a fleet" }, 409);
      }

      const { data: org, error: orgErr } = await deps.supabase
        .from("organizations")
        .select("id, name, fleet_tag, status")
        .eq("fleet_tag", tag)
        .maybeSingle();
      if (orgErr) throw orgErr;
      if (!org || org.status === "deactivated" || org.status === "suspended") {
        return c.json({ error: "Fleet not found" }, 404);
      }

      if (serviceLine === "rush_delivery") {
        const { data: existingCourier } = await deps.supabase.schema("delivery")
          .from("courier_profiles")
          .select("user_id")
          .eq("user_id", userId)
          .maybeSingle();
        if (!existingCourier) {
          return c.json({ error: "Complete courier profile setup before joining a fleet" }, 404);
        }
      }

      const { data: existingPending } = await deps.supabase
        .from("fleet_join_requests")
        .select("*")
        .eq("organization_id", org.id)
        .eq("requester_user_id", userId)
        .eq("status", "pending")
        .maybeSingle();
      if (existingPending) {
        return c.json({
          request: existingPending,
          organization_name: org.name,
          fleet_tag: org.fleet_tag,
          message: "Join request already pending",
        });
      }

      // Cancel other pending requests (one active pending overall)
      await deps.supabase
        .from("fleet_join_requests")
        .update({
          status: "cancelled",
          resolved_at: new Date().toISOString(),
          resolved_by: userId,
        })
        .eq("requester_user_id", userId)
        .eq("status", "pending");

      const { data: created, error: insErr } = await deps.supabase
        .from("fleet_join_requests")
        .insert({
          organization_id: String(org.id),
          requester_user_id: userId,
          service_line: serviceLine,
          status: "pending",
        })
        .select("*")
        .single();
      if (insErr) {
        if (insErr.code === "23505") {
          return c.json({ error: "Join request already pending for this fleet" }, 409);
        }
        throw insErr;
      }

      return c.json({
        request: created,
        organization_name: org.name,
        fleet_tag: org.fleet_tag,
        message: "Join request submitted — waiting for fleet approval",
      }, 201);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  // ── List join requests (org staff) ─────────────────────────────────────
  app.get("/make-server-37f42386/workforce/join-requests", deps.requireAuth() as never, async (c) => {
    try {
      const orgId = deps.getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 403);

      const statusFilter = c.req.query("status"); // optional
      let q = deps.supabase
        .from("fleet_join_requests")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (statusFilter === "pending" || statusFilter === "approved" || statusFilter === "denied") {
        q = q.eq("status", statusFilter);
      }

      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];

      const enriched = await Promise.all(rows.map(async (row) => {
        const uid = row.requester_user_id as string;
        let requester_name: string | null = null;
        let requester_email: string | null = null;
        try {
          const { data: authUser } = await deps.supabase.auth.admin.getUserById(uid);
          const u = authUser?.user;
          requester_email = u?.email ?? null;
          const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
          requester_name = (typeof meta.full_name === "string" && meta.full_name) ||
            (typeof meta.name === "string" && meta.name) ||
            (typeof meta.display_name === "string" && meta.display_name) ||
            null;
        } catch {
          /* ignore enrichment failures */
        }
        return { ...row, requester_name, requester_email };
      }));

      return c.json({ requests: enriched });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  // ── Approve ────────────────────────────────────────────────────────────
  app.post(
    "/make-server-37f42386/workforce/join-requests/:id/approve",
    deps.requireAuth() as never,
    async (c) => {
      try {
        const rbacUser = rbacFromContext(c);
        if (!rbacUser) return c.json({ error: "Unauthorized" }, 401);
        if (!canManageFleetTag(rbacUser)) {
          return c.json({ error: "Not allowed to approve join requests" }, 403);
        }
        const orgId = deps.getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 403);

        const id = c.req.param("id");
        const { data: reqRow, error: fetchErr } = await deps.supabase
          .from("fleet_join_requests")
          .select("*")
          .eq("id", id)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!reqRow) return c.json({ error: "Join request not found" }, 404);
        if (reqRow.status !== "pending") {
          return c.json({ error: `Request is already ${reqRow.status}` }, 409);
        }

        const userId = reqRow.requester_user_id as string;
        const serviceLine = String(reqRow.service_line);
        const fleetId = orgId;

        if (serviceLine === "rush_delivery") {
          const linked = await deps.linkCourierToFleet(userId, fleetId);
          if (!linked.success) return c.json({ error: linked.error }, linked.status);
        } else {
          try {
            await deps.linkDriverToFleet(userId, fleetId);
          } catch (e: unknown) {
            const err = e as Error & { status?: number };
            if (err.status === 409) return c.json({ error: err.message }, 409);
            if (err.message === "Fleet not found") return c.json({ error: err.message }, 404);
            throw e;
          }
        }

        const { data: updated, error: upErr } = await deps.supabase
          .from("fleet_join_requests")
          .update({
            status: "approved",
            resolved_at: new Date().toISOString(),
            resolved_by: rbacUser.userId,
          })
          .eq("id", id)
          .eq("status", "pending")
          .select("*")
          .maybeSingle();
        if (upErr) throw upErr;
        if (!updated) return c.json({ error: "Request was already resolved" }, 409);

        return c.json({ success: true, request: updated, fleetId, serviceLine });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  // ── Deny ───────────────────────────────────────────────────────────────
  app.post(
    "/make-server-37f42386/workforce/join-requests/:id/deny",
    deps.requireAuth() as never,
    async (c) => {
      try {
        const rbacUser = rbacFromContext(c);
        if (!rbacUser) return c.json({ error: "Unauthorized" }, 401);
        if (!canManageFleetTag(rbacUser)) {
          return c.json({ error: "Not allowed to deny join requests" }, 403);
        }
        const orgId = deps.getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 403);

        const id = c.req.param("id");
        const { data: updated, error } = await deps.supabase
          .from("fleet_join_requests")
          .update({
            status: "denied",
            resolved_at: new Date().toISOString(),
            resolved_by: rbacUser.userId,
          })
          .eq("id", id)
          .eq("organization_id", orgId)
          .eq("status", "pending")
          .select("*")
          .maybeSingle();
        if (error) throw error;
        if (!updated) return c.json({ error: "Join request not found or already resolved" }, 404);

        return c.json({ success: true, request: updated });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );
}
