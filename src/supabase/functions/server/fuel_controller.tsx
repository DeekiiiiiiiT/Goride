
import { Hono } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const app = new Hono();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const BASE_PATH = "/make-server-37f42386";

// --- CONSTANTS ---
const SOFT_ANCHOR_THRESHOLD = 1.0; // 100% capacity triggers a reset
const CRITICAL_THRESHOLD = 1.05;   // 105% capacity flags a critical anomaly

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

// --- SCALABILITY & PERFORMANCE (Phase 8) ---
app.get(`${BASE_PATH}/fuel-entries`, async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") || "2000"); // Increased default limit to prevent missing logs
    const offset = parseInt(c.req.query("offset") || "0");
    const vehicleId = c.req.query("vehicleId");
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");

    // Phase 8: Direct Supabase query with pagination for performance
    let query = supabase
        .from("kv_store_37f42386")
        .select("value", { count: 'exact' })
        .like("key", "fuel_entry:%");

    if (vehicleId) {
        query = query.eq("value->>vehicleId", vehicleId);
    }

    if (startDate) {
        query = query.gte("value->>date", startDate);
    }
    
    if (endDate) {
        query = query.lte("value->>date", endDate);
    }

    query = query.order("value->>date", { ascending: false })
                 .range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    const entries = (data || []).map((d: any) => d.value);
    
    // Add pagination headers
    c.header("X-Total-Count", String(count || 0));
    
    return c.json(entries);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Phase 8 Step 3: Chaos Seeder Endpoint
app.post(`${BASE_PATH}/admin/chaos-seeder`, async (c) => {
    try {
        const { count = 500, vehicleId } = await c.req.json();
        console.log(`[Chaos] Generating ${count} synthetic entries...`);
        
        const vehicles = vehicleId ? [await kv.get(`vehicle:${vehicleId}`)] : await kv.getByPrefix("vehicle:");
        if (!vehicles.length) throw new Error("No vehicles found to seed");

        const entries = [];
        const baseDate = new Date();

        for (let i = 0; i < count; i++) {
            const vehicle = vehicles[Math.floor(Math.random() * vehicles.length)];
            const date = new Date(baseDate);
            date.setMinutes(date.getMinutes() - (i * 120)); // Every 2 hours
            
            const isAnomaly = Math.random() > 0.95; // 5% chance of anomaly
            const liters = isAnomaly ? 85 : 45; // 85L is usually over capacity for standard cars

            entries.push({
                id: crypto.randomUUID(),
                date: date.toISOString(),
                vehicleId: vehicle.id,
                driverId: "chaos-driver-1",
                amount: liters * 1.5,
                liters: liters,
                pricePerLiter: 1.5,
                odometer: 100000 + (i * 50),
                type: 'Card_Transaction',
                entryMode: 'Floating',
                paymentSource: 'Gas_Card',
                metadata: {
                    isSynthetic: true,
                    chaosBatch: 'phase-8-stress'
                }
            });
        }

        // Chunked write
        for (let i = 0; i < entries.length; i += 50) {
            const chunk = entries.slice(i, i + 50);
            const keys = chunk.map(e => `fuel_entry:${e.id}`);
            await kv.mset(keys, chunk);
        }

        return c.json({ success: true, count: entries.length });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Phase 8 Cleanup: Purge Synthetic Data
app.post(`${BASE_PATH}/admin/purge-synthetic`, async (c) => {
    try {
        console.log("[Purge] Removing all synthetic test data...");
        
        // Use direct Supabase delete with JSON filtering for performance
        const { count, error } = await supabase
            .from("kv_store_37f42386")
            .delete({ count: 'exact' })
            .like("key", "fuel_entry:%")
            .eq("value->metadata->>isSynthetic", "true");

        if (error) throw error;

        return c.json({ success: true, count: count || 0 });
    } catch (e: any) {
        console.error("[Purge Error]", e);
        return c.json({ error: e.message }, 500);
    }
});

// Phase 8 Step 4: Ledger Locking
app.patch(`${BASE_PATH}/transactions/:id/lock`, async (c) => {
    try {
        const id = c.req.param("id");
        const tx = await kv.get(`transaction:${id}`);
        if (!tx) return c.json({ error: "Transaction not found" }, 404);

        tx.isLocked = true;
        tx.lockedAt = new Date().toISOString();
        tx.metadata = { ...tx.metadata, status: 'Finalized' };

        await kv.set(`transaction:${id}`, tx);
        return c.json({ success: true, data: tx });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post(`${BASE_PATH}/fuel-entries`, async (c) => {
  try {
    const entry = await c.req.json();
    if (!entry.id) entry.id = crypto.randomUUID();

    // Phase 8.2: Server-Side Validation & Integrity Protection
    // We prevent manipulation of "valid" statuses and calculate integrity server-side
    
    // 1. Fetch Vehicle to check tank capacity
    if (entry.vehicleId) {
        const vehicle = await kv.get(`vehicle:${entry.vehicleId}`);
        if (vehicle) {
            const tankCapacity = Number(vehicle?.specifications?.tankCapacity) || Number(vehicle?.fuelSettings?.tankCapacity) || 0;
            
            // 2. Fetch recent entries to calculate current cumulative
            const allEntries = await kv.getByPrefix("fuel_entry:");
            const vehicleEntries = allEntries
                .filter((e: any) => e.vehicleId === entry.vehicleId && e.id !== entry.id)
                .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

            let cumulative = 0;
            for (const ve of vehicleEntries) {
                // Phase 14: Logic check - Is the previous record a reset point?
                if (ve.metadata?.isAnchor || ve.metadata?.isFullTank || ve.metadata?.isSoftAnchor) {
                    // If the previous record was a reset point, the cumulative sum before THIS entry 
                    // is just the liters from the reset point itself (not 0, because the reset point
                    // is the first entry of the new cycle).
                    // Wait, if ve is the reset point, it should NOT be added to cumulative of NEXT?
                    // No, the reset point IS the first entry.
                    // So for the entry AFTER a reset, cumulative = liters of reset.
                    break;
                }
                cumulative += (Number(ve.liters) || 0);
            }

            const rawCumulative = cumulative + (Number(entry.liters) || 0);
            
            // Phase 1 (Logic Refactoring): Soft Anchor Detection at 100%
            const approachingSoftAnchor = tankCapacity > 0 && rawCumulative >= (tankCapacity * SOFT_ANCHOR_THRESHOLD);
            const isHardAnchor = entry.metadata?.isFullTank || entry.metadata?.isAnchor;
            
            // Calculate contribution percentage for the new UI
            const contributionPercentage = tankCapacity > 0 ? (Number(entry.liters) / tankCapacity) * 100 : 0;

            // If it's a soft anchor, the cumulative for display is just this entry's liters
            const newCumulative = (isHardAnchor || approachingSoftAnchor) ? (Number(entry.liters) || 0) : rawCumulative;

            if (approachingSoftAnchor && !isHardAnchor) {
                entry.metadata = {
                    ...entry.metadata,
                    isSoftAnchor: true,
                    softAnchorNote: `Soft Anchor: Cumulative volume (${rawCumulative.toFixed(1)}L) reached or exceeded 100% of ${tankCapacity}L capacity.`
                };
            }

            // Add contribution metadata
            entry.metadata = {
                ...entry.metadata,
                contributionPercentage: Number(contributionPercentage.toFixed(2)),
                // Data Consistency: Tag with Cycle ID
                cycleId: `cycle_${entry.vehicleId}_${vehicleEntries.find((e: any) => e.metadata?.isFullTank || e.metadata?.isAnchor || e.metadata?.isSoftAnchor)?.odometer || 'start'}`
            };

            // Phase 7: Advanced Predictive Baseline Logic
            // Fetch vehicle efficiency baseline (rolling average or spec)
            let predictedEconomy = 10; // Default L/100km
            if (vehicle?.fuelSettings?.targetEfficiency) {
                predictedEconomy = Number(vehicle.fuelSettings.targetEfficiency);
            }

            // 3. Rule 1 - Tank Overflow Detection (Phase 2 & 8.2)
            // Use 5% expansion buffer
            const overflowThreshold = tankCapacity > 0 ? tankCapacity * CRITICAL_THRESHOLD : Infinity;
            
            if (tankCapacity > 0 && newCumulative > overflowThreshold) {
                // Phase 7: Wait-and-See Observation
                // Instead of immediate Critical flag, if it's within a "High Velocity" window (but not physically impossible)
                // we might use 'observing'. But Overflow (>105% tank) is physically impossible -> Flagged.
                entry.metadata = {
                    ...entry.metadata,
                    integrityStatus: 'critical',
                    auditStatus: 'Flagged',
                    anomalyReason: 'Tank Overflow',
                    cumulativeLitersAtEntry: newCumulative,
                    flaggedAt: new Date().toISOString()
                };
                entry.isFlagged = true;
                entry.auditStatus = 'Flagged';
            } else if (tankCapacity > 0 && newCumulative > (tankCapacity * 0.85)) {
                // Note: We keep the 85% "Warning" visual but it doesn't trigger a reset anymore
                entry.metadata = {
                    ...entry.metadata,
                    integrityStatus: 'warning',
                    auditStatus: 'Observing',
                    observationReason: 'Approaching Full Capacity (Wait for Anchor)',
                    cumulativeLitersAtEntry: newCumulative,
                    observationStartedAt: new Date().toISOString()
                };
                entry.auditStatus = 'Observing';
            } else {
                entry.metadata = {
                    ...entry.metadata,
                    integrityStatus: 'valid',
                    auditStatus: 'Clear',
                    cumulativeLitersAtEntry: newCumulative
                };
                entry.auditStatus = 'Clear';
            }

            // Phase 7: Auto-Resolution Loop
            // If this entry IS a full tank (Anchor), attempt to resolve previous 'Observing' entries
            if (entry.metadata?.isFullTank || entry.metadata?.isAnchor) {
                const pendingObservations = vehicleEntries.filter((e: any) => e.auditStatus === 'Observing');
                if (pendingObservations.length > 0) {
                    // Logic: Get last anchor before these observations
                    const lastAnchor = vehicleEntries.find((e: any) => (e.metadata?.isFullTank || e.metadata?.isAnchor) && e.id !== entry.id);
                    if (lastAnchor && entry.odometer && lastAnchor.odometer) {
                        const distance = entry.odometer - lastAnchor.odometer;
                        const totalLitersInWindow = pendingObservations.reduce((sum: number, e: any) => sum + (Number(e.liters) || 0), 0) + (Number(entry.liters) || 0);
                        const actualEconomy = (totalLitersInWindow / distance) * 100;
                        
                        // If actual economy is within 15% of predicted, auto-resolve
                        const variance = Math.abs(actualEconomy - predictedEconomy) / predictedEconomy;
                        if (variance < 0.15) {
                            for (const po of pendingObservations) {
                                po.auditStatus = 'Auto-Resolved';
                                po.metadata = {
                                    ...po.metadata,
                                    resolvedAt: new Date().toISOString(),
                                    actualEconomy: Number(actualEconomy.toFixed(2)),
                                    predictedEconomy: predictedEconomy
                                };
                                await kv.set(`fuel_entry:${po.id}`, po);
                            }
                        }
                    }
                }
            }
        }
    }

    await kv.set(`fuel_entry:${entry.id}`, entry);
    return c.json({ success: true, data: entry });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- Phase 8.1: Backfill Integrity Job ---
app.post(`${BASE_PATH}/admin/backfill-fuel-integrity`, async (c) => {
    try {
        console.log("[Backfill] Starting Fuel Integrity Backfill...");
        
        const vehicles = await kv.getByPrefix("vehicle:");
        const allEntries = await kv.getByPrefix("fuel_entry:");
        
        let processedCount = 0;
        let anomalyCount = 0;

        for (const vehicle of vehicles) {
            const vehicleId = vehicle.id;
            const tankCapacity = Number(vehicle?.specifications?.tankCapacity) || Number(vehicle?.fuelSettings?.tankCapacity) || 0;
            
            if (tankCapacity <= 0) continue;

            const vehicleEntries = allEntries
                .filter((e: any) => e.vehicleId === vehicleId)
                .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

            let runningCumulative = 0;
            let lastResetOdo = 0;

            for (const entry of vehicleEntries) {
                // Phase 1 (Logic Refactoring): Soft Anchor Logic - Reset only if Full, Hard Anchor, or Cumulative reached 100%
                const isHardAnchor = entry.metadata?.isFullTank || entry.metadata?.isAnchor;
                const currentVolume = Number(entry.liters) || 0;
                const approachingThreshold = tankCapacity > 0 && (runningCumulative + currentVolume) >= (tankCapacity * SOFT_ANCHOR_THRESHOLD);
                
                // Determine if this entry SHOULD be a soft anchor
                const shouldBeSoftAnchor = !isHardAnchor && approachingThreshold;

                if (isHardAnchor || shouldBeSoftAnchor) {
                    runningCumulative = currentVolume;
                } else {
                    runningCumulative += currentVolume;
                }

                // Check Integrity
                const overflowThreshold = tankCapacity > 0 ? tankCapacity * CRITICAL_THRESHOLD : Infinity;
                const status = tankCapacity > 0 && runningCumulative > overflowThreshold ? 'critical' : 
                               tankCapacity > 0 && runningCumulative > (tankCapacity * 0.85) ? 'warning' : 'valid';
                
                const contributionPercentage = tankCapacity > 0 ? (currentVolume / tankCapacity) * 100 : 0;

                const updatedMetadata = {
                    ...(entry.metadata || {}),
                    cumulativeLitersAtEntry: Number(runningCumulative.toFixed(2)),
                    contributionPercentage: Number(contributionPercentage.toFixed(2)),
                    integrityStatus: status,
                    isSoftAnchor: shouldBeSoftAnchor || entry.metadata?.isSoftAnchor,
                    softAnchorNote: shouldBeSoftAnchor ? `Auto-reset: Cumulative volume reached or exceeded 100% of ${tankCapacity}L tank.` : entry.metadata?.softAnchorNote,
                    anomalyReason: status === 'critical' ? 'Tank Overflow' : 
                                   status === 'warning' ? 'Approaching Capacity' : null,
                    backfilledAt: new Date().toISOString()
                };

                const updatedEntry = {
                    ...entry,
                    metadata: updatedMetadata,
                    isFlagged: status === 'critical'
                };

                if (status === 'critical') anomalyCount++;
                
                // Add Cycle ID to metadata to help frontend grouping (Data Consistency)
                const currentCycleId = `cycle_${vehicleId}_${lastResetOdo || 'start'}`;
                updatedMetadata.cycleId = currentCycleId;
                
                if (isHardAnchor || shouldBeSoftAnchor) {
                    lastResetOdo = entry.odometer || 0;
                }

                await kv.set(`fuel_entry:${entry.id}`, updatedEntry);
                processedCount++;
            }
        }

        return c.json({ 
            success: true, 
            processed: processedCount, 
            anomaliesDetected: anomalyCount,
            timestamp: new Date().toISOString()
        });
    } catch (e: any) {
        console.error("[Backfill Error]", e);
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

// --- Phase 5: Integrity Repair Engine (Server-Side) ---
app.post(`${BASE_PATH}/admin/reconcile-ledger-orphans`, async (c) => {
    try {
        console.log("[Integrity] Starting server-side fingerprint matching...");
        
        // 1. Fetch all data
        const transactions = await kv.getByPrefix("transaction:");
        const entries = await kv.getByPrefix("fuel_entry:");
        
        // 2. Filter for Orphans
        // Fuel Transactions that lack a link
        const orphansTx = transactions.filter((tx: any) => 
            (tx.category === 'Fuel' || tx.category === 'Fuel Reimbursement' || tx.description?.toLowerCase().includes('fuel') || tx.description?.toLowerCase().includes('gas')) &&
            !tx.metadata?.linkedFuelId && 
            !tx.metadata?.sourceId
        );

        // Fuel Entries that are not verified
        const orphanLogs = entries.filter((e: any) => 
            e.reconciliationStatus !== 'Verified' &&
            !e.transactionId // If it has a transactionId, it's likely already linked explicitly
        );

        let linkedCount = 0;
        let anomalyFixedCount = 0;
        const updates: any[] = [];
        const updateKeys: string[] = [];

        // Helper to check if date is within 1 day (Anomaly Window)
        const isDateMatch = (d1: string, d2: string) => {
            if (d1 === d2) return true;
            const t1 = new Date(d1).getTime();
            const t2 = new Date(d2).getTime();
            const diff = Math.abs(t1 - t2);
            return diff <= 86400000; // 24 hours in ms
        };

        // 3. Match Fingerprints
        for (const tx of orphansTx) {
            // Find a log that matches Amount and Date (Exact or Window)
            const txDate = tx.date; // YYYY-MM-DD
            const txAmount = Math.abs(Number(tx.amount));

            // Collision Resolution: Find ALL matches first
            const potentialMatches = orphanLogs.filter((log: any) => {
                const logDate = log.date.split('T')[0];
                const logAmount = Math.abs(Number(log.amount));
                
                // Match amount (allow tiny float variance) and Date Window
                return Math.abs(txAmount - logAmount) < 0.01 && isDateMatch(txDate, logDate);
            });

            if (potentialMatches.length > 0) {
                // Best match strategy: Prefer EXACT date match over Window match
                let bestMatch = potentialMatches.find((log: any) => log.date.split('T')[0] === txDate);
                
                // If no exact match, take the first window match (Anomaly Re-anchoring)
                if (!bestMatch) {
                    bestMatch = potentialMatches[0];
                    anomalyFixedCount++;
                }

                if (bestMatch) {
                    // Link TX -> Log
                    tx.metadata = { ...tx.metadata, linkedFuelId: bestMatch.id, integrityNote: 'Auto-Linked via Integrity Repair' };
                    
                    // Link Log -> Status
                    bestMatch.reconciliationStatus = 'Verified';
                    bestMatch.reconciledAt = new Date().toISOString();
                    bestMatch.transactionId = tx.id;
                    bestMatch.metadata = { ...bestMatch.metadata, autoLinked: true };
                    
                    // If date was mismatched, anchor log to tx date (Source of Truth)
                    if (bestMatch.date.split('T')[0] !== txDate) {
                        const timePart = bestMatch.date.includes('T') ? bestMatch.date.split('T')[1] : '12:00:00.000Z';
                        bestMatch.date = `${txDate}T${timePart}`;
                        bestMatch.metadata.dateAdjusted = true;
                    }

                    // Add to updates
                    updates.push(tx);
                    updateKeys.push(`transaction:${tx.id}`);
                    
                    updates.push(bestMatch);
                    updateKeys.push(`fuel_entry:${bestMatch.id}`);
                    
                    // Remove from pool so we don't double link
                    const idx = orphanLogs.findIndex((l: any) => l.id === bestMatch.id);
                    if (idx !== -1) orphanLogs.splice(idx, 1);
                    
                    linkedCount++;
                }
            }
        }

        // 4. Atomic Commit with Chunking
        if (updates.length > 0) {
            const BATCH_SIZE = 50;
            for (let i = 0; i < updateKeys.length; i += BATCH_SIZE) {
                const chunkKeys = updateKeys.slice(i, i + BATCH_SIZE);
                const chunkValues = updates.slice(i, i + BATCH_SIZE);
                
                // Create object map for mset
                // kv.mset expects (keys, values) or Object?
                // kv_store.tsx: mset(keys: string[], values: any[])
                await kv.mset(chunkKeys, chunkValues);
            }
        }

        return c.json({ 
            success: true, 
            linkedCount, 
            anomalyFixedCount,
            message: `Successfully linked ${linkedCount} orphaned records (${anomalyFixedCount} window anomalies resolved).` 
        });
    } catch (e: any) {
        console.error("[Integrity Error]", e);
        return c.json({ error: e.message }, 500);
    }
});

export default app;
