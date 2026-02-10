
import { Hono } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import * as fuelLogic from "./fuel_logic.ts";

const app = new Hono();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const BASE_PATH = "/make-server-37f42386";

// --- CONSTANTS ---
const SOFT_ANCHOR_THRESHOLD = 0.98; // Adjusted to Roadmap: 98% capacity triggers a reset
const OVERFILL_THRESHOLD = 1.02;    // Adjusted to Roadmap: 102% capacity flags a critical anomaly

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
            const tankCapacity = Number(vehicle?.specifications?.tankCapacity) || Number(vehicle?.fuelSettings?.tankCapacity) || 40;
            const date = new Date(baseDate);
            date.setMinutes(date.getMinutes() - (i * 120)); // Every 2 hours
            
            // Randomly generate volume to trigger splits
            // Some small fills, some large fills
            const rand = Math.random();
            let liters = 15 + (Math.random() * 10); // Normal fill 15-25L
            if (rand > 0.8) liters = tankCapacity * 0.9; // Large fill (90% tank)
            if (rand > 0.95) liters = tankCapacity * 1.2; // Overfill anomaly (120% tank)

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
                    chaosBatch: 'phase-4-threshold-test'
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

    // Step 3.1: Immutability Lockdown
    const existingEntry = await kv.get(`fuel_entry:${entry.id}`);
    if (existingEntry) {
        // Only allow updating resolution metadata, not core audit data
        const protectedFields = ['liters', 'amount', 'odometer', 'date', 'vehicleId'];
        const isAttemptingIllegalChange = protectedFields.some(f => existingEntry[f] !== undefined && entry[f] !== undefined && existingEntry[f] !== entry[f]);
        
        if (isAttemptingIllegalChange) {
            entry.liters = existingEntry.liters;
            entry.amount = existingEntry.amount;
            entry.odometer = existingEntry.odometer;
            entry.date = existingEntry.date;
            entry.vehicleId = existingEntry.vehicleId;
        }
    }

    // 1. Fetch Vehicle to check tank capacity and efficiency baselines
    if (entry.vehicleId) {
        const vehicle = await kv.get(`vehicle:${entry.vehicleId}`);
        if (vehicle) {
            const { tankCapacity, baselineEfficiency, rangeMin } = fuelLogic.getVehicleBaselines(vehicle);
            const profileKmPerLiter = baselineEfficiency;

            // 2. Fetch recent entries to calculate cycle state using Step 1.3 Helper
            const lastAnchor = await fuelLogic.getLastAnchor(entry.vehicleId);
            const lastAnchorOdo = Number(lastAnchor?.odometer) || 0;
            const lastAnchorDate = lastAnchor?.date || null;
            
            const cycleEntries = await fuelLogic.getEntriesSinceLastAnchor(entry.vehicleId, lastAnchorDate);
            
            // Step 2.1: Accumulation Logic (with carryover support)
            let carryoverFromLastAnchor = 0;
            if (lastAnchor?.metadata?.isSoftAnchor && lastAnchor?.metadata?.excessVolume) {
                carryoverFromLastAnchor = Number(lastAnchor.metadata.excessVolume) || 0;
            }

            let runningCumulative = carryoverFromLastAnchor;
            for (const ce of cycleEntries) {
                if (ce.id !== entry.id) {
                    runningCumulative = Number((runningCumulative + (Number(ce.liters) || 0)).toFixed(4));
                }
            }

            const volumeAtEntry = (Number(entry.liters) || 0);
            const prevCumulative = runningCumulative;
            const totalVolumeInCycle = Number((runningCumulative + volumeAtEntry).toFixed(4));
            const distanceSinceAnchor = (entry.odometer && lastAnchorOdo) ? (entry.odometer - lastAnchorOdo) : 0;
            
            // Step 2.2: Trigger Thresholding (Roadmap: 98%)
            const isHardAnchor = entry.metadata?.isFullTank || entry.metadata?.isAnchor;
            const approachingSoftAnchor = tankCapacity > 0 && totalVolumeInCycle >= (tankCapacity * SOFT_ANCHOR_THRESHOLD);
            const isSoftAnchor = !isHardAnchor && approachingSoftAnchor;
            
            // Step 2.3: Virtual Reset Implementation
            let volumeContributed = volumeAtEntry;
            let excessVolume = 0;
            if (isSoftAnchor) {
                volumeContributed = Math.max(0, tankCapacity - prevCumulative);
                excessVolume = Number((volumeAtEntry - volumeContributed).toFixed(4));
            }

            // Efficiency Math
            let actualKmPerLiter = 0;
            let efficiencyVariance = 0;
            if (distanceSinceAnchor > 0 && totalVolumeInCycle > 0) {
                actualKmPerLiter = distanceSinceAnchor / totalVolumeInCycle;
                if (profileKmPerLiter > 0) {
                    efficiencyVariance = (profileKmPerLiter - actualKmPerLiter) / profileKmPerLiter;
                }
            }

            // Step 3.2: Behavioral Integrity - Frequency Check
            const recentTimeWindow = new Date(new Date(entry.date).getTime() - (4 * 60 * 60 * 1000)).toISOString();
            const allEntriesRaw = await kv.getByPrefix("fuel_entry:");
            const vehicleEntries = allEntriesRaw
                .filter((e: any) => e.vehicleId === entry.vehicleId && e.id !== entry.id)
                .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                
            const recentTxCount = vehicleEntries.filter(e => e.date >= recentTimeWindow).length;

            // Step 5.1: Odometer Sequence Audit
            const prevEntry = vehicleEntries[0]; // Most recent past entry
            const odoAudit = fuelLogic.auditOdometerSequence({
                currentOdo: Number(entry.odometer),
                prevOdo: Number(prevEntry?.odometer || 0),
                maxExpectedDistance: rangeMin * 1.5
            });

            // Step 3.3: Integrated Integrity Engine
            const integrity = fuelLogic.calculateIntegrity({
                volume: volumeAtEntry,
                tankCapacity,
                prevCumulative,
                distanceSinceAnchor,
                profileEfficiency: profileKmPerLiter,
                recentTxCount,
                isTopUp: entry.metadata?.isTopUp,
                isAnchor: isHardAnchor || isSoftAnchor,
                rangeMin
            });

            // Override if Odo Audit is more severe
            let integrityStatus = integrity.status;
            let anomalyReason = integrity.reason;
            let auditStatus = integrity.auditStatus;

            if (odoAudit.status === 'critical' || (odoAudit.status === 'warning' && integrityStatus === 'valid')) {
                integrityStatus = odoAudit.status;
                anomalyReason = odoAudit.reason;
                auditStatus = odoAudit.auditStatus || auditStatus;
            }

            const isHighFrequency = recentTxCount >= 1; 
            const isFragmented = tankCapacity > 0 && (volumeAtEntry / tankCapacity) < 0.15 && !entry.metadata?.isTopUp;

            // Update Entry Metadata (Step 1.1 Schema)
            entry.metadata = {
                ...entry.metadata,
                volumeContributed: Number(volumeContributed.toFixed(2)),
                excessVolume: excessVolume > 0 ? Number(excessVolume.toFixed(2)) : undefined,
                cumulativeLitersAtEntry: Number(totalVolumeInCycle.toFixed(2)),
                tankUtilizationPercentage: tankCapacity > 0 ? Number(((totalVolumeInCycle / tankCapacity) * 100).toFixed(1)) : 0,
                distanceSinceAnchor,
                actualKmPerLiter: Number(actualKmPerLiter.toFixed(2)),
                profileKmPerLiter,
                efficiencyVariance: Number((efficiencyVariance * 100).toFixed(1)),
                isSoftAnchor,
                integrityStatus,
                anomalyReason,
                auditStatus,
                isFragmented,
                isHighFrequency,
                cycleId: `cycle_${entry.vehicleId}_${lastAnchorOdo || 'start'}`,
                flaggedAt: (integrityStatus === 'critical' || integrityStatus === 'warning') ? new Date().toISOString() : undefined
            };

            entry.isFlagged = integrityStatus === 'critical';
            entry.auditStatus = auditStatus;

            if (isSoftAnchor) {
                entry.metadata.softAnchorNote = `Soft Anchor: Cumulative volume (${totalVolumeInCycle.toFixed(1)}L) reached 100% of ${tankCapacity}L. Resetting cycle.`;
            }

            // Step 3.2: Automated Healing Logic
            if (isHardAnchor || isSoftAnchor) {
                const isAggregatedEfficiencyValid = efficiencyVariance < 0.15; // Within 15% on aggregate
                if (isAggregatedEfficiencyValid) {
                    for (const ce of cycleEntries) {
                        if (ce.auditStatus === 'Flagged' || ce.auditStatus === 'Observing') {
                            ce.metadata.isHealed = true;
                            ce.metadata.healedAt = new Date().toISOString();
                            ce.metadata.auditStatus = 'Auto-Resolved';
                            ce.metadata.healingReason = `Healed by anchor ${entry.id}: Cycle efficiency (${actualKmPerLiter.toFixed(2)} km/L) is valid.`;
                            ce.auditStatus = 'Auto-Resolved';
                            await kv.set(`fuel_entry:${ce.id}`, ce);
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
            let carryoverVolume = 0;
            let lastResetOdo = 0;

            for (const entry of vehicleEntries) {
                const currentVolume = Number(entry.liters) || 0;
                // Step 2.1: Accumulation Logic (with carryover support)
                let carryoverFromPrev = carryoverVolume;
                const prevCumulative = runningCumulative;
                const totalWithEntry = Number((runningCumulative + currentVolume).toFixed(4));

                // Step 2.2: Trigger Thresholding
                const isHardAnchor = entry.metadata?.isFullTank || entry.metadata?.isAnchor;
                const approachingThreshold = tankCapacity > 0 && totalWithEntry >= (tankCapacity * SOFT_ANCHOR_THRESHOLD);
                const shouldBeSoftAnchor = !isHardAnchor && approachingThreshold;
                
                let volumeContributed = currentVolume;
                let excessVolume = 0;

                // Step 2.3: Virtual Reset Implementation
                if (isHardAnchor || shouldBeSoftAnchor) {
                    if (shouldBeSoftAnchor) {
                        volumeContributed = Math.max(0, tankCapacity - (prevCumulative - carryoverFromPrev));
                        excessVolume = Number((currentVolume - volumeContributed).toFixed(4));
                    }
                }

                // Phase 1 Efficiency Integration
                const profileKmPerLiter = Number(vehicle?.specifications?.fuelEconomy) || Number(vehicle?.fuelSettings?.efficiencyCity) || 0;
                const rangeMin = Number(vehicle?.specifications?.estimatedRangeMin) || 0;
                
                const lastAnchorOdo = vehicleEntries.slice(0, vehicleEntries.indexOf(entry)).reverse().find(t => t.metadata?.isAnchor || t.metadata?.isFullTank || t.metadata?.isSoftAnchor)?.odometer || 0;
                const distanceSinceAnchor = (entry.odometer && lastAnchorOdo) ? (entry.odometer - lastAnchorOdo) : 0;
                
                let actualKmPerLiter = 0;
                let efficiencyVariance = 0;
                if (distanceSinceAnchor > 0 && totalWithEntry > 0) {
                    actualKmPerLiter = distanceSinceAnchor / totalWithEntry;
                    if (profileKmPerLiter > 0) {
                        efficiencyVariance = (profileKmPerLiter - actualKmPerLiter) / profileKmPerLiter;
                    }
                }

                // Check Integrity
                let status = 'valid';
                let anomalyReason = null;
                
                // Step 5.1: Odometer Sequence Audit (Backfill)
                const prevEntryInLoop = vehicleEntries[vehicleEntries.indexOf(entry) - 1];
                const odoAudit = fuelLogic.auditOdometerSequence({
                    currentOdo: Number(entry.odometer),
                    prevOdo: Number(prevEntryInLoop?.odometer || 0),
                    maxExpectedDistance: rangeMin * 1.5
                });

                // Phase 2: Behavioral
                const fourHoursAgo = new Date(new Date(entry.date).getTime() - (4 * 60 * 60 * 1000)).toISOString();
                const recentTxCount = vehicleEntries.slice(0, vehicleEntries.indexOf(entry)).filter(e => e.date >= fourHoursAgo).length;
                const isHighFrequency = recentTxCount >= 1;
                const isFragmented = tankCapacity > 0 && (currentVolume / tankCapacity) < 0.15 && !entry.metadata?.isTopUp;

                if (odoAudit.status === 'critical') {
                    status = 'critical';
                    anomalyReason = odoAudit.reason;
                } else if (tankCapacity > 0 && currentVolume > (tankCapacity * OVERFILL_THRESHOLD)) {
                    status = 'critical';
                    anomalyReason = 'Tank Overfill Anomaly';
                } else if (isHardAnchor || shouldBeSoftAnchor) {
                    const isHighConsumption = efficiencyVariance > 0.25;
                    const isRangeSuspicious = rangeMin > 0 && distanceSinceAnchor < (rangeMin * 0.5) && (totalWithEntry / tankCapacity) > 0.8;
                    
                    if (isHighConsumption || isRangeSuspicious) {
                        status = 'critical';
                        anomalyReason = 'High Fuel Consumption';
                    }
                } else if (odoAudit.status === 'warning') {
                    status = 'warning';
                    anomalyReason = odoAudit.reason;
                } else if (isHighFrequency) {
                    status = 'critical';
                    anomalyReason = 'High Transaction Frequency';
                } else if (isFragmented) {
                    status = 'warning';
                    anomalyReason = 'Fragmented Purchase';
                } else if (tankCapacity > 0 && totalWithEntry > (tankCapacity * 0.85)) {
                    status = 'warning';
                    anomalyReason = 'Approaching Capacity';
                }

                const updatedMetadata = {
                    ...(entry.metadata || {}),
                    volumeContributed: Number(volumeContributed.toFixed(2)),
                    excessVolume: excessVolume > 0 ? Number(excessVolume.toFixed(2)) : undefined,
                    cumulativeLitersAtEntry: Number(totalWithEntry.toFixed(2)),
                    distanceSinceAnchor,
                    actualKmPerLiter: Number(actualKmPerLiter.toFixed(2)),
                    profileKmPerLiter,
                    isHighFrequency,
                    isFragmented,
                    integrityStatus: status,
                    isSoftAnchor: shouldBeSoftAnchor || entry.metadata?.isSoftAnchor,
                    softAnchorNote: shouldBeSoftAnchor ? `Auto-reset: Cumulative volume reached or exceeded 100% of ${tankCapacity}L tank. Split: ${volumeContributed.toFixed(1)}L applied, ${excessVolume.toFixed(1)}L carryover.` : entry.metadata?.softAnchorNote,
                    anomalyReason: anomalyReason,
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
                    carryoverVolume = excessVolume;
                    runningCumulative = carryoverVolume;
                    lastResetOdo = entry.odometer || 0;
                } else {
                    runningCumulative += currentVolume;
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

// --- AUDIT & SUMMARIES (Phase 4) ---
app.get(`${BASE_PATH}/fuel-audit/summary`, async (c) => {
    try {
        const vehicleId = c.req.query("vehicleId");
        const allEntries = await kv.getByPrefix("fuel_entry:");
        const summary = fuelLogic.generateAuditSummary(allEntries, vehicleId);
        return c.json(summary);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get(`${BASE_PATH}/fuel-audit/fleet-stats`, async (c) => {
    try {
        const allEntries = await kv.getByPrefix("fuel_entry:");
        const vehicles = await kv.getByPrefix("vehicle:");
        
        const vehicleSummaries = vehicles.map((v: any) => {
            return fuelLogic.generateAuditSummary(allEntries, v.id);
        });

        const fleetSummary = fuelLogic.generateAuditSummary(allEntries);
        
        return c.json({
            fleet: fleetSummary,
            vehicles: vehicleSummaries
        });
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

export default app;
