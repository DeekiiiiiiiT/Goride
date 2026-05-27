/**
 * Payment ledger line controller — transaction-grain Uber payments_transaction.csv storage.
 *
 * KV keys:
 *   payment_ledger_line:{id}
 *   payment_ledger_line-dedup:{idempotencyKey}
 */
import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";

const app = new Hono();
const BASE = "/make-server-37f42386/payment-ledger-lines";

async function loadAllByPrefix(prefix: string): Promise<Array<{ key: string; value: unknown }>> {
  const batch = await kv.getByPrefix(prefix);
  if (!Array.isArray(batch)) return [];
  return batch.map((value: unknown, i: number) => ({ key: `${prefix}${i}`, value }));
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

app.get(`${BASE}`, async (c) => {
  try {
    const tripId = c.req.query("tripId")?.trim().toLowerCase();
    const batchId = c.req.query("batchId")?.trim();
    const driverId = c.req.query("driverId")?.trim().toLowerCase();
    const from = c.req.query("from")?.trim();
    const to = c.req.query("to")?.trim();

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

    filtered.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const da = String(a.reportingAt || "");
      const db = String(b.reportingAt || "");
      return db.localeCompare(da);
    });

    return c.json({ data: filtered, total: filtered.length });
  } catch (e) {
    console.error("[PaymentLedgerLine] list error:", e);
    return c.json({ error: String(e), data: [], total: 0 }, 500);
  }
});

export default app;
