/**
 * Payment ledger line controller — transaction-grain Uber payments_transaction.csv storage.
 * Falls back to Postgres rides.ledger_lines for Roam platform trips.
 *
 * KV keys:
 *   payment_ledger_line:{id}
 *   payment_ledger_line-dedup:{idempotencyKey}
 *   driver_period_snapshot:{driverId}:{batchId}
 */
import { Hono } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const app = new Hono();
const BASE = "/make-server-37f42386/payment-ledger-lines";

function ridesDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { db: { schema: "rides" } },
  );
}

function minorToMajor(minor: number): number {
  return minor / 100;
}

function mapPgLineToPaymentLine(row: Record<string, unknown>): Record<string, unknown> {
  const fb = (row.fare_breakdown ?? {}) as Record<string, number>;
  const pm = row.payment_method === "card" ? "Card"
    : row.payment_method === "cash" ? "Cash"
    : undefined;
  return {
    id: row.id,
    platform: "Roam",
    tripId: row.ride_request_id,
    driverId: row.driver_user_id,
    riderUserId: row.rider_user_id,
    description: row.description,
    reportingAt: row.reporting_at,
    paidToYou: minorToMajor(Number(row.paid_to_you_minor) || 0),
    earningsGross: minorToMajor(Number(row.earnings_gross_minor) || 0),
    cashCollected: minorToMajor(Number(row.cash_collected_minor) || 0),
    bankTransferred: minorToMajor(Number(row.bank_transferred_minor) || 0),
    fareBreakdown: {
      base: minorToMajor(Number(fb.base_minor ?? fb.after_surge_minor ?? 0)),
      surge: minorToMajor(Number(fb.surge_minor ?? 0)),
      waitPickup: minorToMajor(Number(fb.wait_pickup_minor ?? 0)),
      timeAtStop: minorToMajor(Number(fb.time_component_minor ?? 0)),
      cancellation: minorToMajor(Number(fb.cancellation_minor ?? 0)),
      taxes: minorToMajor(Number(fb.taxes_minor ?? 0)),
      tip: minorToMajor(Number(fb.tip_minor ?? 0)),
      tollRefund: minorToMajor(Number(fb.toll_refund_minor ?? 0)),
    },
    sourceType: "roam_completion",
    lineKind: row.line_kind,
    idempotencyKey: row.idempotency_key,
    externalTransactionId: row.idempotency_key,
    paymentMethod: pm,
    currency: "JMD",
  };
}

async function loadRoamLinesByTripId(tripId: string): Promise<Record<string, unknown>[]> {
  const db = ridesDb();
  const { data, error } = await db.from("ledger_lines").select("*").eq(
    "ride_request_id",
    tripId,
  );
  if (error) {
    console.warn("[PaymentLedgerLine] roam lines load failed:", error.message);
    return [];
  }
  return (data ?? []).map((row) => mapPgLineToPaymentLine(row as Record<string, unknown>));
}

app.post(`${BASE}/import`, async (c) => {
  try {
    const body = await c.req.json();
    const lines: unknown[] = body.lines || [];
    if (!Array.isArray(lines) || lines.length === 0) {
      return c.json({ imported: 0, skipped: 0, total: 0, message: "No lines provided" });
    }

    let imported = 0;
    let skipped = 0;

    for (const raw of lines) {
      const line = raw as Record<string, unknown>;
      const idempotencyKey = String(line.idempotencyKey || "").trim();
      const id = String(line.id || idempotencyKey || "").trim();
      if (!id || !idempotencyKey) {
        skipped++;
        continue;
      }

      const dedupKey = `payment_ledger_line-dedup:${idempotencyKey}`;
      const existing = await kv.get(dedupKey);
      if (existing) {
        skipped++;
        continue;
      }

      const record = {
        ...line,
        id,
        importedAt: new Date().toISOString(),
      };

      await kv.set(`payment_ledger_line:${id}`, record);
      await kv.set(dedupKey, id);
      imported++;
    }

    return c.json({
      imported,
      skipped,
      total: lines.length,
      message: `Imported ${imported} payment ledger line(s), skipped ${skipped}`,
    });
  } catch (e) {
    console.error("[PaymentLedgerLine] import error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.post(`${BASE}/driver-quality-snapshots/import`, async (c) => {
  try {
    const body = await c.req.json();
    const snapshots: unknown[] = body.snapshots || [];
    const batchId = String(body.batchId || "").trim();
    if (!batchId || !Array.isArray(snapshots)) {
      return c.json({ error: "batchId and snapshots required" }, 400);
    }
    let imported = 0;
    for (const raw of snapshots) {
      const snap = raw as Record<string, unknown>;
      const driverId = String(snap.driverId || "").trim().toLowerCase();
      if (!driverId) continue;
      const key = `driver_period_snapshot:${driverId}:${batchId}`;
      await kv.set(key, { ...snap, batchId, importedAt: new Date().toISOString() });
      imported++;
    }
    return c.json({ imported, batchId });
  } catch (e) {
    console.error("[PaymentLedgerLine] driver quality snapshot import error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.get(`${BASE}/driver-quality-snapshots`, async (c) => {
  try {
    const batchId = c.req.query("batchId")?.trim();
    const driverId = c.req.query("driverId")?.trim().toLowerCase();
    const rows = await kv.getByPrefix("driver_period_snapshot:");
    const all = Array.isArray(rows) ? rows : [];
    let filtered = all.filter((s: Record<string, unknown>) => {
      if (batchId && String(s.batchId || "") !== batchId) return false;
      if (driverId && String(s.driverId || "").toLowerCase() !== driverId) return false;
      return true;
    });
    return c.json({ data: filtered, total: filtered.length });
  } catch (e) {
    return c.json({ error: String(e), data: [], total: 0 }, 500);
  }
});

app.get(`${BASE}`, async (c) => {
  try {
    const tripId = c.req.query("tripId")?.trim().toLowerCase();
    const batchId = c.req.query("batchId")?.trim();
    const driverId = c.req.query("driverId")?.trim().toLowerCase();
    const from = c.req.query("from")?.trim();
    const to = c.req.query("to")?.trim();
    const platform = c.req.query("platform")?.trim().toLowerCase();

    if (platform === "roam" && tripId) {
      const roamLines = await loadRoamLinesByTripId(tripId);
      return c.json({ data: roamLines, total: roamLines.length, source: "postgres" });
    }

    const rows = await kv.getByPrefix("payment_ledger_line:");
    const all = Array.isArray(rows) ? rows : [];

    let filtered = all.filter((line: Record<string, unknown>) => {
      if (tripId && String(line.tripId || "").toLowerCase() !== tripId) return false;
      if (batchId && String(line.batchId || "") !== batchId) return false;
      if (driverId && String(line.driverId || "").toLowerCase() !== driverId) return false;
      if (from) {
        const d = String(line.reportingAt || line.date || "").slice(0, 10);
        if (d && d < from) return false;
      }
      if (to) {
        const d = String(line.reportingAt || line.date || "").slice(0, 10);
        if (d && d > to) return false;
      }
      return true;
    });

    if (tripId && filtered.length === 0) {
      const roamLines = await loadRoamLinesByTripId(tripId);
      if (roamLines.length > 0) {
        return c.json({ data: roamLines, total: roamLines.length, source: "postgres" });
      }
    }

    filtered.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const da = String(a.reportingAt || "");
      const db = String(b.reportingAt || "");
      return db.localeCompare(da);
    });

    return c.json({ data: filtered, total: filtered.length, source: "kv" });
  } catch (e) {
    console.error("[PaymentLedgerLine] list error:", e);
    return c.json({ error: String(e), data: [], total: 0 }, 500);
  }
});

export default app;
