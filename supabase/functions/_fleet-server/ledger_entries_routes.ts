/**
 * Unified ledger read-model routes (Phase 4).
 * Behind FEATURE_FLAGS.LEDGER_READ_MODEL or env LEDGER_READ_MODEL=1.
 */
import type { Hono } from "npm:hono";
import { requireAuth } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
import { getServiceClient } from "./service_client.ts";
import { FEATURE_FLAGS, isFeatureEnabled } from "./feature_flags.ts";

async function readModelEnabled(orgId?: string | null): Promise<boolean> {
  if (Deno.env.get("LEDGER_READ_MODEL") === "1") return true;
  try {
    return await isFeatureEnabled(
      (FEATURE_FLAGS as Record<string, string>).LEDGER_READ_MODEL || "ledger_read_model",
      orgId,
    );
  } catch {
    return false;
  }
}

export function registerLedgerEntriesRoutes(app: Hono) {
  app.post("/make-server-37f42386/ledger/search", requireAuth({ requireOrg: true }), async (c) => {
    const orgId = getOrgId(c);
    if (!(await readModelEnabled(orgId))) {
      return c.json({ error: "ledger_read_model_disabled" }, 404);
    }
    const body = await c.req.json().catch(() => ({}));
    const {
      entryType,
      startDate,
      endDate,
      limit = 50,
      cursor,
    } = body as {
      entryType?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      cursor?: string;
    };

    const db = getServiceClient();
    let q = db.from("fleet_ledger_entries").select("*").eq("organization_id", orgId!);
    if (entryType) q = q.eq("entry_type", entryType);
    if (startDate) q = q.gte("occurred_at", `${String(startDate).slice(0, 10)}T00:00:00Z`);
    if (endDate) q = q.lte("occurred_at", `${String(endDate).slice(0, 10)}T23:59:59Z`);
    if (cursor) {
      // keyset: occurred_at|entry_id
      const [occ, id] = String(cursor).split("|");
      if (occ && id) {
        q = q.or(`occurred_at.lt.${occ},and(occurred_at.eq.${occ},entry_id.lt.${id})`);
      }
    }
    const pageSize = Math.min(Number(limit) || 50, 500);
    q = q.order("occurred_at", { ascending: false }).order("entry_id", { ascending: false }).limit(pageSize);

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    const entries = data || [];
    const last = entries[entries.length - 1] as { occurred_at?: string; entry_id?: string } | undefined;
    const next_cursor =
      entries.length === pageSize && last?.occurred_at && last?.entry_id
        ? `${last.occurred_at}|${last.entry_id}`
        : null;
    return c.json({ entries, next_cursor, applied_filters: { entryType, startDate, endDate } });
  });

  app.post("/make-server-37f42386/ledger/stats", requireAuth({ requireOrg: true }), async (c) => {
    const orgId = getOrgId(c);
    if (!(await readModelEnabled(orgId))) {
      return c.json({ error: "ledger_read_model_disabled" }, 404);
    }
    const body = await c.req.json().catch(() => ({}));
    const { entryType, startDate, endDate } = body as {
      entryType?: string;
      startDate?: string;
      endDate?: string;
    };
    const db = getServiceClient();
    let q = db
      .from("fleet_ledger_entries")
      .select("amount_gross, amount_net, entry_type, source_system")
      .eq("organization_id", orgId!);
    if (entryType) q = q.eq("entry_type", entryType);
    if (startDate) q = q.gte("occurred_at", `${String(startDate).slice(0, 10)}T00:00:00Z`);
    if (endDate) q = q.lte("occurred_at", `${String(endDate).slice(0, 10)}T23:59:59Z`);
    const { data, error } = await q.limit(100000);
    if (error) return c.json({ error: error.message }, 500);
    const rows = data || [];
    let sum_gross = 0;
    let sum_net = 0;
    const by_type: Record<string, number> = {};
    const by_platform: Record<string, number> = {};
    for (const r of rows as any[]) {
      sum_gross += Number(r.amount_gross) || 0;
      if (r.amount_net != null) sum_net += Number(r.amount_net) || 0;
      by_type[r.entry_type] = (by_type[r.entry_type] || 0) + 1;
      by_platform[r.source_system] = (by_platform[r.source_system] || 0) + 1;
    }
    return c.json({
      count: rows.length,
      sum_gross,
      sum_net,
      by_type: Object.entries(by_type).map(([k, v]) => ({ type: k, count: v })),
      by_platform: Object.entries(by_platform).map(([k, v]) => ({ platform: k, count: v })),
    });
  });

  app.post("/make-server-37f42386/ledger/export", requireAuth({ requireOrg: true }), async (c) => {
    const orgId = getOrgId(c);
    if (!(await readModelEnabled(orgId))) {
      return c.json({ error: "ledger_read_model_disabled" }, 404);
    }
    const body = await c.req.json().catch(() => ({}));
    const { entryType, startDate, endDate } = body as {
      entryType?: string;
      startDate?: string;
      endDate?: string;
    };
    const db = getServiceClient();
    let q = db.from("fleet_ledger_entries").select("*").eq("organization_id", orgId!);
    if (entryType) q = q.eq("entry_type", entryType);
    if (startDate) q = q.gte("occurred_at", `${String(startDate).slice(0, 10)}T00:00:00Z`);
    if (endDate) q = q.lte("occurred_at", `${String(endDate).slice(0, 10)}T23:59:59Z`);
    const { data, error } = await q.order("occurred_at", { ascending: false }).limit(10000);
    if (error) return c.json({ error: error.message }, 500);
    const esc = (val: unknown) => {
      let s = String(val ?? "");
      const isPlainNumber = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s);
      if (!isPlainNumber && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const header = ["entry_id", "entry_type", "occurred_at", "period_key", "amount_gross", "amount_net", "currency", "status"].join(",");
    const lines = (data || []).map((r: any) =>
      [r.entry_id, r.entry_type, r.occurred_at, r.period_key, r.amount_gross, r.amount_net, r.currency, r.status]
        .map(esc)
        .join(",")
    );
    const csv = `\uFEFF${[header, ...lines].join("\r\n")}`;
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", 'attachment; filename="ledger_entries_export.csv"');
    return c.body(csv);
  });
}
