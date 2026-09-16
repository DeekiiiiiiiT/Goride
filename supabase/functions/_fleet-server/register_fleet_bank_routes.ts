/**
 * Peeled from index.tsx — Wave F0. Behavior unchanged.
 */
import type { Hono } from "npm:hono@4.3.11";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission, type RbacUser } from "./rbac_middleware.ts";
import { stampOrg, filterByOrg, belongsToOrg, getOrgId } from "./org_scope.ts";

export function registerFleetBankRoutes(app: Hono) {
  // ─── Fleet bank receive confirms (ops only — never feeds Cash Returned / Settlement) ──
  // New key: fleet_bank_confirm:org:{organizationId}:{weekStartYmd}
  // Legacy key: fleet_bank_confirm:{driverId}:{weekStartYmd} (dual-read on clients)

  app.get("/make-server-37f42386/fleet-bank-confirms", requireAuth(), async (c) => {
    try {
      const items = (await kv.getByPrefix("fleet_bank_confirm:")) || [];
      return c.json({ data: filterByOrg(items, c) });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.put("/make-server-37f42386/fleet-bank-confirms", requireAuth(), requirePermission("transactions.edit"), async (c) => {
    try {
      const body = await c.req.json();
      const weekStartYmd = String(body?.weekStartYmd || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartYmd)) {
        return c.json({ error: "weekStartYmd (yyyy-MM-dd) is required" }, 400);
      }
      const amountReceived = Number(body?.amountReceived);
      if (!Number.isFinite(amountReceived) || amountReceived < 0) {
        return c.json({ error: "amountReceived must be a non-negative number" }, 400);
      }
      const rbacUser = c.get("rbacUser") as RbacUser | undefined;
      const orgId = String(body?.organizationId || getOrgId(c) || "").trim();
      const legacyDriverId = String(body?.driverId || "").trim();

      // Prefer org-week confirm (bank deposits are fleet money).
      const confirmMethod =
        String(body?.confirmMethod || "").toLowerCase() === "statement" ? "statement" : "manual";
      const bankDateYmdRaw = String(body?.bankDateYmd || "").trim();
      const bankDateYmd = /^\d{4}-\d{2}-\d{2}$/.test(bankDateYmdRaw) ? bankDateYmdRaw : undefined;
      const statementFileName = String(body?.statementFileName || "").trim() || undefined;
      const platformRaw = String(body?.platform || "uber").toLowerCase();
      const platform =
        platformRaw === "indrive" || platformRaw === "roam" || platformRaw === "uber"
          ? platformRaw
          : "uber";

      if (orgId) {
        const record = stampOrg(
          {
            id: `org:${orgId}:${weekStartYmd}:${platform}`,
            organizationId: orgId,
            weekStartYmd,
            recipient: "org" as const,
            status: "confirmed" as const,
            amountReceived: Math.round(amountReceived * 100) / 100,
            expectedAmount:
              body?.expectedAmount != null && Number.isFinite(Number(body.expectedAmount))
                ? Math.round(Number(body.expectedAmount) * 100) / 100
                : undefined,
            confirmMethod,
            bankDateYmd,
            statementFileName,
            platform,
            confirmedAt: new Date().toISOString(),
            confirmedBy: rbacUser?.userId || rbacUser?.email || "unknown",
          },
          c,
        );
        // Platform-scoped key so Uber wire + Roam card can confirm the same week independently.
        await kv.set(`fleet_bank_confirm:org:${orgId}:${weekStartYmd}:${platform}`, record);
        // Uber also dual-writes legacy week-only key for Settlement readers not yet platform-aware.
        if (platform === "uber") {
          await kv.set(`fleet_bank_confirm:org:${orgId}:${weekStartYmd}`, record);
        }
        return c.json({ success: true, data: record });
      }

      // Legacy fallback when session has no org id.
      if (!legacyDriverId) {
        return c.json({ error: "organizationId (or legacy driverId) is required" }, 400);
      }
      const record = stampOrg(
        {
          id: `${legacyDriverId}:${weekStartYmd}`,
          driverId: legacyDriverId,
          weekStartYmd,
          recipient: "driver" as const,
          status: "confirmed" as const,
          amountReceived: Math.round(amountReceived * 100) / 100,
          expectedAmount:
            body?.expectedAmount != null && Number.isFinite(Number(body.expectedAmount))
              ? Math.round(Number(body.expectedAmount) * 100) / 100
              : undefined,
          confirmMethod,
          bankDateYmd,
          statementFileName,
          platform,
          confirmedAt: new Date().toISOString(),
          confirmedBy: rbacUser?.userId || rbacUser?.email || "unknown",
        },
        c,
      );
      await kv.set(`fleet_bank_confirm:${legacyDriverId}:${weekStartYmd}`, record);
      return c.json({ success: true, data: record });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  /** Unconfirm — removes org (and optional legacy driver) receive record. */
  app.delete("/make-server-37f42386/fleet-bank-confirms", requireAuth(), requirePermission("transactions.edit"), async (c) => {
    try {
      const weekStartYmd = String(c.req.query("weekStartYmd") || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartYmd)) {
        return c.json({ error: "weekStartYmd (yyyy-MM-dd) is required" }, 400);
      }
      const orgId = String(c.req.query("organizationId") || getOrgId(c) || "").trim();
      const legacyDriverId = String(c.req.query("driverId") || "").trim();
      const platformRaw = String(c.req.query("platform") || "uber").toLowerCase();
      const platform =
        platformRaw === "indrive" || platformRaw === "roam" || platformRaw === "uber"
          ? platformRaw
          : "uber";
      const keys: string[] = [];
      if (orgId) {
        keys.push(`fleet_bank_confirm:org:${orgId}:${weekStartYmd}:${platform}`);
        // Uber unconfirm also clears legacy week-only key.
        if (platform === "uber") {
          keys.push(`fleet_bank_confirm:org:${orgId}:${weekStartYmd}`);
        }
      }
      if (legacyDriverId) keys.push(`fleet_bank_confirm:${legacyDriverId}:${weekStartYmd}`);
      if (keys.length === 0) {
        return c.json({ error: "organizationId (or legacy driverId) is required" }, 400);
      }
      for (const key of keys) {
        const existing = await kv.get(key);
        if (existing && !belongsToOrg(existing as Record<string, unknown>, c)) {
          return c.json({ error: "Not found" }, 404);
        }
        if (existing) await kv.del(key);
      }
      // Also clear any legacy driver-keyed confirms for this week in-org (dual-write cleanup).
      if (orgId && !legacyDriverId && platform === "uber") {
        const all = (await kv.getByPrefix("fleet_bank_confirm:")) || [];
        const scoped = filterByOrg(all, c) as Array<Record<string, unknown>>;
        for (const row of scoped) {
          if (String(row.weekStartYmd || "") !== weekStartYmd) continue;
          if (row.recipient === "org") continue;
          const did = String(row.driverId || "").trim();
          if (!did) continue;
          await kv.del(`fleet_bank_confirm:${did}:${weekStartYmd}`);
        }
      }
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── Per-tenant organization platform UUID settings ──
  // Key: organization_settings:{organizationId}

  app.get("/make-server-37f42386/organization-settings", requireAuth(), async (c) => {
    try {
      const orgId = String(c.req.query("organizationId") || getOrgId(c) || "").trim();
      if (!orgId) return c.json({ error: "organizationId required" }, 400);
      const key = `organization_settings:${orgId}`;
      const existing = (await kv.get(key)) || {};
      if (existing && typeof existing === "object" && Object.keys(existing).length > 0) {
        if (!belongsToOrg(existing as Record<string, unknown>, c) && (existing as any).organizationId) {
          return c.json({ error: "Not found" }, 404);
        }
      }
      return c.json({
        data: {
          organizationId: orgId,
          uberOrganizationUuid: String((existing as any).uberOrganizationUuid || "").trim() || null,
          roamOrganizationUuid: String((existing as any).roamOrganizationUuid || "").trim() || null,
          inDriveOrganizationUuid: String((existing as any).inDriveOrganizationUuid || "").trim() || null,
        },
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.put("/make-server-37f42386/organization-settings", requireAuth(), async (c) => {
    try {
      const body = await c.req.json();
      const orgId = String(body?.organizationId || getOrgId(c) || "").trim();
      if (!orgId) return c.json({ error: "organizationId required" }, 400);
      const key = `organization_settings:${orgId}`;
      const prev = (await kv.get(key)) || {};
      const record = stampOrg(
        {
          ...(typeof prev === "object" && prev ? prev : {}),
          organizationId: orgId,
          uberOrganizationUuid:
            body?.uberOrganizationUuid != null
              ? String(body.uberOrganizationUuid).trim() || null
              : (prev as any).uberOrganizationUuid ?? null,
          roamOrganizationUuid:
            body?.roamOrganizationUuid != null
              ? String(body.roamOrganizationUuid).trim() || null
              : (prev as any).roamOrganizationUuid ?? null,
          inDriveOrganizationUuid:
            body?.inDriveOrganizationUuid != null
              ? String(body.inDriveOrganizationUuid).trim() || null
              : (prev as any).inDriveOrganizationUuid ?? null,
          updatedAt: new Date().toISOString(),
        },
        c,
      );
      await kv.set(key, record);
      return c.json({ success: true, data: record });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Client-parsed bank statement batches (re-open / audit). Does not write Cash Returned.
  app.get("/make-server-37f42386/fleet-bank-statements", requireAuth(), async (c) => {
    try {
      const items = (await kv.getByPrefix("fleet_bank_statement:")) || [];
      return c.json({ data: filterByOrg(items, c) });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.put("/make-server-37f42386/fleet-bank-statements", requireAuth(), async (c) => {
    try {
      const body = await c.req.json();
      const fileName = String(body?.fileName || "statement.csv").trim();
      const lines = Array.isArray(body?.lines) ? body.lines : [];
      const id = String(body?.id || crypto.randomUUID());
      const rbacUser = c.get("rbacUser") as RbacUser | undefined;
      const record = stampOrg(
        {
          id,
          fileName,
          lines,
          dismissedLineIndexes: Array.isArray(body?.dismissedLineIndexes)
            ? body.dismissedLineIndexes
            : [],
          uploadedAt: new Date().toISOString(),
          uploadedBy: rbacUser?.userId || rbacUser?.email || "unknown",
        },
        c,
      );
      await kv.set(`fleet_bank_statement:${id}`, record);
      return c.json({ success: true, data: record });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

}
