/**
 * Phase 2 edge stubs — period list / finalize job / reopen job.
 * Mounted alongside existing fuel routes; full Deno money engine moves here next.
 */
import type { Context } from "npm:hono";
import type { Hono } from "npm:hono";
import { requirePermission } from "./rbac_middleware.ts";
import { getOrgId, stampOrg } from "./org_scope.ts";
import * as kv from "./kv_store.tsx";

const BASE = "/make-server-37f42386";

export function registerFuelPeriodRoutes(app: Hono) {
  app.get(`${BASE}/fuel/periods`, requirePermission("fuel.view"), async (c: Context) => {
    const orgId = getOrgId(c);
    if (!orgId) return c.json({ periods: [] });
    const from = (c.req.query("from") || "").split("T")[0];
    const to = (c.req.query("to") || "").split("T")[0];
    const rows = ((await kv.getByPrefix(`fuel_reconciliation_period:${orgId}:`)) || []) as any[];
    const periods = rows.filter((p) => {
      const wk = String(p.week_start || p.weekStart || "").split("T")[0];
      if (from && wk < from) return false;
      if (to && wk > to) return false;
      return true;
    });
    return c.json({ periods });
  });

  app.post(
    `${BASE}/fuel/periods/:id/finalize`,
    requirePermission("transactions.edit"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      const periodId = c.req.param("id");
      const idempotencyKey = c.req.header("Idempotency-Key") || crypto.randomUUID();
      const ifMatch = c.req.header("If-Match");
      const jobId = crypto.randomUUID();
      const job = stampOrg(
        {
          id: jobId,
          periodId,
          orgId,
          kind: "finalize",
          state: "queued",
          idempotencyKey,
          periodVersion: ifMatch ? Number(ifMatch) : 1,
          progress_done: 0,
          progress_total: 0,
          created_at: new Date().toISOString(),
        } as Record<string, unknown>,
        c,
      );
      await kv.set(`fuel_period_job:${orgId || "platform"}:${jobId}`, job);
      return c.json({ jobId, state: "queued" }, 202);
    },
  );

  app.get(`${BASE}/fuel/jobs/:jobId`, requirePermission("fuel.view"), async (c: Context) => {
    const orgId = getOrgId(c) || "platform";
    const jobId = c.req.param("jobId");
    const job = await kv.get(`fuel_period_job:${orgId}:${jobId}`);
    if (!job) return c.json({ error: "Job not found" }, 404);
    return c.json(job);
  });
}
