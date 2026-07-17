/**
 * Shared driver financial period API — Expenses / Settlement / Payout / Reconciliation.
 *
 * Routes:
 *   GET  /driver-financial-periods?driverId=
 *   GET  /driver-financial-periods/:anchor?driverId=
 *   POST /driver-financial-periods/rebuild { driverId, periodAnchor? }
 *   POST /driver-financial-periods/process-outbox
 *   POST /driver-financial-periods/backfill { driverId?, dryRun? }
 *   GET  /driver-financial-periods/health
 */
import { Hono } from "npm:hono";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";
import {
  rebuildDriverFinancialPeriod,
  rebuildAllPeriodsForDriver,
  rebuildPeriodsForAnchors,
  listDriverFinancialPeriods,
  getDriverFinancialPeriodDetail,
  processFinancialOutbox,
} from "./driver_financial_periods.ts";
import {
  postFinancialEvent,
  periodAnchorFor,
  majorToMinor,
} from "./financial_ledger.ts";
import {
  loadAllTollLedgerWithTrips,
  isReconcilableTollExpense,
  filterByDriver,
  loadAllByPrefix,
} from "./toll_controller.tsx";

const app = new Hono();
const BASE = "/make-server-37f42386/driver-financial-periods";

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

app.get(BASE, async (c) => {
  try {
    const driverId = c.req.query("driverId");
    if (!driverId) return c.json({ error: "driverId is required" }, 400);
    // Drain a tiny outbox slice — list must stay fast for Expenses/Settlement.
    await processFinancialOutbox(8);
    let periods = await listDriverFinancialPeriods(driverId);
    if (periods.length === 0) {
      // First paint: rebuild once (shared context). Client can POST /rebuild later.
      await rebuildAllPeriodsForDriver(driverId);
      periods = await listDriverFinancialPeriods(driverId);
    }
    return c.json({ success: true, data: periods });
  } catch (e: any) {
    console.error("[DFP] list error:", e.message);
    return c.json({ error: e.message }, 500);
  }
});

app.get(`${BASE}/health`, async (c) => {
  try {
    const client = sb();
    const [
      { count: pending },
      { count: dead },
      { count: periods },
      { count: events },
      { count: openReopened },
      { data: orphanAlloc },
    ] = await Promise.all([
      client.from("financial_outbox").select("*", { count: "exact", head: true }).eq("status", "pending"),
      client.from("financial_outbox").select("*", { count: "exact", head: true }).eq("status", "dead"),
      client.from("driver_financial_periods").select("*", { count: "exact", head: true }),
      client.from("financial_events").select("*", { count: "exact", head: true }),
      client
        .from("driver_financial_periods")
        .select("*", { count: "exact", head: true })
        .in("status", ["open", "reopened"]),
      client
        .from("financial_allocations")
        .select("id, financial_event_id")
        .is("financial_event_id", null)
        .limit(5),
    ]);
    const checks = {
      pendingOutbox: pending || 0,
      deadLetters: dead || 0,
      periods: periods || 0,
      financialEvents: events || 0,
      openOrReopenedPeriods: openReopened || 0,
      orphanAllocationsSample: (orphanAlloc || []).length,
      // Peer KV sources are read-only compatibility only — SQL periods are SSOT for tabs.
      peerKvRetiredAsMoneySource: true,
    };
    return c.json({
      success: true,
      health: {
        ...checks,
        ok: (dead || 0) === 0 && checks.orphanAllocationsSample === 0,
      },
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/**
 * Shadow-compare regression fixtures for the three known Expenses vs Toll Recon bugs.
 * Query: driverId (optional, defaults to Kenny screenshot driver).
 */
app.get(`${BASE}/verify-parity`, async (c) => {
  try {
    const driverId =
      c.req.query("driverId") || "73e5b1dc-01b4-45ee-a34a-25a3256b9841";
    await processFinancialOutbox(20);
    // Only the three regression anchors — avoid full-driver rebuild CPU 546.
    await rebuildPeriodsForAnchors(driverId, [
      "2026-06-29",
      "2025-12-08",
      "2025-11-10",
    ]);
    const periods = await listDriverFinancialPeriods(driverId);
    const byAnchor = new Map(
      periods.map((p) => [String(p.periodAnchor).slice(0, 10), p]),
    );

    // Jun 29 – Jul 5: late receipts must leave unmatched > 0 (reopened / not stuck reconciled).
    const jun = byAnchor.get("2026-06-29");
    // Dec 8 – 14: completed with zero unmatched (top-ups excluded).
    const dec = byAnchor.get("2025-12-08");
    // Nov 10 – 16: phantom week from top-up must not appear as a toll period.
    const nov = byAnchor.get("2025-11-10");

    const fixtures = [
      {
        id: "jun29_late_receipt_reopen",
        periodAnchor: "2026-06-29",
        present: !!jun,
        tollUnmatchedCount: jun?.tollUnmatchedCount ?? null,
        status: jun?.status ?? null,
        tollStatus: jun?.tollStatus ?? null,
        // Invariant: never closed while unmatched; when unmatched>0 must show open/unmatched.
        // When live week is fully handled, reconciled+open is correct (reopen only on new receipts).
        pass: !!jun && (
          (Number(jun.tollUnmatchedCount) || 0) > 0
            ? jun.status !== "closed" && jun.tollStatus === "unmatched"
            : jun.tollStatus === "reconciled" && jun.status !== "closed"
        ),
        note: "Unmatched tolls keep period open; late receipts reopen (never stuck closed)",
      },
      {
        id: "dec8_completed_no_topup_unmatched",
        periodAnchor: "2025-12-08",
        present: !!dec,
        tollUnmatchedCount: dec?.tollUnmatchedCount ?? null,
        status: dec?.status ?? null,
        tollStatus: dec?.tollStatus ?? null,
        pass: !!dec && (Number(dec.tollUnmatchedCount) || 0) === 0 && Number(dec.tollSpend) > 0,
        note: "Top-ups excluded — zero unmatched when workflow complete",
      },
      {
        id: "nov10_no_phantom_topup_week",
        periodAnchor: "2025-11-10",
        present: !!nov,
        tollSpend: nov?.tollSpend ?? 0,
        tollUnmatchedCount: nov?.tollUnmatchedCount ?? 0,
        pass: !nov,
        note: "Tag top-up alone must not create a toll expense week",
      },
    ];

    const allPass = fixtures.every((f) => f.pass);
    return c.json({
      success: true,
      driverId,
      allPass,
      fixtures,
      periodCount: periods.length,
    });
  } catch (e: any) {
    console.error("[DFP] verify-parity error:", e.message);
    return c.json({ error: e.message }, 500);
  }
});

app.get(`${BASE}/:anchor`, async (c) => {
  try {
    const driverId = c.req.query("driverId");
    const anchor = c.req.param("anchor");
    if (!driverId) return c.json({ error: "driverId is required" }, 400);
    let detail = await getDriverFinancialPeriodDetail(driverId, anchor);
    if (!detail) {
      detail = await rebuildDriverFinancialPeriod(driverId, anchor);
    }
    return c.json({ success: true, data: detail });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post(`${BASE}/rebuild`, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const driverId = body.driverId;
    if (!driverId) return c.json({ error: "driverId is required" }, 400);
    if (body.periodAnchor) {
      const row = await rebuildDriverFinancialPeriod(driverId, body.periodAnchor);
      return c.json({ success: true, data: row });
    }
    const n = await rebuildAllPeriodsForDriver(driverId);
    const periods = await listDriverFinancialPeriods(driverId);
    return c.json({ success: true, rebuilt: n, data: periods });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post(`${BASE}/process-outbox`, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    // Keep batches small — each driver still loads toll ledger once.
    const result = await processFinancialOutbox(Math.min(Number(body.limit) || 20, 40));
    return c.json({ success: true, ...result });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/**
 * Backfill financial_events from toll_ledger usage + driver charges + fuel finalized.
 * Then rebuild all period projections for the driver (or all drivers with tolls).
 */
app.post(`${BASE}/backfill`, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false;
    const onlyDriver = body.driverId ? String(body.driverId) : null;

    const { tollTx } = await loadAllTollLedgerWithTrips();
    const usage = tollTx.filter(
      (tx: any) =>
        isReconcilableTollExpense(tx) &&
        String(tx.type || "").toLowerCase() !== "top-up" &&
        String(tx.type || "").toLowerCase() !== "top_up" &&
        (!onlyDriver || String(tx.driverId) === onlyDriver),
    );

    const report = {
      dryRun,
      tollUsageWouldPost: 0,
      tollUsagePosted: 0,
      chargesPosted: 0,
      fuelPosted: 0,
      periodsRebuilt: 0,
      errors: [] as string[],
    };

    const driverIds = new Set<string>();

    for (const tx of usage) {
      if (!tx?.id || !tx?.driverId) continue;
      driverIds.add(String(tx.driverId));
      report.tollUsageWouldPost++;
      if (dryRun) continue;
      const amt = Math.abs(Number(tx.amount) || 0);
      if (amt <= 0) continue;
      const r = await postFinancialEvent({
        idempotencyKey: `backfill:toll_usage:${tx.id}`,
        domain: "toll",
        eventType: "toll_usage",
        sourceSystem: "backfill",
        sourceId: String(tx.id),
        driverId: String(tx.driverId),
        vehicleId: tx.vehicleId || null,
        occurredAt: tx.date,
        amountMajor: -amt,
        direction: "outflow",
        debitAccountKey: "platform:fleet_toll_expense",
        creditAccountKey: "platform:toll_tag_clearing",
        payload: {
          description: tx.description || tx.vendor,
          workflowStage: tx.workflowStage,
          paymentMethod: tx.paymentMethod,
        },
        allocations: [
          {
            allocation_type: "fleet_share",
            amount_minor: majorToMinor(amt),
            toll_id: String(tx.id),
            driver_id: String(tx.driverId),
          },
        ],
      });
      if (r.ok && (r.inserted || r.skipped)) report.tollUsagePosted++;
      else if (r.error) report.errors.push(`toll ${tx.id}: ${r.error}`);
    }

    // Driver charges
    const allTx = (await kv.getByPrefix("transaction:")) || [];
    for (const t of allTx) {
      if (String(t?.category || "") !== "Toll Charge") continue;
      if (!t?.driverId || !t?.id) continue;
      if (onlyDriver && String(t.driverId) !== onlyDriver) continue;
      driverIds.add(String(t.driverId));
      if (dryRun) continue;
      const amt = Number(t.amount) || 0;
      if (amt === 0) continue;
      const r = await postFinancialEvent({
        idempotencyKey: `backfill:driver_charge:${t.id}`,
        domain: "toll",
        eventType: amt < 0 ? "toll_charged_to_driver" : "toll_charge_reversed",
        sourceSystem: "backfill",
        sourceId: String(t.id),
        driverId: String(t.driverId),
        occurredAt: t.date,
        amountMajor: amt,
        direction: amt < 0 ? "outflow" : "inflow",
        product: "roam_driver",
        payload: { description: t.description, projection: true },
      });
      if (r.ok) report.chargesPosted++;
      else if (r.error) report.errors.push(`charge ${t.id}: ${r.error}`);
    }

    // Finalized fuel
    const reports = ((await loadAllByPrefix("finalized_report:")) || []).filter(
      (r: any) => r?.status === "Finalized" && (!onlyDriver || String(r.driverId) === onlyDriver),
    );
    for (const fr of reports) {
      if (!fr?.driverId) continue;
      driverIds.add(String(fr.driverId));
      if (dryRun) continue;
      const start = String(fr.periodStart || fr.startDate || "").slice(0, 10);
      if (!start) continue;
      const deduction = Math.abs(Number(fr.driverShare) || 0);
      const fleetShare = Math.abs(Number(fr.companyShare) || 0);
      const keyBase = `backfill:fuel_finalized:${fr.id || fr.driverId}:${start}`;
      await postFinancialEvent({
        idempotencyKey: `${keyBase}:finalized`,
        domain: "fuel",
        eventType: "fuel_finalized",
        sourceSystem: "backfill",
        sourceId: String(fr.id || keyBase),
        driverId: String(fr.driverId),
        occurredAt: start,
        amountMajor: 0,
        direction: "neutral",
        payload: { reportId: fr.id },
      });
      if (deduction > 0) {
        await postFinancialEvent({
          idempotencyKey: `${keyBase}:deduction`,
          domain: "fuel",
          eventType: "fuel_deduction",
          sourceSystem: "backfill",
          sourceId: String(fr.id || keyBase),
          driverId: String(fr.driverId),
          occurredAt: start,
          amountMajor: -deduction,
          direction: "outflow",
          debitAccountKey: "platform:driver_receivable",
          creditAccountKey: "platform:fleet_fuel_expense",
        });
      }
      if (fleetShare > 0) {
        await postFinancialEvent({
          idempotencyKey: `${keyBase}:fleet_share`,
          domain: "fuel",
          eventType: "fuel_fleet_share",
          sourceSystem: "backfill",
          sourceId: String(fr.id || keyBase),
          driverId: String(fr.driverId),
          occurredAt: start,
          amountMajor: -fleetShare,
          direction: "outflow",
        });
      }
      report.fuelPosted++;
    }

    if (!dryRun) {
      // Rebuild from usage anchors only (shared context) — skip full trip fan-out in same request.
      for (const id of driverIds) {
        try {
          report.periodsRebuilt += await rebuildAllPeriodsForDriver(id);
        } catch (e: any) {
          report.errors.push(`rebuild ${id}: ${e?.message || e}`);
        }
      }
    } else {
      report.periodsRebuilt = driverIds.size;
    }

    return c.json({
      success: true,
      report,
      message: dryRun
        ? "Dry run complete. Re-run with dryRun=false to post events and rebuild periods."
        : "Backfill complete.",
    });
  } catch (e: any) {
    console.error("[DFP] backfill error:", e.message);
    return c.json({ error: e.message }, 500);
  }
});

export default app;
