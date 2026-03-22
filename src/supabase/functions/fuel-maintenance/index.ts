import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const app = new Hono();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

app.use('*', logger(console.log));
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

app.get("/fuel-maintenance/health", (c) => c.json({ status: "ok" }));

// --- FUEL CARDS ---
app.get("/fuel-maintenance/fuel-cards", async (c) => {
  try {
    const cards = await kv.getByPrefix("fuel_card:");
    return c.json(cards || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/fuel-maintenance/fuel-cards", async (c) => {
  try {
    const card = await c.req.json();
    if (!card.id) card.id = crypto.randomUUID();
    await kv.set(`fuel_card:${card.id}`, card);
    return c.json({ success: true, data: card });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/fuel-maintenance/fuel-cards/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`fuel_card:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- FUEL ENTRIES ---
app.get("/fuel-maintenance/fuel-entries", async (c) => {
  try {
    const entries = await kv.getByPrefix("fuel_entry:");
    if (entries && Array.isArray(entries)) {
        entries.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return c.json(entries || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/fuel-maintenance/fuel-entries", async (c) => {
  try {
    const entry = await c.req.json();
    if (!entry.id) entry.id = crypto.randomUUID();
    await kv.set(`fuel_entry:${entry.id}`, entry);
    return c.json({ success: true, data: entry });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/fuel-maintenance/fuel-entries/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`fuel_entry:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- MILEAGE ADJUSTMENTS ---
app.get("/fuel-maintenance/mileage-adjustments", async (c) => {
  try {
    const adjustments = await kv.getByPrefix("fuel_adjustment:");
    if (adjustments && Array.isArray(adjustments)) {
        adjustments.sort((a: any, b: any) => (b.week || "").localeCompare(a.week || ""));
    }
    return c.json(adjustments || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/fuel-maintenance/mileage-adjustments", async (c) => {
  try {
    const adj = await c.req.json();
    if (!adj.id) adj.id = crypto.randomUUID();
    await kv.set(`fuel_adjustment:${adj.id}`, adj);
    return c.json({ success: true, data: adj });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/fuel-maintenance/mileage-adjustments/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`fuel_adjustment:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- MAINTENANCE LOGS ---
app.get("/fuel-maintenance/maintenance-logs/:vehicleId", async (c) => {
  try {
    const vehicleId = c.req.param("vehicleId");
    const logs = await kv.getByPrefix(`maintenance_log:${vehicleId}:`);
    logs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return c.json(logs);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/fuel-maintenance/maintenance-logs", async (c) => {
  try {
    const log = await c.req.json();
    if (!log.id) log.id = crypto.randomUUID();
    if (!log.vehicleId) return c.json({ error: "Vehicle ID is required" }, 400);
    await kv.set(`maintenance_log:${log.vehicleId}:${log.id}`, log);
    return c.json({ success: true, data: log });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- TOLL TAGS ---
app.get("/fuel-maintenance/toll-tags", async (c) => {
  try {
    const tags = await kv.getByPrefix("toll_tag:");
    return c.json(tags || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/fuel-maintenance/toll-tags", async (c) => {
  try {
    const tag = await c.req.json();
    if (!tag.id) tag.id = crypto.randomUUID();
    if (!tag.createdAt) tag.createdAt = new Date().toISOString();
    await kv.set(`toll_tag:${tag.id}`, tag);
    return c.json({ success: true, data: tag });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/fuel-maintenance/toll-tags/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`toll_tag:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- ODOMETER HISTORY ---
app.get("/fuel-maintenance/odometer-history/:vehicleId", async (c) => {
  try {
    const vehicleId = c.req.param("vehicleId");
    const history = await kv.getByPrefix(`odometer_reading:${vehicleId}:`);
    history.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return c.json(history);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/fuel-maintenance/odometer-history", async (c) => {
  try {
    const reading = await c.req.json();
    if (!reading.id) reading.id = crypto.randomUUID();
    if (!reading.vehicleId) return c.json({ error: "Vehicle ID required" }, 400);
    if (!reading.createdAt) reading.createdAt = new Date().toISOString();
    await kv.set(`odometer_reading:${reading.vehicleId}:${reading.id}`, reading);
    return c.json({ success: true, data: reading });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- FUEL DISPUTES (Stubbed) ---
app.get("/fuel-maintenance/fuel-disputes", async (c) => {
  try {
    const items = await kv.getByPrefix("fuel_dispute:");
    return c.json(items || []);
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.post("/fuel-maintenance/fuel-disputes", async (c) => {
  try {
    const item = await c.req.json();
    if (!item.id) item.id = crypto.randomUUID();
    await kv.set(`fuel_dispute:${item.id}`, item);
    return c.json({ success: true, data: item });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.delete("/fuel-maintenance/fuel-disputes/:id", async (c) => {
  const id = c.req.param("id");
  try { await kv.del(`fuel_dispute:${id}`); return c.json({ success: true }); }
  catch (e: any) { return c.json({ error: e.message }, 500); }
});

// --- FUEL SCENARIOS ---
app.get("/fuel-maintenance/scenarios", async (c) => {
  try {
    let items = await kv.getByPrefix("fuel_scenario:");
    
    // Seed Default if empty
    if (!items || items.length === 0) {
        const defaultScenario = {
            id: crypto.randomUUID(),
            name: "Standard Ride Share",
            description: "Company covers all business trips and authorized operations. Driver covers personal usage.",
            isDefault: true,
            rules: [
                {
                    id: crypto.randomUUID(),
                    category: 'Fuel',
                    coverageType: 'Full', // Company pays Operating + Misc
                    conditions: {}
                }
            ],
            createdAt: new Date().toISOString()
        };
        await kv.set(`fuel_scenario:${defaultScenario.id}`, defaultScenario);
        items = [defaultScenario];
    }
    
    return c.json(items);
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.post("/fuel-maintenance/scenarios", async (c) => {
  try {
    const item = await c.req.json();
    if (!item.id) item.id = crypto.randomUUID();
    if (item.isDefault) {
        // Unset other defaults (naive implementation: fetch all, update if needed)
        // For KV, this is expensive. We'll trust the client or handle it later.
    }
    await kv.set(`fuel_scenario:${item.id}`, item);
    return c.json({ success: true, data: item });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.delete("/fuel-maintenance/scenarios/:id", async (c) => {
  const id = c.req.param("id");
  try { await kv.del(`fuel_scenario:${id}`); return c.json({ success: true }); }
  catch (e: any) { return c.json({ error: e.message }, 500); }
});

// --- RECONCILIATION FINALIZATION ---
app.post("/fuel-maintenance/reconciliation/finalize", async (c) => {
  try {
    const { reports } = await c.req.json();
    if (!reports || !Array.isArray(reports)) return c.json({ error: "Reports array required" }, 400);

    const results = [];
    const timestamp = new Date().toISOString();

    for (const report of reports) {
      // 1. Mark report as finalized
      report.status = 'Finalized';
      report.finalizedAt = timestamp;
      await kv.set(`fuel_report:${report.vehicleId}:${report.weekStart}`, report);

      // 2. Create Ledger Transaction
      // We post the Driver Share as a deduction (negative)
      // and any Paid By Driver as a credit (positive)
      // Resulting in a "Net Fuel Adjustment"
      
      // First, find all fuel entries for this vehicle/week to mark as reconciled
      const entries = await kv.getByPrefix("fuel_entry:");
      const vehicleEntries = entries.filter((e: any) => 
        e.vehicleId === report.vehicleId && 
        e.date >= report.weekStart && 
        e.date <= report.weekEnd
      );

      let driverOutOfPocket = 0;
      for (const entry of vehicleEntries) {
        entry.isReconciled = true;
        entry.reconciledAt = timestamp;
        entry.reconciliationId = report.id;
        await kv.set(`fuel_entry:${entry.id}`, entry);
        
        if (entry.type === 'Reimbursement' || entry.type === 'Manual_Entry' || entry.type === 'Fuel_Manual_Entry') {
          driverOutOfPocket += entry.amount;
        }
      }

      const netAdjustment = driverOutOfPocket - report.driverShare;
      const companyShare = report.companyShare ?? 0;

      const ledgerTx = {
        id: crypto.randomUUID(),
        type: netAdjustment >= 0 ? 'Credit' : 'Deduction',
        category: 'Fuel Settlement',
        amount: Math.abs(netAdjustment),
        status: 'Approved',
        date: timestamp.split('T')[0],
        timestamp: timestamp,
        driverId: report.driverId,
        vehicleId: report.vehicleId,
        description: `Weekly fuel settlement: ${report.weekStart} to ${report.weekEnd}`,
        metadata: {
          reportId: report.id,
          driverShare: report.driverShare,
          outOfPocket: driverOutOfPocket,
          netAdjustment,
          companyShare, // Fleet share of fuel cost — used by Cash Wallet for fuel credits
        }
      };

      await kv.set(`transaction:${ledgerTx.id}`, ledgerTx);

      // Also create a Fuel Credit transaction for Cash Wallet (fleet share credited to driver wallet)
      // This is the amount we credit back because the driver paid cash for company's portion of fuel.
      if (companyShare > 0 && driverOutOfPocket > 0) {
        const fuelCreditTx = {
          id: `fuel-credit-${report.vehicleId}-${report.weekStart}`,
          type: 'Payment_Received',
          category: 'Fuel Settlement Credit',
          amount: companyShare,
          status: 'Completed',
          date: timestamp.split('T')[0],
          timestamp: timestamp,
          driverId: report.driverId,
          vehicleId: report.vehicleId,
          description: `Fleet fuel share credit: ${report.weekStart} to ${report.weekEnd}`,
          paymentMethod: 'Cash',
          isReconciled: true,
          metadata: {
            reportId: report.id,
            source: 'fuel_finalization',
            companyShare,
            weekStart: report.weekStart,
            weekEnd: report.weekEnd,
          }
        };
        await kv.set(`transaction:${fuelCreditTx.id}`, fuelCreditTx);
      }

      results.push({ vehicleId: report.vehicleId, transactionId: ledgerTx.id });
    }

    return c.json({ success: true, processed: results.length, details: results });
  } catch (e: any) {
    console.error("Finalization Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

Deno.serve(async (req) => {
  try {
    return await app.fetch(req);
  } catch (err: any) {
    console.error("Critical Server Error:", err);
    return new Response(JSON.stringify({ error: "Internal Server Error", message: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
});
