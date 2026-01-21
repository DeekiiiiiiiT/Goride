
import { Hono } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const app = new Hono();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const BASE_PATH = "/make-server-37f42386";

// --- FUEL CARDS ---
app.get(`${BASE_PATH}/fuel-cards`, async (c) => {
  try {
    const cards = await kv.getByPrefix("fuel_card:");
    return c.json(cards || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post(`${BASE_PATH}/fuel-cards`, async (c) => {
  try {
    const card = await c.req.json();
    if (!card.id) card.id = crypto.randomUUID();
    await kv.set(`fuel_card:${card.id}`, card);
    return c.json({ success: true, data: card });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete(`${BASE_PATH}/fuel-cards/:id`, async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`fuel_card:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- FUEL ENTRIES ---
app.get(`${BASE_PATH}/fuel-entries`, async (c) => {
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

app.post(`${BASE_PATH}/fuel-entries`, async (c) => {
  try {
    const entry = await c.req.json();
    if (!entry.id) entry.id = crypto.randomUUID();
    await kv.set(`fuel_entry:${entry.id}`, entry);
    return c.json({ success: true, data: entry });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete(`${BASE_PATH}/fuel-entries/:id`, async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`fuel_entry:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- MILEAGE ADJUSTMENTS ---
app.get(`${BASE_PATH}/mileage-adjustments`, async (c) => {
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

app.post(`${BASE_PATH}/mileage-adjustments`, async (c) => {
  try {
    const adj = await c.req.json();
    if (!adj.id) adj.id = crypto.randomUUID();
    await kv.set(`fuel_adjustment:${adj.id}`, adj);
    return c.json({ success: true, data: adj });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete(`${BASE_PATH}/mileage-adjustments/:id`, async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`fuel_adjustment:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- MAINTENANCE LOGS ---
app.get(`${BASE_PATH}/maintenance-logs/:vehicleId`, async (c) => {
  try {
    const vehicleId = c.req.param("vehicleId");
    const logs = await kv.getByPrefix(`maintenance_log:${vehicleId}:`);
    logs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return c.json(logs);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post(`${BASE_PATH}/maintenance-logs`, async (c) => {
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
app.get(`${BASE_PATH}/toll-tags`, async (c) => {
  try {
    const tags = await kv.getByPrefix("toll_tag:");
    return c.json(tags || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post(`${BASE_PATH}/toll-tags`, async (c) => {
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

app.delete(`${BASE_PATH}/toll-tags/:id`, async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`toll_tag:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- ODOMETER HISTORY ---
app.get(`${BASE_PATH}/odometer-history/:vehicleId`, async (c) => {
  try {
    const vehicleId = c.req.param("vehicleId");
    const history = await kv.getByPrefix(`odometer_reading:${vehicleId}:`);
    history.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return c.json(history);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post(`${BASE_PATH}/odometer-history`, async (c) => {
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
app.get(`${BASE_PATH}/fuel-disputes`, async (c) => {
  try {
    const items = await kv.getByPrefix("fuel_dispute:");
    return c.json(items || []);
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.post(`${BASE_PATH}/fuel-disputes`, async (c) => {
  try {
    const item = await c.req.json();
    if (!item.id) item.id = crypto.randomUUID();
    await kv.set(`fuel_dispute:${item.id}`, item);
    return c.json({ success: true, data: item });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.delete(`${BASE_PATH}/fuel-disputes/:id`, async (c) => {
  const id = c.req.param("id");
  try { await kv.del(`fuel_dispute:${id}`); return c.json({ success: true }); }
  catch (e: any) { return c.json({ error: e.message }, 500); }
});

// --- FUEL SCENARIOS ---
app.get(`${BASE_PATH}/scenarios`, async (c) => {
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

app.post(`${BASE_PATH}/scenarios`, async (c) => {
  try {
    const item = await c.req.json();
    if (!item.id) item.id = crypto.randomUUID();
    await kv.set(`fuel_scenario:${item.id}`, item);
    return c.json({ success: true, data: item });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.delete(`${BASE_PATH}/scenarios/:id`, async (c) => {
  const id = c.req.param("id");
  try { await kv.del(`fuel_scenario:${id}`); return c.json({ success: true }); }
  catch (e: any) { return c.json({ error: e.message }, 500); }
});

// --- RECONCILIATION FINALIZATION ---
app.post(`${BASE_PATH}/reconciliation/finalize`, async (c) => {
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
          netAdjustment
        }
      };

      await kv.set(`transaction:${ledgerTx.id}`, ledgerTx);
      results.push({ vehicleId: report.vehicleId, transactionId: ledgerTx.id });
    }

    return c.json({ success: true, processed: results.length, details: results });
  } catch (e: any) {
    console.error("Finalization Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Update Anchor (Generic PATCH endpoint that was previously in API config but missing)
app.patch(`${BASE_PATH}/anchors/:id`, async (c) => {
    try {
        const id = c.req.param("id");
        const payload = await c.req.json();
        
        // We assume anchors are fuel entries with odometer readings
        // Fetch existing
        const entry = await kv.get(`fuel_entry:${id}`);
        if (!entry) return c.json({ error: "Anchor not found" }, 404);
        
        // Update fields
        const updated = { ...entry, ...payload };
        if (payload.value) updated.odometer = payload.value; // Map 'value' to 'odometer'
        
        await kv.set(`fuel_entry:${id}`, updated);
        return c.json(updated);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

export default app;
