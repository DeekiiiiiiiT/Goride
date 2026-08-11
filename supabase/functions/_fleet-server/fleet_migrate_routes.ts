/**
 * Generic KV→fleet.* migrate + parity admin routes for all domains.
 */
import type { Context, Hono } from "npm:hono";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { FLEET_DOMAINS } from "./fleet_domains.ts";
import { fleetDb, countTable, fleetTable } from "./repos/baseRepo.ts";
import type { FleetDomain } from "./fleet_table_flags.ts";
import { requireAuth, requirePermission } from "./rbac_middleware.ts";

type RouteApp = Hono;

function publicKvClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function loadKvPrefix(prefix: string): Promise<{ key: string; value: Record<string, unknown> }[]> {
  const sb = publicKvClient();
  const out: { key: string; value: Record<string, unknown> }[] = [];
  const PAGE = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from("kv_store_37f42386")
      .select("key, value")
      .like("key", `${prefix}%`)
      .order("key", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const page = (data || []) as { key: string; value: Record<string, unknown> }[];
    out.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

export function registerFleetMigrateRoutes(app: RouteApp): void {
  app.get(
    "/make-server-37f42386/admin/fleet-domains",
    requireAuth(),
    requirePermission("data.backfill"),
    async (c: Context) => {
      return c.json({
        domains: FLEET_DOMAINS.map((d) => ({
          domain: d.domain,
          table: d.table,
          prefixes: d.prefixes,
        })),
      });
    },
  );

  app.post(
    "/make-server-37f42386/admin/migrate-fleet-domain-from-kv",
    requireAuth(),
    requirePermission("data.backfill"),
    async (c: Context) => {
      try {
        const body = await c.req.json().catch(() => ({}));
        const domain = String(body?.domain || "").trim() as FleetDomain;
        const def = FLEET_DOMAINS.find((d) => d.domain === domain);
        if (!def) return c.json({ error: `Unknown domain. Pass { domain }.` }, 400);

        let inserted = 0;
        let updated = 0;
        let skipped = 0;
        let scanned = 0;

        for (const prefix of def.prefixes) {
          const rows = await loadKvPrefix(prefix);
          scanned += rows.length;
          for (const row of rows) {
            if (!row.value || typeof row.value !== "object") {
              skipped++;
              continue;
            }
            const mapped = def.mapRow(row.key, row.value);
            if (!mapped) {
              skipped++;
              continue;
            }
            const { data: existing } = await fleetDb()
              .from(fleetTable(def.table))
              .select("id")
              .eq("legacy_kv_id", row.key)
              .maybeSingle();
            const { error } = await fleetDb().from(fleetTable(def.table)).upsert(mapped, { onConflict: "id" });
            if (error) {
              console.warn(`[migrate-fleet ${domain}]`, row.key, error.message);
              skipped++;
            } else if (existing) {
              updated++;
            } else {
              inserted++;
            }
          }
        }

        return c.json({
          ok: true,
          domain,
          table: def.table,
          scanned,
          inserted,
          updated,
          skipped,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  app.post(
    "/make-server-37f42386/admin/migrate-fleet-all-from-kv",
    requireAuth(),
    requirePermission("data.backfill"),
    async (c: Context) => {
      const results: Record<string, unknown>[] = [];
      for (const def of FLEET_DOMAINS) {
        let inserted = 0;
        let skipped = 0;
        let scanned = 0;
        try {
          for (const prefix of def.prefixes) {
            const rows = await loadKvPrefix(prefix);
            scanned += rows.length;
            for (const row of rows) {
              if (!row.value || typeof row.value !== "object") {
                skipped++;
                continue;
              }
              const mapped = def.mapRow(row.key, row.value);
              if (!mapped) {
                skipped++;
                continue;
              }
              const { error } = await fleetDb().from(fleetTable(def.table)).upsert(mapped, { onConflict: "id" });
              if (error) skipped++;
              else inserted++;
            }
          }
          results.push({ domain: def.domain, ok: true, scanned, inserted, skipped });
        } catch (e) {
          results.push({
            domain: def.domain,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return c.json({ ok: true, results });
    },
  );

  app.get(
    "/make-server-37f42386/admin/parity/:domain",
    requireAuth(),
    requirePermission("data.backfill"),
    async (c: Context) => {
      try {
        const domain = c.req.param("domain") as FleetDomain;
        const def = FLEET_DOMAINS.find((d) => d.domain === domain);
        if (!def) return c.json({ error: "Unknown domain" }, 400);

        let kvCount = 0;
        for (const prefix of def.prefixes) {
          const rows = await loadKvPrefix(prefix);
          kvCount += rows.length;
        }
        const tableCount = await countTable(domain);
        const delta = tableCount - kvCount;
        return c.json({
          domain,
          table: def.table,
          kvCount,
          tableCount,
          delta,
          ok: delta === 0 || Math.abs(delta) / Math.max(kvCount, 1) < 0.02,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  app.get(
    "/make-server-37f42386/admin/parity",
    requireAuth(),
    requirePermission("data.backfill"),
    async (c: Context) => {
      const out: Record<string, unknown>[] = [];
      for (const def of FLEET_DOMAINS) {
        try {
          let kvCount = 0;
          for (const prefix of def.prefixes) {
            kvCount += (await loadKvPrefix(prefix)).length;
          }
          const tableCount = await countTable(def.domain);
          out.push({
            domain: def.domain,
            kvCount,
            tableCount,
            delta: tableCount - kvCount,
          });
        } catch (e) {
          out.push({
            domain: def.domain,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return c.json({ domains: out });
    },
  );

  /** Backup KV prefix into fleet_kv_backup: keys, then optionally delete originals. */
  app.post(
    "/make-server-37f42386/admin/retire-fleet-kv-prefix",
    requireAuth(),
    requirePermission("data.backfill"),
    async (c: Context) => {
      try {
        const body = await c.req.json().catch(() => ({}));
        const domain = String(body?.domain || "").trim() as FleetDomain;
        const confirm = String(body?.confirm || "");
        const dryRun = body?.dryRun === true;
        const def = FLEET_DOMAINS.find((d) => d.domain === domain);
        if (!def) return c.json({ error: "Unknown domain" }, 400);
        if (!dryRun && confirm !== `RETIRE_KV_${domain.toUpperCase()}`) {
          return c.json({
            error: `Send { dryRun: true } or { confirm: "RETIRE_KV_${domain.toUpperCase()}" }`,
          }, 400);
        }

        const backupTable = `kv_backup_${domain}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
        const sb = publicKvClient();

        let backedUp = 0;
        let deleted = 0;
        for (const prefix of def.prefixes) {
          const rows = await loadKvPrefix(prefix);
          for (const row of rows) {
            const backupKey = `fleet_kv_backup:${domain}:${row.key}`;
            if (!dryRun) {
              await sb.from("kv_store_37f42386").upsert({
                key: backupKey,
                value: { domain, originalKey: row.key, value: row.value, at: new Date().toISOString() },
              });
            }
            backedUp++;
          }
          if (!dryRun) {
            const keys = rows.map((r) => r.key);
            for (let i = 0; i < keys.length; i += 100) {
              const chunk = keys.slice(i, i + 100);
              const { error } = await sb.from("kv_store_37f42386").delete().in("key", chunk);
              if (!error) deleted += chunk.length;
            }
          }
        }

        return c.json({
          ok: true,
          dryRun,
          domain,
          backupTableHint: backupTable,
          backupKeyPrefix: `fleet_kv_backup:${domain}:`,
          backedUp,
          deleted: dryRun ? 0 : deleted,
          note: "Set LEGACY_KV_WRITE_<DOMAIN>=0 and FLEET_READ_TABLE_<DOMAIN>=1 before retiring.",
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  /** Finish maintenance_log → maintenance_records retirement helper (wave 6). */
  app.get(
    "/make-server-37f42386/admin/parity/maintenance_records",
    requireAuth(),
    requirePermission("data.backfill"),
    async (c: Context) => {
      try {
        const kvRows = await loadKvPrefix("maintenance_log:");
        const sb = publicKvClient();
        const { count, error } = await sb
          .from("maintenance_records")
          .select("*", { count: "exact", head: true });
        if (error) throw error;
        return c.json({
          domain: "maintenance_records",
          kvCount: kvRows.length,
          tableCount: count ?? 0,
          delta: (count ?? 0) - kvRows.length,
          note: "Use POST /admin/migrate-maintenance-from-kv then retire maintenance_log: prefix.",
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  app.get(
    "/make-server-37f42386/admin/fleet-dual-write-metrics",
    requireAuth(),
    requirePermission("data.backfill"),
    async (c: Context) => {
      try {
        const limit = Math.min(parseInt(c.req.query("limit") || "100", 10) || 100, 500);
        const domain = c.req.query("domain");
        let q = fleetDb()
          .from("fleet_dual_write_metrics")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (domain) q = q.eq("domain", domain);
        const { data, error } = await q;
        if (error) throw error;
        return c.json({ rows: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );
}
