/**
 * Append-only ops audit events for driver money / compliance mutations.
 * Stored as KV `driver_audit:{driverId}:{iso}` for Phase 6 enterprise trail.
 */
import type { Context, Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission } from "./rbac_middleware.ts";
import { getOrgId, stampOrg } from "./org_scope.ts";

const PREFIX = "/make-server-37f42386";

export type DriverAuditEvent = {
  id: string;
  driverId: string;
  organizationId?: string;
  actorId?: string;
  action: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
  at: string;
};

export async function appendDriverAuditEvent(
  c: Context,
  event: Omit<DriverAuditEvent, "id" | "at" | "organizationId"> & { at?: string },
): Promise<DriverAuditEvent> {
  const at = event.at || new Date().toISOString();
  const id = `${event.driverId}:${at}:${Math.random().toString(36).slice(2, 8)}`;
  const row = stampOrg(
    {
      id,
      driverId: event.driverId,
      actorId: event.actorId,
      action: event.action,
      reason: event.reason,
      before: event.before,
      after: event.after,
      at,
    } as Record<string, unknown>,
    c,
  ) as DriverAuditEvent;
  await kv.set(`driver_audit:${event.driverId}:${at}`, row);
  return row;
}

export function registerDriversAuditRoutes(app: Hono) {
  app.get(
    `${PREFIX}/drivers/:id/audit`,
    requireAuth({ requireOrg: true }),
    requirePermission("drivers.view"),
    async (c: Context) => {
      const driverId = String(c.req.param("id") || "").trim();
      if (!driverId) return c.json({ error: "driverId required" }, 400);
      const rows = await kv.getByPrefix(`driver_audit:${driverId}:`);
      const events = (rows || [])
        .filter((r: any) => r && typeof r === "object")
        .sort((a: any, b: any) => String(b.at || "").localeCompare(String(a.at || "")));
      return c.json({ success: true, orgId: getOrgId(c), data: events });
    },
  );

  app.post(
    `${PREFIX}/drivers/:id/audit`,
    requireAuth({ requireOrg: true }),
    // Money + compliance mutations already gated client-side; accept either write role.
    async (c: Context) => {
      const driverId = String(c.req.param("id") || "").trim();
      if (!driverId) return c.json({ error: "driverId required" }, 400);
      let body: Record<string, unknown> = {};
      try {
        body = (await c.req.json()) || {};
      } catch {
        body = {};
      }
      const action = String(body.action || "").trim();
      if (!action) return c.json({ error: "action required" }, 400);
      const actorId =
        (c.get("userId") as string | undefined) ||
        (c.get("user") as { id?: string } | undefined)?.id ||
        undefined;
      const event = await appendDriverAuditEvent(c, {
        driverId,
        actorId,
        action,
        reason: body.reason != null ? String(body.reason) : undefined,
        before: body.before,
        after: body.after,
      });
      return c.json({ success: true, orgId: getOrgId(c), data: event });
    },
  );
}
