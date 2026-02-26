import { Hono } from "npm:hono";
import { streamText } from "npm:hono/streaming";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";
import * as kv from "./kv_store.tsx";
import * as cache from "./cache.ts";
import * as gemini from "./gemini_service.ts";
import { generatePerformanceReport } from "./performance-metrics.tsx";
import { pMap } from "./concurrency.ts";
import { findMatchingStationSmart } from "./geo_matcher.ts";
import * as fuelLogic from "./fuel_logic.ts";
import { Buffer } from "node:buffer";
import fuelApp from "./fuel_controller.tsx";
import auditApp from "./audit_controller.tsx";
import safetyApp from "./safety_controller.tsx";
import syncApp from "./sync_controller.tsx";

// ---------------------------------------------------------------------------
// Future-Date Guardrail
// ---------------------------------------------------------------------------
// Jamaica uses DD/MM/YYYY exclusively. The AI is told to parse dates as
// DD/MM/YYYY and output ISO strings. This post-processing step catches any
// date the AI produced that is still in the future (relative to the server
// clock) — the most common cause is the AI getting the year wrong.
//
// Strategy:
//   1. Parse the ISO date string the AI returned.
//   2. If the date is in the future (> today + 1 day buffer):
//      a. Roll back the year by 1 (most likely AI error).
//      b. If still future, flag it for manual review.
//   NOTE: We do NOT swap day/month — Jamaica is always DD/MM/YYYY, so the
//         AI's DD/MM interpretation is correct. Swapping would break it.
// ---------------------------------------------------------------------------
function correctFutureDates(transactions: any[]): any[] {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);

  return transactions.map(tx => {
    if (!tx.date) return tx;
    try {
      const d = new Date(tx.date);
      if (isNaN(d.getTime())) return tx;
      if (d <= tomorrow) return tx; // Date is in the past or today — fine

      // --- Future date detected ---
      console.log(`[FutureDateFix] Detected future date: ${tx.date}`);

      // Attempt 1: Roll back one year (AI likely got the year wrong)
      const rolledBack = new Date(d);
      rolledBack.setFullYear(rolledBack.getFullYear() - 1);
      if (rolledBack <= tomorrow) {
        const corrected = rolledBack.toISOString().split('T')[0];
        console.log(`[FutureDateFix] Rolled back year -> corrected to ${corrected}`);
        return { ...tx, date: corrected, _dateCorrected: 'year_rollback', _originalDate: tx.date };
      }

      // Attempt 2: If still future even after rollback, just flag it
      console.log(`[FutureDateFix] Could not auto-correct ${tx.date}, flagging`);
      return { ...tx, _dateCorrected: 'unfixable_future', _originalDate: tx.date };
    } catch {
      return tx;
    }
  });
}

const app = new Hono();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);


// Enable logger - DISABLED to prevent OOM on large payloads
// app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    exposeHeaders: ["Content-Length", "X-Cache"],
    maxAge: 600,
  }),
);

// Phase 8.1: Payload Size Logging & Phase 8.2: Big Data Protection Middleware
app.use('*', async (c, next) => {
  const start = Date.now();
  
  try {
    await next();
  } catch (err: any) {
    const isConnectionError = 
        err.message?.includes("connection closed") || 
        err.message?.includes("broken pipe") ||
        err.name === "Http" || 
        err.name === "BrokenPipe" ||
        err.name === "BadResource" ||
        err.code === "ECONNRESET" ||
        err.code === "EPIPE";

    if (isConnectionError) {
        // Silently handle client disconnects - this is normal in web servers
        console.warn(`[Network] Client disconnected prematurely: ${err.message || err.name}`);
        return;
    }

    console.error(`[Fatal Error] Request crashed: ${err.message}`);
    try {
        return c.json({ error: "Server Error: Internal failure" }, 500);
    } catch (e) {
        // If we can't even send a JSON error (e.g. connection is truly dead)
        return;
    }
  }

  const ms = Date.now() - start;
  
  // Safe access to response properties
  try {
    const status = c.res?.status;
    const len = c.res?.headers?.get('Content-Length');
    
    // Log large payloads (> 1MB)
    if (len && parseInt(len) > 1024 * 1024) {
        console.warn(`[Heavy Payload] ${c.req.method} ${c.req.path} - ${len} bytes - ${ms}ms`);
    } else if (status >= 400) {
        console.log(`[Error] ${c.req.method} ${c.req.path} - ${status} - ${ms}ms`);
    }
  } catch (e) {
      // Ignore errors during logging
  }
});

// Phase 8.3: Stress Test / Seed Endpoint
app.post("/make-server-37f42386/test/seed", async (c) => {
    try {
        const { count, driverId, type } = await c.req.json();
        const numTrips = count || 100;
        const targetDriverId = driverId || "test-driver-1";
        
        console.log(`Seeding ${numTrips} items for driver ${targetDriverId}...`);
        
        if (type === 'safety') {
            // Seed specific fatigue patterns
            const trips = [];
            const baseDate = new Date();
            for (let i = 0; i < 20; i++) {
                const date = new Date(baseDate);
                date.setDate(date.getDate() - Math.floor(i / 3));
                // Force some 2AM-5AM trips
                const hour = 2 + (i % 3); 
                const requestTime = new Date(date);
                requestTime.setHours(hour, 0, 0);
                
                trips.push({
                    id: crypto.randomUUID(),
                    driverId: targetDriverId,
                    amount: 500,
                    date: date.toISOString().split('T')[0],
                    requestTime: requestTime.toISOString(),
                    status: 'Completed',
                    platform: 'Uber',
                    distance: 15,
                    duration: 120, // 2 hours each
                    isManual: false
                });
            }
            const keys = trips.map(t => `trip:${t.id}`);
            await kv.mset(keys, trips);
            return c.json({ success: true, seeded: 'fatigue_pattern' });
        }
        
        const trips = [];
        const baseDate = new Date();
        
        for (let i = 0; i < numTrips; i++) {
            const date = new Date(baseDate);
            date.setDate(date.getDate() - Math.floor(Math.random() * 30)); // Last 30 days
            
            trips.push({
                id: crypto.randomUUID(),
                driverId: targetDriverId,
                amount: Math.floor(Math.random() * 2000) + 500, // 500 - 2500
                date: date.toISOString().split('T')[0],
                requestTime: date.toISOString(),
                status: 'Completed',
                platform: Math.random() > 0.5 ? 'Uber' : 'InDrive',
                distance: Math.floor(Math.random() * 20) + 1,
                duration: Math.floor(Math.random() * 60) + 10,
                isManual: false
            });
        }
        
        // Save in chunks of 100 to avoid KV write limits
        for (let i = 0; i < trips.length; i += 100) {
            const chunk = trips.slice(i, i + 100);
            const keys = chunk.map(t => `trip:${t.id}`);
            await kv.mset(keys, chunk);
        }
        
        // Invalidate cache
        await cache.invalidateCacheVersion("stats");
        await cache.invalidateCacheVersion("performance");
        
        return c.json({ success: true, count: numTrips });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Phase 2: AI-Driven OCR & Verification (Refined)
app.post("/make-server-37f42386/ai/process-fuel-receipt", async (c) => {
    try {
        const { imageBase64 } = await c.req.json();
        if (!imageBase64) return c.json({ error: "No image provided" }, 400);

        const data = await gemini.processFuelReceiptVision(imageBase64);
        return c.json(data);
    } catch (e: any) {
        console.error("AI Receipt Error:", e);
        return c.json({ error: `Failed to process receipt: ${e.message}` }, 500);
    }
});

app.post("/make-server-37f42386/ai/verify-odometer", async (c) => {
    try {
        const { currentOdo, previousOdo, tripsDistance, previousDate, currentDate } = await c.req.json();
        const data = await gemini.verifyOdometerLogic(currentOdo, previousOdo, tripsDistance, previousDate, currentDate);
        return c.json(data);
    } catch (e: any) {
        console.error("AI Odo Verification Error:", e);
        return c.json({ error: "Failed to verify odometer" }, 500);
    }
});

// --- VEHICLE TANK STATUS (Phase 4) ---
app.get("/make-server-37f42386/vehicles/:id/tank-status", async (c) => {
    try {
        const vehicleId = c.req.param("id");
        
        // 1. Get Vehicle for Capacity
        const vehicle = await kv.get(`vehicle:${vehicleId}`);
        if (!vehicle) return c.json({ error: "Vehicle not found" }, 404);
        
        const tankCapacity = Number(vehicle?.specifications?.tankCapacity) || Number(vehicle?.fuelSettings?.tankCapacity) || 0;

        // 2. Get Last Transactions to calculate current cumulative
        const { data: lastTxData } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "transaction:%")
            .eq("value->>vehicleId", vehicleId)
            .order("value->>date", { ascending: false })
            .limit(15);
        
        const lastTransactions = (lastTxData || []).map((d: any) => d.value);
        
        let cumulative = 0;
        let lastAnchorFound = false;
        let lastOdometer = 0;
        let lastCycleId = null;
        
        // Find the last odometer across ALL transactions for this vehicle
        const lastTxWithOdo = lastTransactions.find(tx => Number(tx.odometer) > 0);
        lastOdometer = lastTxWithOdo ? Number(lastTxWithOdo.odometer) : 0;

        for (const tx of lastTransactions) {
            if (tx.metadata?.isAnchor || tx.metadata?.isFullTank || tx.metadata?.isSoftAnchor) {
                lastAnchorFound = true;
                lastCycleId = tx.metadata?.cycleId;
                break;
            }
            cumulative += (Number(tx.quantity) || Number(tx.metadata?.fuelVolume) || Number(tx.liters) || 0);
        }

        return c.json({
            vehicleId,
            tankCapacity,
            lastOdometer,
            currentCycleId: lastCycleId,
            currentCumulative: Number(cumulative.toFixed(2)),
            progressPercent: tankCapacity > 0 ? Number(((cumulative / tankCapacity) * 100).toFixed(1)) : 0,
            status: cumulative > (tankCapacity * 1.05) ? 'Critical: Tank Overflow' : 
                    cumulative > (tankCapacity * 1.00) ? 'Cycle Reset Triggered' :
                    cumulative > (tankCapacity * 0.85) ? 'Approaching Capacity' : 'Normal',
            isAnomaly: cumulative > (tankCapacity * 1.05)
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// --- FUEL AUDIT DASHBOARD (Phase 6) ---
app.get("/make-server-37f42386/admin/fuel-audit/summary", async (c) => {
    try {
        const { data: txData } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "transaction:%");
        
        const transactions = (txData || []).map((d: any) => d.value);
        const fuelTx = transactions.filter(t => t.category === 'Fuel' || t.category === 'Fuel Reimbursement');

        const summary = {
            totalFuelTransactions: fuelTx.length,
            flaggedCount: fuelTx.filter(t => (t.metadata?.integrityStatus === 'warning' || t.metadata?.integrityStatus === 'critical') && !t.metadata?.isHealed).length,
            criticalCount: fuelTx.filter(t => t.metadata?.integrityStatus === 'critical' && !t.metadata?.isHealed).length,
            resolvedCount: fuelTx.filter(t => t.metadata?.auditStatus === 'resolved' || t.metadata?.auditStatus === 'Auto-Resolved' || t.metadata?.isHealed).length,
            observingCount: fuelTx.filter(t => t.metadata?.auditStatus === 'Observing').length,
            pendingReview: fuelTx.filter(t => (t.metadata?.integrityStatus === 'warning' || t.metadata?.integrityStatus === 'critical') && !t.metadata?.isHealed && !['resolved', 'Auto-Resolved', 'Observing'].includes(t.metadata?.auditStatus || '')).length
        };

        return c.json(summary);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get("/make-server-37f42386/admin/fuel-audit/flagged", async (c) => {
    try {
        const { data: txData } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "transaction:%")
            .order("value->>date", { ascending: false });
        
        const transactions = (txData || []).map((d: any) => d.value);
        const flagged = transactions.filter(t => 
            (t.category === 'Fuel' || t.category === 'Fuel Reimbursement') && 
            (
                (t.metadata?.integrityStatus === 'warning' || t.metadata?.integrityStatus === 'critical') && !t.metadata?.isHealed ||
                t.metadata?.auditStatus === 'Observing'
            )
        );

        return c.json(flagged);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post("/make-server-37f42386/admin/fuel-audit/resolve", async (c) => {
    try {
        const { transactionId, status, note } = await c.req.json();
        const tx = await kv.get(`transaction:${transactionId}`);
        if (!tx) return c.json({ error: "Transaction not found" }, 404);

        tx.metadata = {
            ...tx.metadata,
            auditStatus: status, // 'resolved', 'disputed', 'rejected'
            auditNote: note,
            auditedAt: new Date().toISOString()
        };

        await kv.set(`transaction:${transactionId}`, tx);
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Phase 3: Recalculate All History (Logic: 100% Reset / 105% Anomaly)
app.post("/make-server-37f42386/admin/fuel-audit/recalculate-all", async (c) => {
    try {
        console.log("[Recalculate] Starting full history recalculation (100% Logic)...");

        // Load configurable frequency threshold
        const auditConfig = await kv.get("config:audit_settings");
        const frequencyThreshold = Number(auditConfig?.frequencyThreshold) || 3;
        // Phase 21: configurable efficiency variance threshold (default 30%)
        const efficiencyThreshold = Number(auditConfig?.efficiencyThreshold) || 0.30;

        // 1. Fetch all Vehicles (for Tank Capacity)
        const { data: vehicleData } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "vehicle:%");
            
        const vehicleMap = new Map();
        (vehicleData || []).forEach((d: any) => {
            const v = d.value;
            if (v && v.id) {
                const cap = Number(v.fuelSettings?.tankCapacity) || Number(v.specifications?.tankCapacity) || 0;
                vehicleMap.set(v.id, {
                    capacity: cap,
                    fuelEconomy: Number(v.specifications?.fuelEconomy) || Number(v.fuelSettings?.efficiencyCity) || 0,
                    estimatedRangeMin: Number(v.specifications?.estimatedRangeMin) || 0
                });
            }
        });
        console.log(`[Recalculate] Loaded ${vehicleMap.size} vehicles.`);

        // 2. Fetch all Transactions
        const { data: txData, error: txError } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "transaction:%");
            
        if (txError) throw txError;

        const allTransactions = (txData || []).map((d: any) => d.value);
        const fuelTransactions = allTransactions.filter((t: any) => t.category === 'Fuel' || t.category === 'Fuel Reimbursement');
        
        console.log(`[Recalculate] Processing ${fuelTransactions.length} fuel transactions...`);

        // 3. Group by Vehicle
        const byVehicle = new Map<string, any[]>();
        fuelTransactions.forEach((tx: any) => {
            const vId = tx.vehicleId || 'unknown';
            if (!byVehicle.has(vId)) byVehicle.set(vId, []);
            byVehicle.get(vId)!.push(tx);
        });

        // 4. Process each vehicle
        const updates: any[] = [];
        let modifiedCount = 0;
        let efficiencySkippedCount = 0;  // Phase 24: count entries where rolling avg was unavailable

        for (const [vId, txs] of byVehicle.entries()) {
            const vehicleInfo = vehicleMap.get(vId);
            if (!vehicleInfo || vehicleInfo.capacity <= 0) continue;
            const capacity = vehicleInfo.capacity;

            // Sort by date and odometer to ensure chronological processing
            txs.sort((a, b) => {
                const dateStrA = a.date.includes('-') ? a.date : a.date.replace(/\//g, '-');
                const dateStrB = b.date.includes('-') ? b.date : b.date.replace(/\//g, '-');
                const dateA = new Date(a.time ? `${dateStrA} ${a.time}` : dateStrA).getTime();
                const dateB = new Date(b.time ? `${dateStrB} ${b.time}` : dateStrB).getTime();
                if (!isNaN(dateA) && !isNaN(dateB)) {
                    if (dateA !== dateB) return dateA - dateB;
                }
                return (a.odometer || 0) - (b.odometer || 0);
            });

            let runningCumulative = 0;
            let carryoverVolume = 0;
            let currentCycleId = crypto.randomUUID();
            // Phase 20: running anchor odometer tracker (replaces broken per-entry metadata lookup)
            let lastAnchorOdo = 0;
            // Phase 21: pre-compute rolling average efficiency for this vehicle's transactions
            const txRollingAvg = fuelLogic.calculateRollingEfficiencyBatch(txs);
            if (!txRollingAvg) efficiencySkippedCount += txs.length;

            for (let i = 0; i < txs.length; i++) {
                const tx = txs[i];
                const volume = Number(tx.quantity) || Number(tx.metadata?.fuelVolume) || Number(tx.liters) || 0;
                
                // Track volume before this entry
                const prevCumulative = runningCumulative;
                runningCumulative += volume;

                const percentOfTank = (runningCumulative / capacity) * 100;
                
                // Logic: 
                // 100% = Soft Anchor (System Reset)
                // 105% = Anomaly (Overflow)
                // Phase 18 fix: only metadata.isFullTank / metadata.isAnchor mark a hard anchor
                // (removed tx.type === 'Reimbursement' — reimbursements are NOT automatic full-tank anchors)
                const isManualFull = tx.metadata?.isFullTank === true || tx.metadata?.isAnchor === true;
                const isSoftAnchor = !isManualFull && percentOfTank >= 100;
                const isAnchor = isManualFull || isSoftAnchor;

                let volumeContributed = volume;
                let excessVolume = 0;

                if (isAnchor && isSoftAnchor) {
                    volumeContributed = Math.max(0, capacity - prevCumulative);
                    excessVolume = volume - volumeContributed;
                }

                // Phase 1 Efficiency Integration (using pre-loaded vehicleMap to avoid N+1 queries)
                const profileKmPerLiter = vehicleInfo.fuelEconomy;
                const rangeMin = vehicleInfo.estimatedRangeMin;
                // Phase 21: use rolling average as efficiency baseline (fall back to skip if insufficient data)
                const efficiencyBaseline = txRollingAvg?.avgKmPerLiter || 0;
                
                // Phase 20: use running lastAnchorOdo instead of broken metadata lookup
                const distanceSinceAnchor = (tx.odometer && lastAnchorOdo) ? (tx.odometer - lastAnchorOdo) : 0;
                
                let actualKmPerLiter = 0;
                let efficiencyVariance = 0;
                if (distanceSinceAnchor > 0 && runningCumulative > 0) {
                    actualKmPerLiter = distanceSinceAnchor / runningCumulative;
                    if (efficiencyBaseline > 0) {
                        efficiencyVariance = (efficiencyBaseline - actualKmPerLiter) / efficiencyBaseline;
                    }
                }

                let integrityStatus = 'stable';
                let anomalyReason = null;
                
                // Phase 2: Behavioral Check
                const fourHoursAgo = new Date(new Date(tx.date).getTime() - (4 * 60 * 60 * 1000)).toISOString();
                const recentTxCount = txs.slice(0, i).filter(t => t.date >= fourHoursAgo).length;
                // Card-only frequency check: only flag card transactions, cash/reimbursement exempt
                const isCardTx = tx.paymentMethod === 'Gas Card' || tx.paymentMethod === 'Fuel Card' || tx.type === 'Card_Transaction' || tx.paymentSource === 'Gas_Card';
                const isHighFrequency = isCardTx && recentTxCount >= (frequencyThreshold - 1);
                const isFragmented = capacity > 0 && (volume / capacity) < 0.15 && !tx.metadata?.isTopUp;

                if (capacity > 0 && volume > capacity) {
                    integrityStatus = 'critical';
                    anomalyReason = 'Soft Anchor / Tank Overfill';
                } else if (isAnchor && distanceSinceAnchor > 0) {
                    // Phase 19/20: only check efficiency when we have real distance data
                    // Phase 21: skip if no rolling average (efficiencyBaseline=0), use configurable threshold
                    const isHighConsumption = efficiencyBaseline > 0 && efficiencyVariance > efficiencyThreshold;
                    const isRangeSuspicious = rangeMin > 0 && distanceSinceAnchor > 0 && distanceSinceAnchor < (rangeMin * 0.5) && (runningCumulative / capacity) > 0.8;
                    
                    if (isHighConsumption || isRangeSuspicious) {
                        integrityStatus = 'critical';
                        anomalyReason = 'High Fuel Consumption';
                    }
                } else if (isHighFrequency) {
                    integrityStatus = 'critical';
                    anomalyReason = 'High Transaction Frequency';
                } else if (isFragmented) {
                    integrityStatus = 'warning';
                    anomalyReason = 'Fragmented Purchase';
                } else if (percentOfTank > 85) {
                    integrityStatus = 'warning';
                    anomalyReason = 'Approaching Capacity';
                }

                const newMetadata = {
                    ...tx.metadata,
                    volumeContributed: Number(volumeContributed.toFixed(2)),
                    excessVolume: excessVolume > 0 ? Number(excessVolume.toFixed(2)) : undefined,
                    cumulativeLitersAtEntry: Number(runningCumulative.toFixed(2)),
                    tankCapacityAtEntry: capacity,
                    distanceSinceAnchor,
                    actualKmPerLiter: Number(actualKmPerLiter.toFixed(2)),
                    profileKmPerLiter,
                    // Phase 21: rolling average metadata
                    rollingAvgKmPerLiter: txRollingAvg?.avgKmPerLiter ?? null,
                    rollingAvgWindow: txRollingAvg?.window ?? null,
                    rollingAvgEntryCount: txRollingAvg?.entryCount ?? 0,
                    efficiencyBaseline: txRollingAvg ? 'rolling' : 'skipped',
                    efficiencyVariance: Number(efficiencyVariance.toFixed(4)),
                    isSoftAnchor: isSoftAnchor,
                    isAnchor: isAnchor,
                    isHighFrequency,
                    isFragmented,
                    integrityStatus,
                    anomalyReason,
                    cycleId: currentCycleId,
                    recalculatedAt: new Date().toISOString()
                };

                // Check if anything meaningful changed
                const hasChanged = 
                    tx.metadata?.cycleId !== currentCycleId ||
                    tx.metadata?.cumulativeLitersAtEntry !== newMetadata.cumulativeLitersAtEntry ||
                    tx.metadata?.integrityStatus !== newMetadata.integrityStatus ||
                    tx.metadata?.excessVolume !== newMetadata.excessVolume;

                if (hasChanged) {
                    tx.metadata = newMetadata;
                    updates.push(tx);
                    modifiedCount++;
                }

                // Reset cycle if this was an anchor
                if (isAnchor) {
                    carryoverVolume = excessVolume;
                    runningCumulative = carryoverVolume;
                    currentCycleId = crypto.randomUUID();
                    // Phase 20: update running anchor odometer for next iteration
                    lastAnchorOdo = tx.odometer || lastAnchorOdo;
                }
            }
        }

        // 5. Batch Save transaction:* (Chunked)
        if (updates.length > 0) {
            console.log(`[Recalculate] Saving ${updates.length} transaction updates in chunks...`);
            const CHUNK_SIZE = 50;
            for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
                const chunk = updates.slice(i, i + CHUNK_SIZE);
                const keys = chunk.map(t => `transaction:${t.id}`);
                await kv.mset(keys, chunk);
            }
        }

        // ====================================================================
        // 6. ALSO recalculate fuel_entry:* records (what the Audit Dashboard reads)
        // ====================================================================
        console.log(`[Recalculate] Now processing fuel_entry:* records...`);
        const { data: entryData, error: entryError } = await supabase
            .from("kv_store_37f42386")
            .select("key, value")
            .like("key", "fuel_entry:%");
        
        if (entryError) {
            console.log(`[Recalculate] Warning: Could not load fuel entries: ${entryError.message}`);
        }

        const allEntries = (entryData || []).map((d: any) => ({ _kvKey: d.key, ...d.value }));
        console.log(`[Recalculate] Found ${allEntries.length} fuel entries to re-score.`);

        // Group fuel entries by vehicle
        const entriesByVehicle = new Map<string, any[]>();
        allEntries.forEach((entry: any) => {
            const vId = entry.vehicleId || 'unknown';
            if (!entriesByVehicle.has(vId)) entriesByVehicle.set(vId, []);
            entriesByVehicle.get(vId)!.push(entry);
        });

        const entryUpdates: any[] = [];
        let entryModifiedCount = 0;

        for (const [vId, entries] of entriesByVehicle.entries()) {
            const vehicleInfo = vehicleMap.get(vId);
            if (!vehicleInfo || vehicleInfo.capacity <= 0) continue;
            const capacity = vehicleInfo.capacity;
            const profileKmPerLiter = vehicleInfo.fuelEconomy;
            const rangeMin = vehicleInfo.estimatedRangeMin;

            // Sort chronologically
            entries.sort((a, b) => {
                const dateA = new Date(a.date).getTime();
                const dateB = new Date(b.date).getTime();
                if (!isNaN(dateA) && !isNaN(dateB) && dateA !== dateB) return dateA - dateB;
                return (a.odometer || 0) - (b.odometer || 0);
            });

            let runningCumulative = 0;
            // Phase 20: running anchor odometer tracker (replaces broken per-entry metadata lookup)
            let lastAnchorOdo = 0;
            // Phase 21: pre-compute rolling average efficiency for this vehicle's fuel entries
            const entryRollingAvg = fuelLogic.calculateRollingEfficiencyBatch(entries);
            const efficiencyBaseline = entryRollingAvg?.avgKmPerLiter || 0;
            if (!entryRollingAvg) efficiencySkippedCount += entries.length;

            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                const volume = Number(entry.liters) || Number(entry.metadata?.fuelVolume) || 0;
                const prevCumulative = runningCumulative;
                runningCumulative += volume;

                const percentOfTank = capacity > 0 ? (runningCumulative / capacity) * 100 : 0;
                // Phase 18 fix: only metadata.isFullTank / metadata.isAnchor mark a hard anchor
                // (removed entry.type === 'Reimbursement' — reimbursements are NOT automatic full-tank anchors)
                const isManualFull = entry.metadata?.isFullTank === true || entry.metadata?.isAnchor === true;
                const isSoftAnchor = !isManualFull && percentOfTank >= 100;
                const isAnchor = isManualFull || isSoftAnchor;

                // Efficiency calculation
                // Phase 20: use running lastAnchorOdo instead of broken metadata lookup
                const distanceSinceAnchor = (entry.odometer && lastAnchorOdo) ? (entry.odometer - lastAnchorOdo) : 0;
                let actualKmPerLiter = 0;
                let efficiencyVariance = 0;
                if (distanceSinceAnchor > 0 && runningCumulative > 0 && efficiencyBaseline > 0) {
                    actualKmPerLiter = distanceSinceAnchor / runningCumulative;
                    efficiencyVariance = (efficiencyBaseline - actualKmPerLiter) / efficiencyBaseline;
                }

                // Frequency check (4-hour window) — card-only
                const fourHoursAgo = new Date(new Date(entry.date).getTime() - (4 * 60 * 60 * 1000)).toISOString();
                const recentTxCount = entries.slice(0, i).filter(e => e.date >= fourHoursAgo).length;
                const isCardTx = entry.type === 'Card_Transaction' || entry.paymentSource === 'Gas_Card' ||
                    entry.paymentMethod === 'Gas Card' || entry.paymentMethod === 'Fuel Card';
                const isHighFrequency = isCardTx && recentTxCount >= (frequencyThreshold - 1);
                const isFragmented = capacity > 0 && (volume / capacity) < 0.15 && !entry.metadata?.isTopUp;

                // Determine new integrity
                let newIntegrityStatus = 'stable';
                let newAnomalyReason: string | null = null;
                let newAuditStatus = 'Clean';

                if (capacity > 0 && volume > (capacity * 1.02)) {
                    newIntegrityStatus = 'critical';
                    newAnomalyReason = 'Tank Overfill Anomaly';
                    newAuditStatus = 'Flagged';
                } else if (isAnchor && distanceSinceAnchor > 0) {
                    // Phase 19/20: only check efficiency when we have real distance data
                    // Phase 21: skip if no rolling average (efficiencyBaseline=0), use configurable threshold
                    const isHighConsumption = efficiencyBaseline > 0 && efficiencyVariance > efficiencyThreshold;
                    const isRangeSuspicious = rangeMin > 0 && distanceSinceAnchor > 0 && distanceSinceAnchor < (rangeMin * 0.5) && (runningCumulative / capacity) > 0.8;
                    if (isHighConsumption || isRangeSuspicious) {
                        newIntegrityStatus = 'critical';
                        newAnomalyReason = 'High Fuel Consumption';
                        newAuditStatus = 'Flagged';
                    }
                } else if (isHighFrequency) {
                    newIntegrityStatus = 'critical';
                    newAnomalyReason = 'High Transaction Frequency';
                    newAuditStatus = 'Flagged';
                } else if (isFragmented) {
                    newIntegrityStatus = 'warning';
                    newAnomalyReason = 'Fragmented Purchase';
                    newAuditStatus = 'Flagged';
                } else if (percentOfTank > 85) {
                    newIntegrityStatus = 'warning';
                    newAnomalyReason = 'Approaching Capacity';
                    newAuditStatus = 'Observing';
                }

                const newIsFlagged = newIntegrityStatus === 'critical';

                // Skip if already manually resolved / healed (don't override human decisions)
                if (entry.auditStatus === 'Resolved' || entry.auditStatus === 'Auto-Resolved' || entry.metadata?.isHealed) {
                    if (isAnchor) { runningCumulative = 0; }
                    continue;
                }

                // Check if anything actually changed
                const oldStatus = entry.metadata?.integrityStatus;
                const oldReason = entry.metadata?.anomalyReason || entry.anomalyReason;
                const oldFlagged = entry.isFlagged;

                if (oldStatus !== newIntegrityStatus || oldReason !== newAnomalyReason || oldFlagged !== newIsFlagged) {
                    entry.isFlagged = newIsFlagged;
                    entry.auditStatus = newAuditStatus;
                    entry.anomalyReason = newAnomalyReason;
                    entry.metadata = {
                        ...entry.metadata,
                        integrityStatus: newIntegrityStatus,
                        anomalyReason: newAnomalyReason,
                        auditStatus: newAuditStatus,
                        distanceSinceAnchor,
                        actualKmPerLiter: Number(actualKmPerLiter.toFixed(2)),
                        profileKmPerLiter,
                        // Phase 21: rolling average metadata
                        rollingAvgKmPerLiter: entryRollingAvg?.avgKmPerLiter ?? null,
                        rollingAvgWindow: entryRollingAvg?.window ?? null,
                        rollingAvgEntryCount: entryRollingAvg?.entryCount ?? 0,
                        efficiencyBaseline: entryRollingAvg ? 'rolling' : 'skipped',
                        efficiencyVariance: Number(efficiencyVariance.toFixed(4)),
                        isHighFrequency,
                        isFragmented,
                        isSoftAnchor,
                        isAnchor,
                        recalculatedAt: new Date().toISOString()
                    };
                    entryUpdates.push(entry);
                    entryModifiedCount++;
                }

                // Reset cycle at anchors
                if (isAnchor) {
                    runningCumulative = 0;
                    // Phase 20: update running anchor odometer for next iteration
                    lastAnchorOdo = entry.odometer || lastAnchorOdo;
                }
            }
        }

        // 7. Batch Save fuel_entry:* (Chunked)
        if (entryUpdates.length > 0) {
            console.log(`[Recalculate] Saving ${entryUpdates.length} fuel entry updates...`);
            const CHUNK_SIZE = 50;
            for (let i = 0; i < entryUpdates.length; i += CHUNK_SIZE) {
                const chunk = entryUpdates.slice(i, i + CHUNK_SIZE);
                const keys = chunk.map(e => e._kvKey || `fuel_entry:${e.id}`);
                // Strip the temporary '_kvKey' property before saving
                const values = chunk.map(e => { const { _kvKey, ...rest } = e; return rest; });
                await kv.mset(keys, values);
            }
        }

        console.log(`[Recalculate] Complete. Transactions: ${modifiedCount} modified. Fuel Entries: ${entryModifiedCount} modified.`);

        return c.json({ 
            success: true, 
            processed: fuelTransactions.length,
            modified: modifiedCount,
            entriesProcessed: allEntries.length,
            entriesModified: entryModifiedCount,
            cyclesIdentified: updates.filter(u => u.metadata?.isAnchor).length,
            // Phase 21: efficiency config used for this recalculation
            efficiencyThreshold,
            efficiencyBaseline: 'rolling-average',
            // Phase 24: count of entries where rolling avg was unavailable
            efficiencySkippedCount
        });

    } catch (e: any) {
        console.error("Recalculate Error:", e);
        return c.json({ error: e.message }, 500);
    }
});

// Phase 8.4: Automated Monthly Report Generation
app.get("/make-server-37f42386/admin/monthly-report", async (c) => {
    try {
        const month = c.req.query("month"); // YYYY-MM
        if (!month) return c.json({ error: "Month is required (YYYY-MM)" }, 400);

        console.log(`[Monthly Report] Generating for ${month}...`);

        // Fetch all transactions for that month
        const { data: txData } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "transaction:%")
            .filter("value->>date", "like", `${month}%`);
        
        const transactions = (txData || []).map((d: any) => d.value);

        // Fetch all trips for that month
        const { data: tripData } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "trip:%")
            .filter("value->>date", "like", `${month}%`);

        const trips = (tripData || []).map((d: any) => d.value);

        const totalRevenue = trips.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        const totalExpenses = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        const fuelExpenses = transactions.filter(t => t.category === 'Fuel').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

        const report = {
            month,
            generatedAt: new Date().toISOString(),
            metrics: {
                totalRevenue,
                totalExpenses,
                fuelExpenses,
                netIncome: totalRevenue - totalExpenses,
                tripCount: trips.length,
                transactionCount: transactions.length
            },
            integrity: {
                checksum: `sha256-month-${month}-${crypto.randomUUID().split('-')[0]}`,
                locked: true
            }
        };

        return c.json(report);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

      // Phase 8.5: Unified Vehicle Logs (Batch Fetching)
      app.get("/make-server-37f42386/vehicles/:id/unified-logs", async (c) => {
          try {
              const vehicleId = c.req.param("id");
              
              // Fetch specific category lists using KV prefixes or direct keys
              const [history, maintenance] = await kv.mget([
                  `odometer-history:${vehicleId}`,
                  `maintenance-logs:${vehicleId}`
              ]);
              
              // For fuel entries which are stored as individual items
              // Support both hyphen and underscore prefixes for maximum reliability during transition
              const { data: fuelDataUnderscore } = await supabase
                  .from("kv_store_37f42386")
                  .select("value")
                  .like("key", "fuel_entry:%")
                  .eq("value->>vehicleId", vehicleId);
                  
              const { data: fuelDataHyphen } = await supabase
                  .from("kv_store_37f42386")
                  .select("value")
                  .like("key", "fuel-entry:%")
                  .eq("value->>vehicleId", vehicleId);
                  
              const fuelEntries = [
                  ...(fuelDataUnderscore || []).map((d: any) => d.value),
                  ...(fuelDataHyphen || []).map((d: any) => d.value)
              ];

              // Deduplicate if any exist in both formats
              const uniqueFuelEntries = Array.from(new Map(fuelEntries.map(item => [item.id, item])).values());

              return c.json({
                  odometerHistory: history || [],
                  maintenanceLogs: maintenance || [],
                  fuelEntries: uniqueFuelEntries || []
              });
          } catch (e: any) {
              return c.json({ error: e.message }, 500);
          }
      });

// Phase 8.1 & 8.2: System Hardening - Error Logging
app.post("/make-server-37f42386/system/log-error", async (c) => {
    try {
        const { error, info, userId, componentName } = await c.req.json();
        const logId = crypto.randomUUID();
        const logEntry = {
            id: logId,
            timestamp: new Date().toISOString(),
            error: error?.message || error,
            stack: error?.stack,
            component: componentName,
            info,
            userId,
            env: Deno.env.get("DENO_REGION") || "local"
        };
        
        // Persist to KV for forensic review
        await kv.set(`error-log:${logId}`, logEntry);
        console.error(`[Frontend Error] ${componentName}: ${logEntry.error}`);
        
        return c.json({ success: true, logId });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Phase 8.3: Forensic Audit Export Hardening - Signing
app.post("/make-server-37f42386/audit/sign-report", async (c) => {
    try {
        const { reportData, reportType } = await c.req.json();
        
        // Create a canonical string for signing
        const canonical = JSON.stringify(reportData, Object.keys(reportData).sort());
        
        // In a real env we'd use a private key, here we use service role hash as a HMAC-like signature
        const encoder = new TextEncoder();
        const data = encoder.encode(canonical + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        return c.json({
            signature,
            signer: "Fleet Integrity Security Module",
            timestamp: new Date().toISOString()
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Health check endpoint
app.get("/make-server-37f42386/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/", fuelApp);
app.route("/", auditApp);
app.route("/", safetyApp);
app.route("/", syncApp);

// Google Maps Config Endpoint
app.get("/make-server-37f42386/maps-config", (c) => {
  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  return c.json({ apiKey: apiKey || "", timestamp: Date.now() });
});

// Audit Config Endpoints (configurable frequency threshold)
app.get("/make-server-37f42386/audit-config", async (c) => {
  try {
    const config = await kv.get("config:audit_settings");
    return c.json(config || { frequencyThreshold: 3, efficiencyThreshold: 0.30 });
  } catch (e: any) {
    console.log(`[AuditConfig] GET error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/audit-config", async (c) => {
  try {
    const body = await c.req.json();
    const existing = await kv.get("config:audit_settings") || {};
    const updated = { ...existing, ...body, updatedAt: new Date().toISOString() };
    await kv.set("config:audit_settings", updated);
    console.log(`[AuditConfig] Saved: ${JSON.stringify(updated)}`);
    return c.json({ success: true, data: updated });
  } catch (e: any) {
    console.log(`[AuditConfig] POST error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// Dashboard Stats Endpoint (Aggregated) - Optimized
app.get("/make-server-37f42386/dashboard/stats", async (c) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    // Query today's trips - Optimized
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const endOfTodayISO = endOfToday.toISOString();

    const { data: tripData, error: tripError } = await supabase
        .from("kv_store_37f42386")
        .select("value->amount, value->driverId")
        .like("key", "trip:%")
        .or(`value->>date.gte.${todayISO},value->>requestTime.gte.${todayISO}`)
        .or(`value->>date.lte.${endOfTodayISO},value->>requestTime.lte.${endOfTodayISO}`);

    if (tripError) throw tripError;

    // Get active drivers count directly
    const { count: activeDriverCount, error: driverError } = await supabase
        .from("kv_store_37f42386")
        .select("*", { count: 'exact', head: true })
        .like("key", "driver:%")
        .eq("value->>status", "active");

    if (driverError) throw driverError;
    
    // Note: When selecting JSON fields directly (value->field), PostgREST returns them as flat keys
    const trips = tripData || [];
    
    let revenueToday = 0;
    const activeDriverIds = new Set();

    trips.forEach((t: any) => {
        revenueToday += (Number(t.amount) || 0);
        if (t.driverId) {
            activeDriverIds.add(t.driverId);
        }
    });

    const activeDrivers = activeDriverIds.size > 0 ? activeDriverIds.size : (activeDriverCount || 0);
    // Fallback: If no trips today, show active drivers from DB. If trips exist, show drivers who drove today? 
    // Usually "Active Drivers" on dashboard means "Drivers currently working".
    // We'll use the larger of the two to be safe, or just activeDriverCount if we want "Registered Active"
    
    const finalActiveDrivers = activeDriverCount || 0;
    const efficiency = finalActiveDrivers > 0 ? Math.round((activeDrivers / finalActiveDrivers) * 100) : 0;

    return c.json({
        date: new Date().toISOString(),
        activeDrivers: finalActiveDrivers,
        trips: trips.length,
        revenue: revenueToday,
        efficiency: efficiency
    });
  } catch (e: any) {
    console.error("Error fetching dashboard stats:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

// Trips endpoints
// Trips Search Endpoint (GIN Index)
app.post("/make-server-37f42386/trips/search", async (c) => {
  try {
    let { 
        driverId, startDate, endDate, status, limit, offset,
        platform, tripType, vehicleId, anchorPeriodId
    } = await c.req.json();
    
    // Query JSONB value directly
    let query = supabase
        .from("kv_store_37f42386")
        .select("value", { count: 'exact' })
        .like("key", "trip:%");

    if (driverId) {
        query = query.eq("value->>driverId", driverId);
    }

    if (anchorPeriodId) {
        query = query.eq("value->>anchorPeriodId", anchorPeriodId);
    }
    
    if (status === 'Processing') {
        // Handle variations of "In Progress" status and relax date constraints for active trips
        query = query.or(`value->>status.eq.Processing,value->>status.eq.In Progress,value->>status.eq.In_Progress,value->>status.eq.started`);
        
        // Clear date filters for active trips to ensure they appear regardless of start time
        startDate = undefined;
        endDate = undefined;
    } else if (status) {
        query = query.eq("value->>status", status);
    }

    if (platform) {
        query = query.eq("value->>platform", platform);
    }

    if (vehicleId) {
        query = query.eq("value->>vehicleId", vehicleId);
    }

    if (tripType === 'manual') {
        query = query.eq("value->>isManual", true);
    } else if (tripType === 'platform') {
        query = query.not("value->>isManual", "eq", "true");
    }

    if (startDate) {
        query = query.or(`value->>date.gte.${startDate},value->>requestTime.gte.${startDate}`);
    }
    
    if (endDate) {
        query = query.or(`value->>date.lte.${endDate},value->>requestTime.lte.${endDate}`);
    }

    // Order by date desc (Note: textual comparison works for ISO dates)
    query = query.order("value->>date", { ascending: false });

    const from = offset || 0;
    const to = from + (limit || 50) - 1;
    
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
        console.error("Search query error:", error);
        throw error;
    }

    // Phase 8.4: Large Data Stripping
    // Remove heavy fields (route, stops) from search results to prevent "Connection Closed" errors
    const trips = (data || []).map((d: any) => {
        const v = d.value || {};
        const { route, stops, ...lightweight } = v;
        return lightweight;
    });

    return c.json({
        data: trips,
        page: Math.floor(from / (limit || 50)) + 1,
        limit: limit || 50,
        total: count || 0
    });

  } catch (e: any) {
    console.error("Error searching trips:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

// Trip Stats Endpoint (Aggregated)
app.post("/make-server-37f42386/trips/stats", async (c) => {
  try {
    const filters = await c.req.json();
    let { 
        driverId, startDate, endDate, status,
        platform, tripType, vehicleId, anchorPeriodId
    } = filters;

    // 1. Check Cache
    // We use the entire filter object to generate a unique key
    const version = await cache.getCacheVersion("stats");
    const cacheKey = await cache.generateKey(`stats:${version}`, filters);
    const cachedStats = await cache.getCache(cacheKey);

    if (cachedStats) {
        c.header("X-Cache", "HIT");
        return c.json(cachedStats);
    }
    
    // Query specific fields to avoid loading heavy route data
    // Include indriveNetIncome & platform so we can use true profit for InDrive trips
    let query = supabase
        .from("kv_store_37f42386")
        .select("value->status, value->amount, value->cashCollected, value->duration, value->platform, value->indriveNetIncome")
        .like("key", "trip:%");

    if (driverId) {
        query = query.eq("value->>driverId", driverId);
    }

    if (anchorPeriodId) {
        query = query.eq("value->>anchorPeriodId", anchorPeriodId);
    }
    
    if (status === 'Processing') {
        // Handle variations of "In Progress" status and relax date constraints for active trips
        query = query.or(`value->>status.eq.Processing,value->>status.eq.In Progress,value->>status.eq.In_Progress,value->>status.eq.started`);
        
        // Clear date filters for active trips to ensure they appear regardless of start time
        startDate = undefined;
        endDate = undefined;
    } else if (status) {
        query = query.eq("value->>status", status);
    }

    if (platform) {
        query = query.eq("value->>platform", platform);
    }

    if (vehicleId) {
        query = query.eq("value->>vehicleId", vehicleId);
    }

    if (tripType === 'manual') {
        query = query.eq("value->>isManual", true);
    } else if (tripType === 'platform') {
        query = query.not("value->>isManual", "eq", "true");
    }

    if (startDate) {
        query = query.or(`value->>date.gte.${startDate},value->>requestTime.gte.${startDate}`);
    }
    
    if (endDate) {
        query = query.or(`value->>date.lte.${endDate},value->>requestTime.lte.${endDate}`);
    }

    // No limit or offset - we need all matching records to calculate stats
    const { data, error } = await query;

    if (error) {
        console.error("Stats query error:", error);
        throw error;
    }

    const trips = data || [];

    const totalTrips = trips.length;
    const completed = trips.filter((t: any) => t.status === 'Completed').length;
    const cancelled = trips.filter((t: any) => t.status === 'Cancelled').length;
    
    // For InDrive trips with fee data, use true profit (net income) instead of full fare
    const totalEarnings = trips.reduce((sum: number, t: any) => {
      const effectiveEarnings = (t.platform === 'InDrive' && t.indriveNetIncome != null)
        ? Number(t.indriveNetIncome)
        : (Number(t.amount) || 0);
      return sum + effectiveEarnings;
    }, 0);
    const totalCashCollected = trips.reduce((sum: number, t: any) => sum + (Number(t.cashCollected) || 0), 0);
    const avgEarnings = completed > 0 ? totalEarnings / completed : 0;
    
    const tripsWithDuration = trips.filter((t: any) => t.duration && t.duration > 0);
    const totalDuration = tripsWithDuration.reduce((sum: number, t: any) => sum + (Number(t.duration) || 0), 0);
    const avgDuration = tripsWithDuration.length > 0 ? totalDuration / tripsWithDuration.length : 0;

    const result = {
        totalTrips,
        completed,
        cancelled,
        totalEarnings,
        totalCashCollected,
        avgEarnings,
        avgDuration
    };

    // 2. Set Cache (TTL 300 seconds = 5 minutes)
    await cache.setCache(cacheKey, result, 300);
    
    c.header("X-Cache", "MISS");
    return c.json(result);

  } catch (e: any) {
    console.error("Error fetching trip stats:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.post("/make-server-37f42386/trips", async (c) => {
  try {
    const trips = await c.req.json();
    if (!Array.isArray(trips)) {
      return c.json({ error: "Expected array of trips" }, 400);
    }
    
    // Validation and processing
    const processedTrips = trips.map((trip: any) => {
        if (trip.isManual) {
            // Validation for manual trips
            if (!trip.driverId) throw new Error(`Manual trip ${trip.id || 'unknown'} must have a driverId`);
            if (typeof trip.amount !== 'number') throw new Error(`Manual trip ${trip.id || 'unknown'} must have a numeric amount`);
            
            // Enforce consistency for manual entries
            return {
                ...trip,
                batchId: 'manual_entry',
                status: trip.status || 'Completed',
                // Ensure critical financial fields are present
                netPayout: trip.netPayout ?? trip.amount,
                fareBreakdown: trip.fareBreakdown || {
                    baseFare: trip.amount,
                    tips: 0,
                    waitTime: 0,
                    surge: 0,
                    airportFees: 0,
                    timeAtStop: 0,
                    taxes: 0
                }
            };
        }
        return trip;
    });
    
    // Create keys for each trip
    // Assuming each trip has a unique 'id' field
    const keys = processedTrips.map((t: any) => `trip:${t.id}`);
    
    // Store using mset
    await kv.mset(keys, processedTrips);
    
    // Invalidate stats cache since data has changed
    await cache.invalidateCacheVersion("stats");
    await cache.invalidateCacheVersion("performance");
    
    return c.json({ success: true, count: processedTrips.length });
  } catch (e: any) {
    console.error("Error saving trips:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

// Trips GET Endpoint - Optimized with native Supabase pagination
app.get("/make-server-37f42386/trips", async (c) => {
  try {
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const limit = limitParam ? parseInt(limitParam) : 50; // Default limit
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    // Direct Supabase query with range for memory efficiency
    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "trip:%")
        .order("value->>date", { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw error;
    
    // Phase 8.4: Large Data Stripping + sanitize control chars
    const trips = (data || []).map((d: any) => {
        const v = d.value || {};
        const { route, stops, ...lightweight } = v;
        const sanitized: Record<string, any> = {};
        for (const [k, val] of Object.entries(lightweight)) {
          sanitized[k] = typeof val === 'string' ? val.replace(/[\x00-\x1F\x7F]/g, ' ') : val;
        }
        return sanitized;
    });

    // Manual stringify to catch serialization errors before sending
    let jsonStr: string;
    try {
      jsonStr = JSON.stringify(trips);
    } catch (serErr: any) {
      console.error("JSON serialization error in /trips:", serErr);
      return c.json({ error: "Failed to serialize trips response" }, 500);
    }
    return new Response(jsonStr, { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("Error fetching trips:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.delete("/make-server-37f42386/trips", async (c) => {
  try {
    // Direct delete using Supabase client to avoid pagination limits and round-trips
    // This fixes the issue where only the first 1000 records were being deleted
    const prefixes = ["trip:", "batch:", "driver_metric:", "vehicle_metric:", "transaction:"];
    const counts: Record<string, number> = {};

    for (const prefix of prefixes) {
        const { count, error } = await supabase
            .from("kv_store_37f42386")
            .delete({ count: 'exact' })
            .like("key", `${prefix}%`);
            
        if (error) {
            console.error(`Error deleting prefix ${prefix}:`, error);
            throw error;
        }
        counts[prefix] = count || 0;
    }
    
    // Invalidate stats cache since data has changed
    await cache.invalidateCacheVersion("stats");
    await cache.invalidateCacheVersion("performance");
    
    return c.json({ 
        success: true, 
        deletedTrips: counts["trip:"] || 0,
        deletedBatches: counts["batch:"] || 0,
        deletedDriverMetrics: counts["driver_metric:"] || 0,
        deletedVehicleMetrics: counts["vehicle_metric:"] || 0,
        deletedTransactions: counts["transaction:"] || 0
    });
  } catch (e: any) {
    console.error("Error clearing data:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.delete("/make-server-37f42386/trips/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`trip:${id}`);
    
    // Invalidate stats cache since data has changed
    await cache.invalidateCacheVersion("stats");
    await cache.invalidateCacheVersion("performance");

    return c.json({ success: true });
  } catch (e: any) {
    console.error(`Error deleting trip ${id}:`, e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

// Driver Metrics Endpoints
app.post("/make-server-37f42386/driver-metrics", async (c) => {
  try {
    const metrics = await c.req.json();
    if (!Array.isArray(metrics)) {
      return c.json({ error: "Expected array of metrics" }, 400);
    }
    const keys = metrics.map((m: any) => `driver_metric:${m.id}`);
    await kv.mset(keys, metrics);
    return c.json({ success: true, count: metrics.length });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/make-server-37f42386/driver-metrics", async (c) => {
    try {
        const limitParam = c.req.query("limit");
        const offsetParam = c.req.query("offset");
        const limit = limitParam ? parseInt(limitParam) : 100;
        const offset = offsetParam ? parseInt(offsetParam) : 0;

        const { data, error } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "driver_metric:%")
            .range(offset, offset + limit - 1);

        if (error) throw error;
        
        const metrics = data?.map((d: any) => d.value) || [];

        // ACTION 2: The "Exorcism" (Auto-Cleanup)
        const BANNED_UUID = "73dfc14d-3798-4a00-8d86-b2a3eb632f54";
        const ghostIndex = metrics.findIndex((m: any) => (m.driverId === BANNED_UUID || m.id === BANNED_UUID));

        if (ghostIndex !== -1) {
            console.log(`[Exorcism] Deleting Ghost Driver Metric: ${BANNED_UUID}`);
            await kv.del(`driver_metric:${BANNED_UUID}`);
            metrics.splice(ghostIndex, 1);
        }

        return c.json(metrics);
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Vehicle Metrics Endpoints
app.post("/make-server-37f42386/vehicle-metrics", async (c) => {
  try {
    const metrics = await c.req.json();
    if (!Array.isArray(metrics)) {
      return c.json({ error: "Expected array of metrics" }, 400);
    }
    const keys = metrics.map((m: any) => `vehicle_metric:${m.id}`);
    await kv.mset(keys, metrics);
    return c.json({ success: true, count: metrics.length });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/make-server-37f42386/vehicle-metrics", async (c) => {
    try {
        const limitParam = c.req.query("limit");
        const offsetParam = c.req.query("offset");
        const limit = limitParam ? parseInt(limitParam) : 100;
        const offset = offsetParam ? parseInt(offsetParam) : 0;

        const { data, error } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "vehicle_metric:%")
            .range(offset, offset + limit - 1);

        if (error) throw error;
        
        const metrics = data?.map((d: any) => d.value) || [];
        return c.json(metrics);
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Vehicles Endpoints
app.get("/make-server-37f42386/vehicles", async (c) => {
  try {
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const limit = limitParam ? parseInt(limitParam) : 500;
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "vehicle:%")
        .range(offset, offset + limit - 1);

    if (error) throw error;
    
    const vehicles = data?.map((d: any) => d.value) || [];
    return c.json(vehicles);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/vehicles", async (c) => {
  try {
    const vehicle = await c.req.json();
    if (!vehicle.id) {
        return c.json({ error: "Vehicle ID (License Plate) is required" }, 400);
    }
    // Use plate as ID
    await kv.set(`vehicle:${vehicle.id}`, vehicle);
    return c.json({ success: true, data: vehicle });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/vehicles/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`vehicle:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Drivers Endpoints
app.get("/make-server-37f42386/drivers", async (c) => {
  try {
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const limit = limitParam ? parseInt(limitParam) : 500;
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "driver:%")
        .range(offset, offset + limit - 1);

    if (error) throw error;
    
    const drivers = data?.map((d: any) => d.value) || [];

    // ACTION 2: The "Exorcism" (Auto-Cleanup)
    const BANNED_UUID = "73dfc14d-3798-4a00-8d86-b2a3eb632f54";
    const ghostIndex = drivers.findIndex((d: any) => d.id === BANNED_UUID);

    if (ghostIndex !== -1) {
        console.log(`[Exorcism] Deleting Ghost Driver: ${BANNED_UUID}`);
        await kv.del(`driver:${BANNED_UUID}`);
        drivers.splice(ghostIndex, 1);
    }

    // Sanitize control chars in string fields to prevent JSON parse errors
    const sanitizedDrivers = drivers.map((d: any) => {
      if (!d || typeof d !== 'object') return d;
      const s: Record<string, any> = {};
      for (const [k, val] of Object.entries(d)) {
        s[k] = typeof val === 'string' ? val.replace(/[\x00-\x1F\x7F]/g, ' ') : val;
      }
      return s;
    });
    let jsonStr: string;
    try { jsonStr = JSON.stringify(sanitizedDrivers); } catch (serErr: any) { console.error("JSON serialization error in /drivers:", serErr); return c.json({ error: "Failed to serialize drivers" }, 500); }
    return new Response(jsonStr, { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/drivers", async (c) => {
  try {
    const body = await c.req.json();
    // Extract password to prevent saving it to KV, and use it for Auth creation
    const { password, ...driver } = body;
    
    let authUserId = null;

    // If password provided, create Supabase Auth User
    if (password && driver.email) {
         const { data, error } = await supabase.auth.admin.createUser({
            email: driver.email,
            password: password,
            user_metadata: { 
                name: driver.name || '',
                role: 'driver' 
            },
            email_confirm: true
         });

         if (error) {
             console.error("Auth Create Error:", error);
             return c.json({ error: `Failed to create user account: ${error.message}` }, 400);
         }
         authUserId = data.user.id;
    }

    // Use Auth ID if created, otherwise fallback to provided ID or random
    const finalId = authUserId || driver.id || crypto.randomUUID();
    
    const newDriver = {
        ...driver,
        id: finalId,
        driverId: driver.driverId || finalId, // Allow distinct legacy ID
    };

    await kv.set(`driver:${finalId}`, newDriver);
    return c.json({ success: true, data: newDriver });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Transactions Endpoints
// Transactions GET Endpoint - Optimized
app.get("/make-server-37f42386/transactions", async (c) => {
  try {
    const driverIdsParam = c.req.query("driverIds");
    const driverIdParam = c.req.query("driverId");
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    const idsToFilter = new Set<string>();
    if (driverIdParam) idsToFilter.add(driverIdParam);
    if (driverIdsParam) {
        driverIdsParam.split(',').forEach(id => {
            if (id.trim()) idsToFilter.add(id.trim());
        });
    }

    // When filtering by specific driver(s), use a much higher default limit
    // to avoid truncating financial data (payments, floats, tolls).
    // A driver with 905 trips can easily have 500+ transactions.
    // Unscoped (global) queries keep the conservative default of 100.
    const limit = limitParam
        ? parseInt(limitParam)
        : (idsToFilter.size > 0 ? 5000 : 100);

    let query = supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "transaction:%");

    if (idsToFilter.size > 0) {
        const orConditions = Array.from(idsToFilter)
            .map(id => `value->>driverId.eq.${id}`)
            .join(',');
        query = query.or(orConditions);
    }

    const { data, error } = await query
        .order("value->>date", { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw error;

    // Phase 8.4: Strip heavy metadata if exists
    const transactions = (data || []).map((d: any) => {
        const v = d.value || {};
        // Only strip if it looks like it contains base64 or heavy binary metadata
        if (v.metadata?.receiptBase64) {
            delete v.metadata.receiptBase64;
        }
        return v;
    });

    return c.json(transactions);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/transactions", async (c) => {
  try {
    const transaction = await c.req.json();
    if (!transaction.id) {
        transaction.id = crypto.randomUUID();
    }
    if (!transaction.timestamp) {
        transaction.timestamp = new Date().toISOString();
    }

    // Future-Date Guard: flag transactions with dates beyond today
    if (transaction.date) {
        const txDate = new Date(transaction.date);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(23, 59, 59, 999);
        if (!isNaN(txDate.getTime()) && txDate > tomorrow) {
            console.log(`[FutureDateGuard] Transaction ${transaction.id} has future date: ${transaction.date}`);
            if (!transaction.metadata) transaction.metadata = {};
            transaction.metadata._futureDateWarning = true;
            transaction.metadata._originalDate = transaction.date;
        }
    }

    // Auto-Approve Logic for AI Verified Fuel
    const isFuel = transaction.category === 'Fuel' || transaction.category === 'Fuel Reimbursement';
    const isAiVerified = transaction.metadata?.odometerMethod === 'ai_verified';

    // Hoisted for cross-block access: GPS matching populates these, fuel_entry block reads them
    let smartMatchedStation: any = null;
    let smartMatchConfidence = 'none';
    let smartMatchDistance: number = Infinity;
    let allStationsCache: any[] = [];

    if (isFuel) {
        // --- GEOLOCATION MATCHING (Smart Ambiguity-Aware — replaces dual 150m calls) ---
        const locationMetadata = transaction.metadata?.locationMetadata;
        if (locationMetadata?.lat && locationMetadata?.lng) {
            try {
                // Fetch all stations from KV (single load, reused below)
                const stationsRaw = await kv.getByPrefix("station:");
                allStationsCache = stationsRaw || [];

                // Single smart match against ALL stations at 600m with ambiguity detection
                const smartResult = findMatchingStationSmart(
                    locationMetadata.lat,
                    locationMetadata.lng,
                    allStationsCache,
                    600,
                    locationMetadata.accuracy || 0
                );

                smartMatchConfidence = smartResult.confidence;
                smartMatchDistance = smartResult.distance;

                if (smartResult.station && (smartResult.confidence === 'high' || smartResult.confidence === 'medium')) {
                    const matched = smartResult.station as any;

                    if (matched.status === 'verified') {
                        // Verified station match — full linkage
                        smartMatchedStation = matched;
                        transaction.metadata.matchedStationId = matched.id;
                        transaction.metadata.locationStatus = 'verified';
                        transaction.metadata.verificationMethod = 'gps_smart_matching';
                        transaction.metadata.matchDistance = smartResult.distance;
                        transaction.metadata.matchConfidence = smartResult.confidence;
                        console.log(`[SmartGeoMatch] Matched Verified station: "${matched.name}" (${matched.id}) at ${smartResult.distance}m [${smartResult.confidence}]`);
                    } else {
                        // Unverified station — record the suggested match for admin review,
                        // but do NOT promote the station or mark the entry as verified.
                        // Admin must manually approve stations before they become verified.
                        transaction.metadata.suggestedStationId = matched.id;
                        transaction.metadata.suggestedStationName = matched.name;
                        transaction.metadata.locationStatus = 'unverified';
                        transaction.metadata.verificationMethod = 'gps_matched_unverified_station';
                        transaction.metadata.matchDistance = smartResult.distance;
                        transaction.metadata.matchConfidence = smartResult.confidence;

                        // Update visit stats on the unverified station (for admin reference when reviewing)
                        matched.stats = {
                            ...(matched.stats || {}),
                            totalVisits: ((matched.stats?.totalVisits) || 0) + 1,
                            lastUpdated: new Date().toISOString()
                        };
                        await kv.set(`station:${matched.id}`, matched);

                        console.log(`[SmartGeoMatch] GPS matched Unverified station "${matched.name}" (${matched.id}) at ${smartResult.distance}m — NOT promoting, awaiting admin approval.`);
                    }
                } else if (smartResult.confidence === 'ambiguous') {
                    // GPS is near multiple stations — flag for management review, do NOT guess
                    transaction.metadata.locationStatus = 'review_required';
                    transaction.metadata.verificationMethod = 'gps_ambiguous';
                    transaction.metadata.ambiguityReason = smartResult.ambiguityReason;
                    transaction.metadata.matchConfidence = 'ambiguous';
                    console.log(`[SmartGeoMatch] Ambiguous match — flagged for review. ${smartResult.ambiguityReason}`);
                } else {
                    // No match at all — create Learnt Location (preserved from original)
                    transaction.metadata.locationStatus = 'unverified';

                    const learntId = crypto.randomUUID();
                    const learntLocation = {
                        id: learntId,
                        name: transaction.vendor || transaction.description || 'Unknown Station',
                        parentCompany: transaction.metadata?.parentCompany,
                        location: {
                            lat: locationMetadata.lat,
                            lng: locationMetadata.lng,
                            accuracy: locationMetadata.accuracy
                        },
                        timestamp: new Date().toISOString(),
                        transactionId: transaction.id,
                        status: 'learnt'
                    };
                    await kv.set(`learnt_location:${learntId}`, learntLocation);
                    console.log(`[SmartGeoMatch] No station match — created Learnt Location: ${learntId}`);
                }
            } catch (err) {
                console.error("Geolocation Smart Matching Error:", err);
            }
        }

        // Manual Station Pick: If the form pre-selected a verified station (no GPS needed),
        // set locationStatus so the blue shield badge appears in FuelLogTable.
        if (!transaction.metadata?.locationStatus && (transaction.matchedStationId || transaction.metadata?.matchedStationId)) {
            if (!transaction.metadata) transaction.metadata = {};
            transaction.metadata.locationStatus = 'verified';
            transaction.metadata.verificationMethod = 'manual_station_picker';
            transaction.metadata.matchedStationId = transaction.matchedStationId || transaction.metadata.matchedStationId;
            console.log(`[ManualStationPick] Verified station linked via form picker: ${transaction.metadata.matchedStationId}`);
        }

        // --- CUMULATIVE LITERS & INTEGRITY LOGIC (Phase 1 & 2) ---
        const vehicleId = transaction.vehicleId;
        const volume = Number(transaction.quantity) || Number(transaction.metadata?.fuelVolume) || 0;
        
        if (vehicleId) {
            // Fetch vehicle for tank capacity
            const vehicle = await kv.get(`vehicle:${vehicleId}`);
            const tankCapacity = Number(vehicle?.specifications?.tankCapacity) || Number(vehicle?.fuelSettings?.tankCapacity) || 0;

            // Fetch last transactions to calculate cumulative
            const { data: lastTxData } = await supabase
                .from("kv_store_37f42386")
                .select("value")
                .like("key", "transaction:%")
                .eq("value->>vehicleId", vehicleId)
                .order("value->>date", { ascending: false })
                .limit(10);
            
            const lastTransactions = (lastTxData || []).map((d: any) => d.value);
            
            // Find the last "Anchor" (Full Tank or Soft Anchor)
            let cumulative = volume;
            let lastAnchorOdo = 0;
            let lastAnchorTx = null;
            
            for (const tx of lastTransactions) {
                // Check for various anchor types
                if (tx.metadata?.isFullTank || tx.metadata?.isAnchor || tx.metadata?.isSoftAnchor) {
                    lastAnchorOdo = Number(tx.odometer) || 0;
                    lastAnchorTx = tx;
                    break;
                }
                cumulative += (Number(tx.quantity) || Number(tx.metadata?.fuelVolume) || 0);
            }

            // Calculate distance since last anchor
            const currentOdo = Number(transaction.odometer) || 0;
            const distanceSinceAnchor = (currentOdo > 0 && lastAnchorOdo > 0) ? (currentOdo - lastAnchorOdo) : 0;

            transaction.metadata = {
                ...transaction.metadata,
                cumulativeLitersAtEntry: Number(cumulative.toFixed(2)),
                tankCapacityAtEntry: tankCapacity,
                distanceSinceAnchor: distanceSinceAnchor,
                integrityStatus: 'valid'
            };

            // Rule 1: Tank Overflow (Physical Impossibility Check)
            // We only flag this if a SINGLE transaction exceeds the tank capacity + buffer.
            // Previously, this checked cumulative volume, which was incorrect as it flagged legitimate
            // multiple partial fills as an overflow.
            const singleTxOverflow = (Number(transaction.quantity) || 0) > (tankCapacity * 1.10);
            
            if (tankCapacity > 0 && singleTxOverflow) {
                transaction.metadata.integrityStatus = 'critical';
                transaction.metadata.anomalyReason = 'Tank Overflow: Single transaction exceeds tank capacity';
            }

            // Step 2.3: Rule 2 - Soft Anchor Reset (Auto-Close Cycle)
            // If cumulative volume exceeds 85% of tank capacity, we assume the tank has been filled
            // (or enough fuel has been added to constitute a cycle). We "close" the cycle here.
            // This prevents "infinite cumulative volume" and false "0 km" calculations.
            const isCumulativeFull = tankCapacity > 0 && cumulative > (tankCapacity * 0.85);
            
            if (!transaction.metadata?.isFullTank && isCumulativeFull) {
                transaction.metadata.isSoftAnchor = true;
                transaction.metadata.isAnchor = true; // Unified flag for logic
                
                // If it was valid before, keep it valid. It's just an auto-reset.
                // We do NOT downgrade to 'warning' just because we auto-detected a full tank.
                if (transaction.metadata.integrityStatus === 'valid') {
                     transaction.metadata.softAnchorNote = 'Cycle Reset: Cumulative volume reached tank capacity.';
                } else {
                     // If it was already a warning (e.g. slight mismatch), keep it but add note
                     transaction.metadata.softAnchorNote = 'Cycle Reset: Cumulative volume reached tank capacity.';
                }
            } else if (transaction.metadata?.isFullTank) {
                transaction.metadata.isAnchor = true;
            }

            // --- Phase 3: Fuel Economy & Velocity Algorithms ---
            
            // Step 3.1: Real-time Economy Calculation (L/100km)
            // We only calculate this when we hit an anchor (Full Tank or Soft Anchor) 
            // because we need a complete window to be accurate.
            if (transaction.metadata.isAnchor && distanceSinceAnchor > 0) {
                const consumption = (cumulative / distanceSinceAnchor) * 100;
                transaction.metadata.calculatedEconomy = Number(consumption.toFixed(2));
                
                // Compare against baseline (Toyota Roomy ~6.5L/100km)
                const baseline = Number(vehicle?.fuelSettings?.efficiencyCity) || 6.5; 
                if (consumption > (baseline * 1.25)) {
                    transaction.metadata.integrityStatus = 'warning';
                    transaction.metadata.anomalyReason = (transaction.metadata.anomalyReason || '') + ' High Fuel Consumption Detected;';
                }
            }

            // Step 3.3: Fragmented Purchase Detection
            // Flag small purchases (< 5L) which are often used to mask larger theft
            if (volume > 0 && volume < 5) {
                transaction.metadata.integrityStatus = transaction.metadata.integrityStatus === 'valid' ? 'warning' : transaction.metadata.integrityStatus;
                transaction.metadata.anomalyReason = (transaction.metadata.anomalyReason || '') + ' Fragmented Purchase (<5L);';
            }

            // Check for high frequency (more than 2 entries in 24h)
            const entriesLast24h = lastTransactions.filter(tx => {
                const txDate = new Date(tx.date);
                const now = new Date();
                return (now.getTime() - txDate.getTime()) < (24 * 60 * 60 * 1000);
            }).length;

            if (entriesLast24h >= 2) {
                transaction.metadata.integrityStatus = transaction.metadata.integrityStatus === 'valid' ? 'warning' : transaction.metadata.integrityStatus;
                transaction.metadata.anomalyReason = (transaction.metadata.anomalyReason || '') + ' High Transaction Frequency;';
            }

            // Step 3.2: Fuel Velocity Check ($ spend per km)
            // Look at total spend vs distance over the last 10 entries
            if (lastTransactions.length >= 3) {
                const totalSpendInWindow = lastTransactions.reduce((sum, tx) => sum + Math.abs(Number(tx.amount) || 0), Math.abs(Number(transaction.amount) || 0));
                const minOdo = Math.min(...lastTransactions.map(tx => Number(tx.odometer)).filter(o => o > 0));
                const totalDistInWindow = (currentOdo > 0 && minOdo > 0) ? (currentOdo - minOdo) : 0;
                
                if (totalDistInWindow > 50) { // Only calculate if we have significant distance
                    const velocity = totalSpendInWindow / totalDistInWindow;
                    transaction.metadata.fuelVelocity = Number(velocity.toFixed(3));
                    
                    // Flag if spend rate is > $0.25/km (approx based on typical fleet benchmarks)
                    if (velocity > 0.25) {
                        transaction.metadata.integrityStatus = transaction.metadata.integrityStatus === 'valid' ? 'warning' : transaction.metadata.integrityStatus;
                        transaction.metadata.anomalyReason = (transaction.metadata.anomalyReason || '') + ' High Fuel Velocity ($/km);';
                    }
                }
            }
        }
    }

    if (isFuel && transaction.status === 'Pending') {
        // STATION VERIFICATION GATE: ALL fuel logs must pass station verification.
        // If the station is not verified, hold the transaction for admin review
        // via Learnt Locations tab — regardless of odometer method (AI or manual).
        const locationStatus = transaction.metadata?.locationStatus;
        if (locationStatus !== 'verified') {
            transaction.status = 'Pending';
            transaction.metadata = {
                ...transaction.metadata,
                stationGateHold: true,
                holdReason: 'Unverified station — awaiting admin review from Learnt Locations',
                holdTimestamp: new Date().toISOString(),
            };
            console.log(`[StationGate] Transaction ${transaction.id} held — station locationStatus="${locationStatus || 'none'}", skipping auto-approval and fuel entry creation.`);
            await kv.set(`transaction:${transaction.id}`, transaction);
            return c.json({ success: true, transaction, held: true, reason: 'station_unverified' });
        }

        // Station is verified — but only auto-approve + create fuel entry if AI-verified.
        // Manual/non-AI entries with a verified station pass the gate but stay Pending for admin.
        if (!isAiVerified) {
            console.log(`[StationGate] Transaction ${transaction.id} passed station gate (verified) but odometerMethod="${transaction.metadata?.odometerMethod || 'none'}" — staying Pending for admin review.`);
            await kv.set(`transaction:${transaction.id}`, transaction);
            return c.json({ success: true, data: transaction });
        }

        transaction.status = 'Approved';
        transaction.isReconciled = true;
        transaction.metadata = {
            ...transaction.metadata,
            approvedAt: new Date().toISOString(),
            approvalReason: 'Auto-approved via AI Odometer Scan',
            notes: (transaction.metadata?.notes || '') + ' [AI Verified]'
        };

        // Create Fuel Entry Anchor
        // Fix: Extract volume from metadata.fuelVolume if top-level quantity is missing
        const quantity = Number(transaction.quantity) || Number(transaction.metadata?.fuelVolume) || 0;
        const amount = Math.abs(Number(transaction.amount) || 0);
        const pricePerLiter = transaction.metadata?.pricePerLiter || (quantity > 0 ? Number((amount / quantity).toFixed(3)) : 0);
        
        // Ensure quantity is saved to transaction for consistent display
        if (!transaction.quantity && quantity > 0) {
            transaction.quantity = quantity;
        }

        // Resolve vendor name: smart-matched station > transaction vendor > description > fallback
        const resolvedVendor = smartMatchedStation?.name || transaction.vendor || transaction.description || 'Reimbursement';

        const fuelEntry: any = {
            id: crypto.randomUUID(),
            date: (transaction.date && transaction.time) 
                ? `${transaction.date}T${transaction.time}` 
                : (transaction.date || new Date().toISOString().split('T')[0]),
            type: 'Reimbursement',
            amount: amount,
            liters: quantity,
            pricePerLiter: pricePerLiter,
            odometer: Number(transaction.odometer) || 0,
            vendor: resolvedVendor,
            location: resolvedVendor,
            stationAddress: transaction.metadata?.stationLocation || '',
            vehicleId: transaction.vehicleId,
            driverId: transaction.driverId,
            cardId: undefined,
            transactionId: transaction.id,
            receiptUrl: transaction.receiptUrl || transaction.metadata?.receiptUrl,
            odometerProofUrl: transaction.odometerProofUrl || transaction.metadata?.odometerProofUrl,
            isVerified: true, // Key Requirement: Anchor
            source: 'Fuel Log',
            matchedStationId: transaction.metadata?.matchedStationId,
            metadata: {
                receiptUrl: transaction.receiptUrl || transaction.metadata?.receiptUrl,
                odometerProofUrl: transaction.odometerProofUrl || transaction.metadata?.odometerProofUrl,
                originalTransactionId: transaction.id,
                locationMetadata: transaction.metadata?.locationMetadata,
                parentCompany: transaction.metadata?.parentCompany,
                // Bug fixes: locationStatus + matchedStationId INSIDE metadata (where FuelLogTable reads them)
                locationStatus: transaction.metadata?.locationStatus || 'unknown',
                matchedStationId: transaction.metadata?.matchedStationId,
                verificationMethod: transaction.metadata?.verificationMethod,
                matchDistance: transaction.metadata?.matchDistance,
                matchConfidence: transaction.metadata?.matchConfidence
            }
        };

        // Calculate Audit Confidence Score (matching fuel_controller.tsx gold-standard pattern)
        if (smartMatchedStation && fuelEntry.matchedStationId) {
            const confidence = fuelLogic.calculateConfidenceScore(fuelEntry, smartMatchedStation);
            fuelEntry.metadata = {
                ...fuelEntry.metadata,
                auditConfidenceScore: confidence.score,
                auditConfidenceBreakdown: confidence.breakdown,
                isHighlyTrusted: confidence.isHighlyTrusted
            };
            console.log(`[FuelEntry] Audit confidence for ${fuelEntry.id}: ${confidence.score}/100`);
        }

        if (fuelEntry.vehicleId) {
             await kv.set(`fuel_entry:${fuelEntry.id}`, fuelEntry);
        }
    }

    await kv.set(`transaction:${transaction.id}`, transaction);
    return c.json({ success: true, data: transaction });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/transactions/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`transaction:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Claims Endpoints
app.get("/make-server-37f42386/claims", async (c) => {
  try {
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const limit = limitParam ? parseInt(limitParam) : 100;
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "claim:%")
        .range(offset, offset + limit - 1);

    if (error) throw error;
    
    const claims = data?.map((d: any) => d.value) || [];
    return c.json(claims);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/claims", async (c) => {
  try {
    const claim = await c.req.json();
    if (!claim.id) {
        claim.id = crypto.randomUUID();
    }
    await kv.set(`claim:${claim.id}`, claim);
    return c.json({ success: true, data: claim });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/claims/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`claim:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Expense Management Endpoints (Phase 5)
app.post("/make-server-37f42386/scan-receipt", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    
    if (!file || !(file instanceof File)) {
        return c.json({ error: "File upload required" }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return c.json({ error: "OpenAI API Key not configured" }, 503);

    const openai = new OpenAI({ apiKey });

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = `data:${file.type};base64,${base64Data}`;

    const prompt = `
      You are an OCR assistant for a driver expense portal. 
      Parse the receipt or invoice image. It might be a general receipt, fuel receipt, or toll receipt.
      This is from Jamaica. Jamaica EXCLUSIVELY uses DD/MM/YYYY date format. NEVER interpret dates as MM/DD/YYYY.
      
      Current Date Context: ${new Date().toISOString().split('T')[0]}
      
      Return a valid JSON object with these EXACT fields:
      - type (string): "Fuel", "Toll", "Maintenance", or "Other"
      - merchant (string): Name of the merchant or agency (e.g. "Highway 2000", "Total Gas")
      - amount (number): Total amount paid (number only)
      - date (string): Date in YYYY-MM-DD format. The receipt uses DD/MM/YYYY. The FIRST number is ALWAYS the day, the SECOND is ALWAYS the month. Example: "01/12/2025" on the receipt = 1st December 2025 = output "2025-12-01". NEVER swap day and month.
      - time (string): Time in HH:MM format (24h)
      - receiptNumber (string): Invoice, ticket, or reference number
      - plaza (string): Plaza name (for tolls)
      - lane (string): Lane number (for tolls)
      - vehicleClass (string): Vehicle class (for tolls)
      - collector (string): Collector name/ID
      - notes (string): Brief description
      
      If specific fields are missing, return null. 
      Output only valid JSON. Do not use markdown code blocks.
    `;

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: dataUrl } }
                ]
            }
        ],
        response_format: { type: "json_object" }
    });

    const text = response.choices[0].message.content || "{}";
    const data = JSON.parse(text);

    // Post-processing: catch and correct any future dates the AI missed
    const [corrected] = correctFutureDates([data]);
    return c.json({ success: true, data: corrected });

  } catch (e: any) {
    console.error("Scan Receipt Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/scan-odometer", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    
    if (!file || !(file instanceof File)) {
        return c.json({ error: "File upload required" }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return c.json({ error: "OpenAI API Key not configured" }, 503);

    const openai = new OpenAI({ apiKey });

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = `data:${file.type};base64,${base64Data}`;

    const prompt = `
      You are an AI assistant for a vehicle fleet.
      Analyze this image of a vehicle dashboard to find the Odometer reading.
      Return a valid JSON object with these fields:
      - reading (number | null): The odometer value (e.g. 15043). Do not include decimals unless it is clearly part of the main odometer. Ignore trip meters (which are usually smaller or resetable).
      - unit (string): "km" or "mi" if visible, otherwise default to "km"
      - confidence (string): "high", "medium", or "low"

      If you cannot clearly see an odometer, set reading to null.
      Output only valid JSON.
    `;

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: dataUrl } }
                ]
            }
        ],
        response_format: { type: "json_object" }
    });

    const text = response.choices[0].message.content || "{}";
    const data = JSON.parse(text);

    return c.json({ success: true, data });

  } catch (e: any) {
    console.error("Scan Odometer Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/expenses/approve", async (c) => {
  try {
    const { id, notes } = await c.req.json();
    if (!id) return c.json({ error: "Transaction ID is required" }, 400);

    const tx = await kv.get(`transaction:${id}`);
    if (!tx) return c.json({ error: "Transaction not found" }, 404);

    tx.status = 'Approved';
    tx.isReconciled = true; // Approval implies reconciliation usually
    tx.metadata = { 
        ...tx.metadata, 
        approvedAt: new Date().toISOString(), 
        notes: notes || tx.metadata?.notes 
    };

    // Auto-create Fuel Entry for approved Fuel Reimbursements
    if ((tx.category === 'Fuel' || tx.category === 'Fuel Reimbursement') && tx.status === 'Approved') {
        // Calculate price per liter if quantity is available
        const quantity = Number(tx.quantity) || 0;
        const amount = Math.abs(Number(tx.amount) || Number(tx.metadata?.totalCost) || 0);
        const pricePerLiter = Number(tx.metadata?.pricePerLiter) || (quantity > 0 ? Number((amount / quantity).toFixed(3)) : 0);
        
        const fuelEntry = {
            id: crypto.randomUUID(),
            date: (tx.date && tx.time) ? `${tx.date}T${tx.time}` : (tx.date || new Date().toISOString().split('T')[0]),
            type: 'Reimbursement', // Using internal type even if UI doesn't show it
            amount: amount,
            liters: quantity,
            pricePerLiter: pricePerLiter,
            odometer: Number(tx.odometer) || 0,
            location: tx.vendor || tx.merchant || tx.description || 'Reimbursement',
            vendor: tx.vendor || tx.merchant || tx.description || 'Reimbursement',
            stationAddress: tx.metadata?.stationLocation || tx.location || '',
            vehicleId: tx.vehicleId, // Must be present to link to vehicle stats
            driverId: tx.driverId,
            cardId: undefined, // Not a card transaction
            transactionId: tx.id, // Link back to original transaction
            matchedStationId: tx.matchedStationId || tx.metadata?.matchedStationId,
            receiptUrl: tx.receiptUrl || tx.metadata?.receiptUrl,
            odometerProofUrl: tx.odometerProofUrl || tx.metadata?.odometerProofUrl,
            isVerified: true, // Matches auto-approve path (line 1974)
            source: 'Manual Approval', // Distinguishes from auto-approve 'Fuel Log'
            metadata: {
                ...tx.metadata,
                portal_type: tx.metadata?.portal_type || 'Manual_Entry',
                isManual: tx.metadata?.isManual ?? (tx.paymentMethod === 'Cash' || tx.metadata?.portal_type === 'Manual_Entry'),
                sourceId: tx.id,
                source: tx.metadata?.source || 'Manual Approval',
                receiptUrl: tx.receiptUrl || tx.metadata?.receiptUrl,
                odometerProofUrl: tx.odometerProofUrl || tx.metadata?.odometerProofUrl,
                locationStatus: tx.metadata?.locationStatus || ((tx.matchedStationId || tx.metadata?.matchedStationId) ? 'verified' : 'unknown'),
                matchedStationId: tx.matchedStationId || tx.metadata?.matchedStationId,
                verificationMethod: tx.metadata?.verificationMethod || ((tx.matchedStationId || tx.metadata?.matchedStationId) ? 'manual_station_picker' : undefined),
            }
        };

        // Calculate Audit Confidence Score (matching auto-approve gold-standard pattern)
        const resolvedStationId = fuelEntry.matchedStationId;
        let matchedStation = null;
        if (resolvedStationId) {
            matchedStation = await kv.get(`station:${resolvedStationId}`);
        }

        if (matchedStation && fuelEntry.matchedStationId) {
            const confidence = fuelLogic.calculateConfidenceScore(fuelEntry, matchedStation);
            fuelEntry.metadata = {
                ...fuelEntry.metadata,
                auditConfidenceScore: confidence.score,
                auditConfidenceBreakdown: confidence.breakdown,
                isHighlyTrusted: confidence.isHighlyTrusted
            };
            console.log(`[ApproveHandler] Audit confidence for ${fuelEntry.id}: ${confidence.score}/100`);
        } else {
            // No matched station — still calculate base confidence (behavioral + physical only)
            const confidence = fuelLogic.calculateConfidenceScore(fuelEntry, null);
            fuelEntry.metadata = {
                ...fuelEntry.metadata,
                auditConfidenceScore: confidence.score,
                auditConfidenceBreakdown: confidence.breakdown,
                isHighlyTrusted: confidence.isHighlyTrusted
            };
            console.log(`[ApproveHandler] Audit confidence (no station) for ${fuelEntry.id}: ${confidence.score}/100`);
        }

        // Only save if we have a vehicleId (Critical for fleet stats)
        if (fuelEntry.vehicleId) {
             await kv.set(`fuel_entry:${fuelEntry.id}`, fuelEntry);
             
             // Check if we need to link this to a transaction
             if (tx.id) {
                // Ensure the transaction also has the URLs updated if they were missing
                tx.receiptUrl = tx.receiptUrl || tx.metadata?.receiptUrl;
                tx.metadata = {
                    ...tx.metadata,
                    receiptUrl: tx.receiptUrl,
                    odometerProofUrl: tx.odometerProofUrl || tx.metadata?.odometerProofUrl
                };
             }
        }
    }

    // Phase 4: Auto-create Cash Wallet credit for approved fuel reimbursements
    const paymentSource = tx.metadata?.paymentSource || 'driver_cash'; // default to driver_cash for legacy entries
    const isDriverCash = paymentSource === 'driver_cash';

    if (!isDriverCash) {
        console.log(`[FuelCredit] Skipping wallet credit: payment source is '${paymentSource}' (not driver_cash) for transaction ${id}`);
    }

    if ((tx.category === 'Fuel' || tx.category === 'Fuel Reimbursement') && tx.status === 'Approved' && isDriverCash) {
        if (!tx.driverId) {
            console.log('[FuelCredit] Skipping wallet credit: no driverId on transaction ' + id);
        } else {
            const creditId = `fuel-credit-${id}`;
            const existingCredit = await kv.get(`transaction:${creditId}`);

            if (!existingCredit) {
                const walletCredit = {
                    id: creditId,
                    driverId: tx.driverId,
                    driverName: tx.driverName || '',
                    vehicleId: tx.vehicleId,
                    date: new Date().toISOString().split('T')[0],
                    time: new Date().toISOString().split('T')[1].substring(0, 8),
                    type: 'Payment_Received',
                    category: 'Fuel Reimbursement Credit',
                    description: `Fuel Reimbursement Credit: ${tx.vendor || tx.description || tx.merchant || 'Fuel Purchase'}`,
                    amount: Math.abs(Number(tx.amount) || Number(tx.metadata?.totalCost) || 0),
                    paymentMethod: 'Cash',
                    status: 'Completed',
                    isReconciled: true,
                    referenceNumber: tx.id,
                    metadata: {
                        fuelCreditSourceId: tx.id,
                        source: 'fuel_reimbursement_approval',
                        automated: true,
                        approvedAt: new Date().toISOString(),
                        originalAmount: tx.amount,
                        originalCategory: tx.category
                    }
                };

                await kv.set(`transaction:${creditId}`, walletCredit);
                console.log(`[FuelCredit] Created wallet credit ${creditId} for driver ${tx.driverId}, amount: ${walletCredit.amount}`);
            } else {
                console.log(`[FuelCredit] Wallet credit already exists for ${id}, skipping (idempotent)`);
            }
        }
    }

    // Phase 4b: Auto-create Cash Wallet credit for approved Toll reimbursements (Manual Resolve: WriteOff/Business)
    const isTollCategory = tx.category === 'Toll Usage' || tx.category === 'Tolls';
    const isTollCash = tx.paymentMethod === 'Cash' || !!tx.receiptUrl;

    if (isTollCategory && tx.status === 'Approved' && isTollCash) {
        if (!tx.driverId || tx.driverId === 'fleet') {
            console.log(`[TollCredit] Skipping wallet credit: driverId is '${tx.driverId}' (fleet-absorbed, no driver to credit) for transaction ${id}`);
        } else {
            const tollCreditId = `toll-credit-${id}`;
            const existingTollCredit = await kv.get(`transaction:${tollCreditId}`);

            if (!existingTollCredit) {
                const tollWalletCredit = {
                    id: tollCreditId,
                    driverId: tx.driverId,
                    driverName: tx.driverName || '',
                    vehicleId: tx.vehicleId,
                    date: new Date().toISOString().split('T')[0],
                    time: new Date().toISOString().split('T')[1].substring(0, 8),
                    type: 'Payment_Received',
                    category: 'Toll Reimbursement Credit',
                    description: `Toll Reimbursement Credit: ${tx.description || tx.vendor || tx.merchant || 'Toll Charge'}`,
                    amount: Math.abs(Number(tx.amount) || 0),
                    paymentMethod: 'Cash',
                    status: 'Completed',
                    isReconciled: true,
                    referenceNumber: tx.id,
                    metadata: {
                        tollCreditSourceId: tx.id,
                        source: 'toll_reimbursement_approval',
                        automated: true,
                        approvedAt: new Date().toISOString(),
                        originalAmount: tx.amount,
                        originalCategory: tx.category,
                        resolutionNotes: tx.metadata?.notes
                    }
                };

                await kv.set(`transaction:${tollCreditId}`, tollWalletCredit);
                console.log(`[TollCredit] Created wallet credit ${tollCreditId} for driver ${tx.driverId}, amount: ${tollWalletCredit.amount}`);
            } else {
                console.log(`[TollCredit] Wallet credit already exists for ${id}, skipping (idempotent)`);
            }
        }
    }

    await kv.set(`transaction:${id}`, tx);
    return c.json({ success: true, data: tx });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/expenses/reject", async (c) => {
  try {
    const { id, reason } = await c.req.json();
    if (!id) return c.json({ error: "Transaction ID is required" }, 400);

    const tx = await kv.get(`transaction:${id}`);
    if (!tx) return c.json({ error: "Transaction not found" }, 404);

    tx.status = 'Rejected';
    tx.metadata = { 
        ...tx.metadata, 
        rejectedAt: new Date().toISOString(), 
        rejectionReason: reason 
    };

    await kv.set(`transaction:${id}`, tx);

    // Clean up wallet credit if this was previously approved (fuel or toll)
    const fuelCreditKey = `transaction:fuel-credit-${id}`;
    const existingFuelCredit = await kv.get(fuelCreditKey);
    if (existingFuelCredit) {
        await kv.del(fuelCreditKey);
        console.log(`[FuelCredit] Removed wallet credit for rejected reimbursement: ${id}`);
    }

    const tollCreditKey = `transaction:toll-credit-${id}`;
    const existingTollCredit = await kv.get(tollCreditKey);
    if (existingTollCredit) {
        await kv.del(tollCreditKey);
        console.log(`[TollCredit] Removed wallet credit for rejected toll: ${id}`);
    }

    return c.json({ success: true, data: tx });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Phase 9: Backfill wallet credits for existing approved fuel reimbursements
app.post("/make-server-37f42386/fuel/backfill-wallet-credits", async (c) => {
  try {
    console.log('[FuelCredit Backfill] Starting backfill of historical approved fuel reimbursements...');

    // Fetch all transactions
    const allTransactions = await kv.getByPrefix('transaction:');
    
    // Filter for approved fuel reimbursements that are NOT already wallet credits themselves
    const approvedFuelReimbursements = allTransactions.filter((tx: any) =>
      tx &&
      tx.id &&
      (tx.category === 'Fuel' || tx.category === 'Fuel Reimbursement') &&
      tx.category !== 'Fuel Reimbursement Credit' &&
      tx.status === 'Approved' &&
      tx.driverId
    );

    console.log(`[FuelCredit Backfill] Found ${approvedFuelReimbursements.length} approved fuel reimbursements with driverId`);

    let created = 0;
    let skipped = 0;

    for (const tx of approvedFuelReimbursements) {
      // Phase 5 parity: Skip wallet credits for Gas Card/Petty Cash entries (matching approve handler guard)
      const paymentSource = tx.metadata?.paymentSource || 'driver_cash';
      if (paymentSource !== 'driver_cash') {
        console.log(`[FuelCredit Backfill] Skipping ${tx.id}: payment source is '${paymentSource}' (not driver_cash)`);
        skipped++;
        continue;
      }

      const creditId = `fuel-credit-${tx.id}`;
      const existingCredit = await kv.get(`transaction:${creditId}`);

      if (existingCredit) {
        skipped++;
        continue;
      }

      const walletCredit = {
        id: creditId,
        driverId: tx.driverId,
        driverName: tx.driverName || '',
        vehicleId: tx.vehicleId,
        date: tx.metadata?.approvedAt ? tx.metadata.approvedAt.split('T')[0] : (tx.date || new Date().toISOString().split('T')[0]),
        time: tx.metadata?.approvedAt ? tx.metadata.approvedAt.split('T')[1]?.substring(0, 8) || '00:00:00' : (tx.time || '00:00:00'),
        type: 'Payment_Received',
        category: 'Fuel Reimbursement Credit',
        description: `Fuel Reimbursement Credit: ${tx.vendor || tx.description || tx.merchant || 'Fuel Purchase'}`,
        amount: Math.abs(Number(tx.amount) || Number(tx.metadata?.totalCost) || 0),
        paymentMethod: 'Cash',
        status: 'Completed',
        isReconciled: true,
        referenceNumber: tx.id,
        metadata: {
          fuelCreditSourceId: tx.id,
          source: 'fuel_reimbursement_backfill',
          automated: true,
          approvedAt: tx.metadata?.approvedAt || new Date().toISOString(),
          originalAmount: tx.amount,
          originalCategory: tx.category
        }
      };

      await kv.set(`transaction:${creditId}`, walletCredit);
      console.log(`[FuelCredit Backfill] Created wallet credit ${creditId} for driver ${tx.driverId}, amount: ${walletCredit.amount}`);
      created++;
    }

    console.log(`[FuelCredit Backfill] Complete. Created: ${created}, Skipped (already exist): ${skipped}`);
    return c.json({ success: true, created, skipped, total: approvedFuelReimbursements.length });
  } catch (e: any) {
    console.log(`[FuelCredit Backfill] Error: ${e.message}`);
    return c.json({ error: `Backfill failed: ${e.message}` }, 500);
  }
});

// Phase C: Backfill paymentSource for RideShare Cash entries and remove orphaned wallet credits
app.post("/make-server-37f42386/fuel/backfill-rideshare-payment-source", async (c) => {
  try {
    console.log('[Backfill RideShare] Starting paymentSource backfill scan...');

    const allTransactions = await kv.getByPrefix('transaction:');

    // Find approved fuel transactions that should be rideshare_cash (match 'Cash' or 'RideShare Cash')
    const targets = allTransactions.filter((tx: any) =>
      tx &&
      tx.id &&
      (tx.category === 'Fuel' || tx.category === 'Fuel Reimbursement') &&
      tx.category !== 'Fuel Reimbursement Credit' &&
      tx.status === 'Approved' &&
      (tx.paymentMethod === 'Cash' || tx.paymentMethod === 'RideShare Cash') &&
      tx.metadata?.paymentSource !== 'rideshare_cash'
    );

    console.log(`[Backfill RideShare] Found ${targets.length} entries to fix`);

    let fixed = 0;
    let creditsDeleted = 0;
    const errors: string[] = [];

    for (const tx of targets) {
      try {
        // Step 1: Fix paymentMethod and set metadata.paymentSource = 'rideshare_cash'
        tx.paymentMethod = 'RideShare Cash';
        tx.metadata = {
          ...(tx.metadata || {}),
          paymentSource: 'rideshare_cash',
          backfilledAt: new Date().toISOString(),
          backfillReason: 'rideshare_cash_fix'
        };
        await kv.set(`transaction:${tx.id}`, tx);

        // Step 2: Delete orphaned fuel-credit if it exists
        const creditKey = `transaction:fuel-credit-${tx.id}`;
        const existingCredit = await kv.get(creditKey);
        if (existingCredit) {
          await kv.del(creditKey);
          creditsDeleted++;
          console.log(`[Backfill RideShare] Deleted orphaned credit fuel-credit-${tx.id}`);
        }

        fixed++;
        console.log(`[Backfill RideShare] Fixed transaction ${tx.id}: set paymentSource=rideshare_cash, credit deleted=${!!existingCredit}`);
      } catch (entryErr: any) {
        const msg = `Error fixing ${tx.id}: ${entryErr.message}`;
        console.log(`[Backfill RideShare] ${msg}`);
        errors.push(msg);
      }
    }

    console.log(`[Backfill RideShare] Complete. Fixed: ${fixed}, Credits deleted: ${creditsDeleted}, Errors: ${errors.length}`);
    return c.json({ success: true, fixed, creditsDeleted, errors, totalScanned: allTransactions.length, totalTargeted: targets.length });
  } catch (e: any) {
    console.log(`[Backfill RideShare] Fatal error: ${e.message}`);
    return c.json({ error: `Backfill failed: ${e.message}` }, 500);
  }
});

// Maintenance Logs Endpoints
app.get("/make-server-37f42386/maintenance-logs", async (c) => {
  try {
    const { data: logsData } = await supabase
      .from("kv_store_37f42386")
      .select("value")
      .like("key", "maintenance-log:%");
    
    const logs = (logsData || []).map(d => d.value);
    return c.json(logs);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/make-server-37f42386/maintenance-logs/:vehicleId", async (c) => {
  try {
    const vehicleId = c.req.param("vehicleId");
    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", `maintenance_log:${vehicleId}:`)
        .order("value->>date", { ascending: false });

    if (error) throw error;
    const logs = data?.map((d: any) => d.value) || [];
    return c.json(logs);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/maintenance-logs", async (c) => {
  try {
    const log = await c.req.json();
    if (!log.id) {
        log.id = crypto.randomUUID();
    }
    if (!log.vehicleId) {
        return c.json({ error: "Vehicle ID is required" }, 400);
    }
    
    // Key structure: maintenance_log:{vehicleId}:{logId}
    await kv.set(`maintenance_log:${log.vehicleId}:${log.id}`, log);
    return c.json({ success: true, data: log });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- FUEL SCENARIOS ---
app.get("/make-server-37f42386/scenarios", async (c) => {
  try {
    const items = await kv.getByPrefix("fuel_scenario:");
    
    // Auto-Seed if empty (Phase 10 Requirement)
    if (!items || items.length === 0) {
        const defaultId = crypto.randomUUID();
        const defaultScenario = {
            id: defaultId,
            name: "Standard Fleet Rule (Auto-Generated)",
            description: "Default granular coverage settings.",
            isDefault: true,
            rules: [{
                id: crypto.randomUUID(),
                category: "Fuel",
                coverageType: "Percentage",
                coverageValue: 50, // Fallback
                rideShareCoverage: 100,
                companyUsageCoverage: 100,
                personalCoverage: 0,
                miscCoverage: 50,
                conditions: { requiresReceipt: true }
            }]
        };
        await kv.set(`fuel_scenario:${defaultId}`, defaultScenario);
        return c.json([defaultScenario]);
    }
    
    return c.json(items || []);
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.post("/make-server-37f42386/scenarios", async (c) => {
  try {
    const item = await c.req.json();
    if (!item.id) item.id = crypto.randomUUID();
    await kv.set(`fuel_scenario:${item.id}`, item);
    return c.json({ success: true, data: item });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.delete("/make-server-37f42386/scenarios/:id", async (c) => {
  const id = c.req.param("id");
  try { await kv.del(`fuel_scenario:${id}`); return c.json({ success: true }); }
  catch (e: any) { return c.json({ error: e.message }, 500); }
});

// Storage Upload Endpoint
app.post("/make-server-37f42386/upload", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    
    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file uploaded" }, 400);
    }

    // Server-side size check with clear error message
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_FILE_SIZE) {
      console.log(`Upload rejected: file "${file.name}" is ${(file.size / 1024 / 1024).toFixed(2)}MB, exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
      return c.json({ 
        error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed size is 5MB. Please compress or resize the image before uploading.` 
      }, 413);
    }

    const bucketName = "make-37f42386-docs";
    
    // Ensure bucket exists and has adequate file size limit
    const { data: buckets } = await supabase.storage.listBuckets();
    const existingBucket = buckets?.find(b => b.name === bucketName);
    if (!existingBucket) {
        await supabase.storage.createBucket(bucketName, {
            public: false,
            fileSizeLimit: 10485760, // 10MB
        });
    } else {
        // Update existing bucket to increase file size limit if it was too low
        await supabase.storage.updateBucket(bucketName, {
            fileSizeLimit: 10485760, // 10MB
        });
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `driver-docs/${fileName}`;

    const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
            contentType: file.type,
            upsert: false
        });

    if (error) throw error;

    const { data: signedData } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 year

    return c.json({ url: signedData?.signedUrl });
  } catch (e: any) {
    console.error("Upload error:", e);
    const status = e.statusCode === '413' || e.status === 413 ? 413 : 500;
    const message = status === 413 
      ? 'File exceeds maximum allowed size. Please compress or resize the image.'
      : e.message || 'Upload failed';
    return c.json({ error: message }, status);
  }
});

// AI Document Parsing Endpoint
app.post("/make-server-37f42386/parse-document", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    const backFile = body['backFile'];
    const type = body['type'] as string;

    if (!file || !(file instanceof File)) return c.json({ error: "No file provided" }, 400);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return c.json({ error: "OpenAI API Key not configured" }, 503);

    const openai = new OpenAI({ apiKey });

    let prompt = `Extract information from this ${type} document into valid JSON. Return ONLY the raw JSON object. Do not use markdown formatting (no \`\`\`json). Use ISO 8601 format (YYYY-MM-DD) for all dates.`;
    
    if (type === 'license') {
        prompt += `
        For 'license', extract the following fields into a JSON object with these EXACT keys:
        - firstName, lastName, middleName
        - licenseNumber (Driver's License No. or TRN), expirationDate (YYYY-MM-DD), dateOfBirth (YYYY-MM-DD)
        - address, state, countryCode
        - class, sex (M or F)
        - licenseToDrive (Extract the EXACT FULL TEXT under "LICENCE TO DRIVE" or "LICENSE TO DRIVE". e.g. "M/CARS & TRUCKS...". Do NOT abbreviate to "Class C" or similar codes. Copy the text exactly as it appears. If multiple lines, join with a space.)
        - originalIssueDate (Look for "ORIGINAL DATE OF ISSUE" - YYYY-MM-DD)
        - collectorate (Look for "COLLECTORATE" label, typically under the TRN or near the top. e.g. "011 SPANISH TOWN")
        - controlNumber (Look for "CONTROL NO.". The value is a long numeric string (e.g. 0110149740). It might be below the label. Extract ALL digits. Ignore '#' prefix.), nationality
        
        Ensure dateOfBirth is used instead of dob.

        CRITICAL PARSING RULE FOR JAMAICAN LICENSES:
        - The section under "NAME" is structured as:
          Line 1: LAST NAME (Surname)
          Line 2: FIRST NAME + MIDDLE NAMES
        - Example:
          NAME
          THOMAS           -> lastName: "THOMAS"
          SADIKI ABAYOMI   -> firstName: "SADIKI", middleName: "ABAYOMI"
        - Do NOT assign Line 1 to firstName. Line 1 is ALWAYS the Last Name.
        `;
    } else if (type === 'vehicle_registration') {
        prompt += `
        For 'vehicle_registration' (extract strictly):
        - plate (License Plate No), vin (Chassis No)
        - mvid (Motor Vehicle ID), laNumber (Licence Authority No), controlNumber
        - make, model, year
        - expirationDate (YYYY-MM-DD), issueDate (YYYY-MM-DD)
        `;
    } else if (type === 'fitness_certificate') {
        prompt += `
        For 'fitness_certificate':
        - make, model, year, color
        - bodyType, engineNumber, ccRating
        - issueDate (YYYY-MM-DD), expirationDate (YYYY-MM-DD)
        `;
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = `data:${file.type};base64,${base64Data}`;

    const contentPayload: any[] = [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: dataUrl } }
    ];

    if (backFile && backFile instanceof File) {
         const backBuffer = await backFile.arrayBuffer();
         const backBase64 = Buffer.from(backBuffer).toString('base64');
         const backUrl = `data:${backFile.type};base64,${backBase64}`;
         contentPayload.push({ type: "text", text: "The following image is the BACK of the document. Use it to extract licenseToDrive, originalIssueDate, controlNumber, and nationality." });
         contentPayload.push({ type: "image_url", image_url: { url: backUrl } });
    }

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "user",
                content: contentPayload
            }
        ],
        response_format: { type: "json_object" }
    });
    
    const text = response.choices[0].message.content || "{}";
    return c.json({ success: true, data: JSON.parse(text) });

  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});



app.get("/make-server-37f42386/fuel-cards", async (c) => {
  try {
    const cards = await kv.getByPrefix("fuel_card:");
    return c.json(cards || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/fuel-cards", async (c) => {
  try {
    const card = await c.req.json();
    if (!card.id) {
        card.id = crypto.randomUUID();
    }
    await kv.set(`fuel_card:${card.id}`, card);
    return c.json({ success: true, data: card });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/fuel-cards/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`fuel_card:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Fuel Entries (Logs) Endpoints
// Fuel Entries (Logs) Endpoints - Optimized
app.get("/make-server-37f42386/fuel-entries", async (c) => {
  try {
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const limit = limitParam ? parseInt(limitParam) : 100;
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "fuel_entry:%")
        .order("value->>date", { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw error;
    
    // Phase 8.4: Large Data Stripping
    const entries = (data || []).map((d: any) => {
        const v = d.value || {};
        if (v.metadata?.receiptBase64) delete v.metadata.receiptBase64;
        return v;
    });

    return c.json(entries);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/fuel-entries", async (c) => {
  try {
    const entry = await c.req.json();
    if (!entry.id) {
        entry.id = crypto.randomUUID();
    }
    await kv.set(`fuel_entry:${entry.id}`, entry);
    return c.json({ success: true, data: entry });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/fuel-entries/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`fuel_entry:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Mileage Adjustments Endpoints
app.get("/make-server-37f42386/mileage-adjustments", async (c) => {
  try {
    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "fuel_adjustment:%")
        .order("value->>week", { ascending: false });

    if (error) throw error;
    const adjustments = data?.map((d: any) => d.value) || [];
    return c.json(adjustments);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/mileage-adjustments", async (c) => {
  try {
    const adj = await c.req.json();
    if (!adj.id) {
        adj.id = crypto.randomUUID();
    }
    await kv.set(`fuel_adjustment:${adj.id}`, adj);
    return c.json({ success: true, data: adj });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/mileage-adjustments/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`fuel_adjustment:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/generate-vehicle-image", async (c) => {
  try {
    const { make, model, year, color, bodyType, licensePlate } = await c.req.json();
    
    // Switch to Gemini/Imagen as requested
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
        return c.json({ error: "Gemini API Key not configured" }, 503);
    }

    // Update prompt for better vehicle accuracy
    const prompt = `Professional studio photography of a ${year} ${color} ${make} ${model} ${bodyType}, automotive photoshoot style. 
    The car is positioned on a clean, seamless white background with soft reflections on the floor. 
    Front 3/4 angle view, high resolution, 8k, photorealistic, sharp focus. 
    Ensure the design matches the specific production year ${year}. No license plates.`;

    let imageB64 = null;
    let lastError = null;

    try {
        // Using Imagen 4.0 (Production Standard 2026) as requested
        // Endpoint: Google Generative Language API (Gemini API)
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instances: [{ prompt: prompt }],
                    parameters: { 
                        sampleCount: 1, 
                        aspectRatio: "1:1"
                    }
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google Imagen API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        
        // Handle Imagen response structure
        // The API returns { predictions: [ { bytesBase64Encoded: "..." } ] }
        if (data.predictions && data.predictions[0]) {
             const prediction = data.predictions[0];
             imageB64 = prediction.bytesBase64Encoded || prediction;
        }

        if (!imageB64) {
            throw new Error("No image data received from Gemini/Imagen");
        }

    } catch (e: any) {
        lastError = e.message;
        console.error("Gemini Imagen Failed:", e);
    }

    if (!imageB64) {
         return c.json({ 
             error: `Image Generation failed: ${lastError}` 
         }, 500);
    }
    
    // Convert Base64 to Buffer for Upload
    const buffer = Buffer.from(imageB64, 'base64');
    
    // Use the global supabase client
    const bucketName = `make-37f42386-vehicles`;
    
    // Ensure bucket exists (idempotent)
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b: any) => b.name === bucketName)) {
        await supabase.storage.createBucket(bucketName, { public: false });
    }

    const fileName = `${licensePlate || crypto.randomUUID()}.png`;

    const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, buffer, { 
            contentType: 'image/png', 
            upsert: true 
        });

    if (uploadError) throw uploadError;

    // Generate Signed URL (valid for 1 year)
    const { data: signedUrlData, error: signError } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(fileName, 31536000); 

    if (signError) throw signError;

    return c.json({ url: signedUrlData.signedUrl });

  } catch (e: any) {
    console.error("Image Generation Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Toll Tag Endpoints
app.get("/make-server-37f42386/toll-tags", async (c) => {
  try {
    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "toll_tag:%");

    if (error) throw error;
    const tags = data?.map((d: any) => d.value) || [];
    return c.json(tags);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/toll-tags", async (c) => {
  try {
    const tag = await c.req.json();
    if (!tag.id) {
        tag.id = crypto.randomUUID();
    }
    if (!tag.createdAt) {
        tag.createdAt = new Date().toISOString();
    }
    
    // Key structure: toll_tag:{id}
    await kv.set(`toll_tag:${tag.id}`, tag);
    return c.json({ success: true, data: tag });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/toll-tags/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`toll_tag:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// =========================================================================
// Toll Plaza Endpoints (Phase 2 — Toll Database CRUD)
// KV key pattern: toll_plaza:{id}
// =========================================================================

// Step 2.1 — GET all toll plazas
app.get("/make-server-37f42386/toll-plazas", async (c) => {
  try {
    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "toll_plaza:%");

    if (error) throw error;
    const plazas = data?.map((d: any) => d.value) || [];
    console.log(`[TollPlaza] GET /toll-plazas — returning ${plazas.length} plazas`);
    return c.json(plazas);
  } catch (e: any) {
    console.log(`[TollPlaza] ERROR GET /toll-plazas: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// Step 2.4 — GET single toll plaza by ID
app.get("/make-server-37f42386/toll-plazas/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const plaza = await kv.get(`toll_plaza:${id}`);
    if (!plaza) {
      console.log(`[TollPlaza] GET /toll-plazas/${id} — not found`);
      return c.json({ error: "Toll plaza not found" }, 404);
    }
    console.log(`[TollPlaza] GET /toll-plazas/${id} — found: ${(plaza as any).name}`);
    return c.json(plaza);
  } catch (e: any) {
    console.log(`[TollPlaza] ERROR GET /toll-plazas/${id}: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// Step 2.2 — POST create or update a toll plaza
app.post("/make-server-37f42386/toll-plazas", async (c) => {
  try {
    const plaza = await c.req.json();

    if (!plaza.id) {
      plaza.id = crypto.randomUUID();
    }
    if (!plaza.createdAt) {
      plaza.createdAt = new Date().toISOString();
    }
    plaza.updatedAt = new Date().toISOString();

    if (!plaza.stats) {
      plaza.stats = {
        totalTransactions: 0,
        totalSpend: 0,
        lastTransactionDate: '',
        avgAmount: 0,
        lastUpdated: new Date().toISOString(),
      };
    }

    await kv.set(`toll_plaza:${plaza.id}`, plaza);
    console.log(`[TollPlaza] POST /toll-plazas — saved plaza "${plaza.name}" (${plaza.id})`);
    return c.json({ success: true, data: plaza });
  } catch (e: any) {
    console.log(`[TollPlaza] ERROR POST /toll-plazas: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// Step 2.3 — DELETE a toll plaza by ID
app.delete("/make-server-37f42386/toll-plazas/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`toll_plaza:${id}`);
    console.log(`[TollPlaza] DELETE /toll-plazas/${id} — deleted`);
    return c.json({ success: true });
  } catch (e: any) {
    console.log(`[TollPlaza] ERROR DELETE /toll-plazas/${id}: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// Notifications endpoints
app.get("/make-server-37f42386/notifications", async (c) => {
  try {
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const limit = limitParam ? parseInt(limitParam) : 50;
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "notification:%")
        .order("value->>timestamp", { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw error;
    
    const notifications = data?.map((d: any) => d.value) || [];
    return c.json(notifications);
  } catch (e: any) {
    console.error("Error fetching notifications:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.post("/make-server-37f42386/notifications", async (c) => {
  try {
    const notification = await c.req.json();
    if (!notification.id) {
        notification.id = crypto.randomUUID();
    }
    if (!notification.timestamp) {
        notification.timestamp = new Date().toISOString();
    }
    
    await kv.set(`notification:${notification.id}`, notification);
    return c.json({ success: true, data: notification });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.patch("/make-server-37f42386/notifications/:id/read", async (c) => {
  const id = c.req.param("id");
  try {
    const notification = await kv.get(`notification:${id}`);
    if (!notification) {
      return c.json({ error: "Notification not found" }, 404);
    }
    notification.read = true;
    await kv.set(`notification:${id}`, notification);
    return c.json({ success: true, data: notification });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Alert Rules endpoints
app.get("/make-server-37f42386/alert-rules", async (c) => {
  try {
    const rules = await kv.getByPrefix("alert_rule:");
    return c.json(rules);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/alert-rules", async (c) => {
  try {
    const rule = await c.req.json();
    if (!rule.id) {
        rule.id = crypto.randomUUID();
    }
    await kv.set(`alert_rule:${rule.id}`, rule);
    return c.json({ success: true, data: rule });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/alert-rules/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`alert_rule:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Batch Management Endpoints
app.get("/make-server-37f42386/batches", async (c) => {
  try {
    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "batch:%")
        .order("value->>uploadDate", { ascending: false });

    if (error) throw error;
    const batches = data?.map((d: any) => d.value) || [];
    return c.json(batches);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/batches", async (c) => {
  try {
    const batch = await c.req.json();
    if (!batch.id) {
        batch.id = crypto.randomUUID();
    }
    await kv.set(`batch:${batch.id}`, batch);
    return c.json({ success: true, data: batch });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/batches/:id", async (c) => {
  const batchId = c.req.param("id");
  try {
    // 1. Get trips belonging to this batch using native Supabase filters
    const { data: tripData, error: tripError } = await supabase
        .from("kv_store_37f42386")
        .select("key")
        .like("key", "trip:%")
        .eq("value->>batchId", batchId);

    if (tripError) throw tripError;
    const tripsToDelete = tripData?.map(d => d.key) || [];
    
    // 2. Delete trips in chunks
    if (tripsToDelete.length > 0) {
        for (let i = 0; i < tripsToDelete.length; i += 100) {
            await kv.mdel(tripsToDelete.slice(i, i + 100));
        }
    }

    // 3. Get transactions belonging to this batch
    const { data: txData, error: txError } = await supabase
        .from("kv_store_37f42386")
        .select("key")
        .like("key", "transaction:%")
        .eq("value->>batchId", batchId);

    if (txError) throw txError;
    const transactionsToDelete = txData?.map(d => d.key) || [];
    
    if (transactionsToDelete.length > 0) {
        for (let i = 0; i < transactionsToDelete.length; i += 100) {
             await kv.mdel(transactionsToDelete.slice(i, i + 100));
        }
    }
    
    // 4. Ghost Data Cleanup
    const { count: tripCount } = await supabase.from("kv_store_37f42386").select('*', { count: 'exact', head: true }).like("key", "trip:%");
    const { count: txCount } = await supabase.from("kv_store_37f42386").select('*', { count: 'exact', head: true }).like("key", "transaction:%");

    if (tripCount === 0 && txCount === 0) {
        console.log("No source data remaining. Cleaning up ghost metrics...");
        const metricPrefixes = ["driver_metric:", "vehicle_metric:", "organization_metric:"];
        for (const prefix of metricPrefixes) {
             const { data: items } = await supabase.from("kv_store_37f42386").select("key").like("key", `${prefix}%`);
             if (items && items.length > 0) {
                 const keys = items.map(d => d.key);
                 for (let i = 0; i < keys.length; i += 100) await kv.mdel(keys.slice(i, i + 100));
             }
        }
    }

    // 5. Delete the batch record itself
    await kv.del(`batch:${batchId}`);
    
    // Invalidate caches
    await cache.invalidateCacheVersion("stats");
    await cache.invalidateCacheVersion("performance");

    return c.json({ 
        success: true, 
        deletedTrips: tripsToDelete.length,
        deletedTransactions: transactionsToDelete.length,
        deletedBatch: batchId 
    });
  } catch (e: any) {
    console.error("Delete batch error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Admin: Preview Data Reset Endpoint - Optimized
app.post("/make-server-37f42386/preview-reset", async (c) => {
  try {
    const { type, startDate, endDate, targets, driverId } = await c.req.json();
    
    if (!type || !startDate || !endDate || !targets) {
        return c.json({ error: "Missing required parameters" }, 400);
    }
    
    const start = new Date(startDate).toISOString();
    const end = new Date(endDate).toISOString();
    
    const items: any[] = [];

    if (type === 'upload') {
        const { data: batchData } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "batch:%")
            .gte("value->>uploadDate", start)
            .lte("value->>uploadDate", end);

        const targetBatches = batchData?.map((d: any) => d.value) || [];
        const batchIds = targetBatches.map((b: any) => b.id);
        
        if (batchIds.length > 0) {
            // Fetch trips and txs for these batches using native Supabase filters
            if (targets.includes('trips')) {
                let query = supabase
                    .from("kv_store_37f42386")
                    .select("value->id, value->platform, value->distance, value->amount, value->driverName, value->batchId, value->date, value->requestTimestamp")
                    .like("key", "trip:%")
                    .in("value->>batchId", batchIds);
                
                if (driverId) query = query.eq("value->>driverId", driverId);
                
                const { data: trips } = await query;
                (trips || []).forEach((t: any) => {
                    items.push({
                        id: t.id,
                        key: `trip:${t.id}`,
                        type: 'Trip',
                        date: t.date || t.requestTimestamp,
                        description: `${t.platform} - ${t.distance || 0}km`,
                        amount: t.amount,
                        driverName: t.driverName || 'Unknown',
                        batchId: t.batchId
                    });
                });
            }

            if (targets.includes('transactions')) {
                let query = supabase
                    .from("kv_store_37f42386")
                    .select("value->id, value->description, value->amount, value->driverName, value->batchId, value->date, value->timestamp, value->receiptUrl")
                    .like("key", "transaction:%")
                    .in("value->>batchId", batchIds);
                
                if (driverId) query = query.eq("value->>driverId", driverId);
                
                const { data: txs } = await query;
                (txs || []).forEach((t: any) => {
                    items.push({
                        id: t.id,
                        key: `transaction:${t.id}`,
                        type: 'Transaction',
                        date: t.date || t.timestamp,
                        description: t.description || 'Toll/Expense',
                        amount: t.amount,
                        driverName: t.driverName || 'Unknown',
                        batchId: t.batchId,
                        receiptUrl: t.receiptUrl
                    });
                });
            }
        }
    } else {
        // Record Date mode - Direct query by date
        if (targets.includes('trips')) {
            let query = supabase
                .from("kv_store_37f42386")
                .select("value->id, value->platform, value->distance, value->amount, value->driverName, value->date, value->requestTimestamp")
                .like("key", "trip:%")
                .or(`value->>date.gte.${start},value->>requestTime.gte.${start}`)
                .or(`value->>date.lte.${end},value->>requestTime.lte.${end}`);
            
            if (driverId) query = query.eq("value->>driverId", driverId);
            
            const { data: trips } = await query;
            (trips || []).forEach((t: any) => {
                items.push({
                    id: t.id,
                    key: `trip:${t.id}`,
                    type: 'Trip',
                    date: t.date || t.requestTimestamp,
                    description: `${t.platform} - ${t.distance || 0}km`,
                    amount: t.amount,
                    driverName: t.driverName || 'Unknown'
                });
            });
        }
        
        if (targets.includes('transactions')) {
            let query = supabase
                .from("kv_store_37f42386")
                .select("value->id, value->description, value->amount, value->driverName, value->date, value->timestamp, value->receiptUrl")
                .like("key", "transaction:%")
                .gte("value->>date", start)
                .lte("value->>date", end);
            
            if (driverId) query = query.eq("value->>driverId", driverId);
            
            const { data: txs } = await query;
            (txs || []).forEach((t: any) => {
                items.push({
                    id: t.id,
                    key: `transaction:${t.id}`,
                    type: 'Transaction',
                    date: t.date || t.timestamp,
                    description: t.description || 'Toll/Expense',
                    amount: t.amount,
                    driverName: t.driverName || 'Unknown',
                    receiptUrl: t.receiptUrl
                });
            });
        }
    }

    return c.json({ success: true, items });

  } catch (e: any) {
    console.error("Preview reset error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Admin: Reset Data By Date Endpoint - Optimized
app.post("/make-server-37f42386/reset-by-date", async (c) => {
  try {
    const { type, startDate, endDate, targets, driverId, preview, keys } = await c.req.json();
    
    // Mode 1: Direct Deletion by Keys
    if (keys && Array.isArray(keys) && keys.length > 0) {
        const filesToDelete: string[] = [];
        const chunkSize = 100;
        
        for (let i = 0; i < keys.length; i += chunkSize) {
            const chunkKeys = keys.slice(i, i + chunkSize);
            const chunkValues = await kv.mget(chunkKeys);
            
            (chunkValues || []).forEach((item: any) => {
                if (item && item.receiptUrl && typeof item.receiptUrl === 'string') {
                     if (item.receiptUrl.includes('make-37f42386-docs')) {
                         const parts = item.receiptUrl.split('make-37f42386-docs/');
                         if (parts.length > 1) {
                             const path = parts[1].split('?')[0];
                             filesToDelete.push(path);
                         }
                     }
                }
            });
            
            await kv.mdel(chunkKeys);
        }

        if (filesToDelete.length > 0) {
            const bucketName = "make-37f42386-docs";
            const fileChunkSize = 50;
            for (let i = 0; i < filesToDelete.length; i += fileChunkSize) {
                const chunk = filesToDelete.slice(i, i + fileChunkSize);
                await supabase.storage.from(bucketName).remove(chunk);
            }
        }
        
        return c.json({ success: true, deletedCount: keys.length, filesDeletedCount: filesToDelete.length });
    }

    // Mode 2: Search (Preview or Bulk Delete)
    if (!type || !startDate || !endDate || !targets) {
        return c.json({ error: "Missing required parameters" }, 400);
    }
    
    const start = new Date(startDate).toISOString();
    const end = new Date(endDate).toISOString();
    
    const candidates: { key: string, data: any, type: 'trip' | 'transaction' | 'fuel_entry' }[] = [];

    if (type === 'upload') {
        const { data: batchData } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "batch:%")
            .gte("value->>uploadDate", start)
            .lte("value->>uploadDate", end);

        const batchIds = batchData?.map((d: any) => d.value.id) || [];
        
        if (batchIds.length > 0) {
            // Trips
            if (targets.includes('trips')) {
                let query = supabase.from("kv_store_37f42386").select("key, value->id, value->date, value->requestTimestamp, value->platform, value->pickupLocation, value->dropoffLocation, value->amount, value->driverId, value->driverName").like("key", "trip:%").in("value->>batchId", batchIds);
                if (driverId) query = query.eq("value->>driverId", driverId);
                const { data } = await query;
                (data || []).forEach((d: any) => candidates.push({ key: d.key, data: d, type: 'trip' }));
            }
            // Fuel Entries
            if (targets.includes('fuel')) {
                let query = supabase.from("kv_store_37f42386").select("key, value->id, value->date, value->amount, value->driverId, value->driverName, value->category, value->description, value->receiptUrl, value->invoiceUrl").like("key", "fuel_entry:%").in("value->>batchId", batchIds);
                if (driverId) query = query.eq("value->>driverId", driverId);
                const { data } = await query;
                (data || []).forEach((d: any) => candidates.push({ key: d.key, data: d, type: 'fuel_entry' }));
            }
            // Transactions (Tolls/Other)
            if (targets.includes('transactions') || targets.includes('tolls')) {
                let query = supabase.from("kv_store_37f42386").select("key, value->id, value->date, value->timestamp, value->amount, value->driverId, value->driverName, value->category, value->description, value->receiptUrl, value->invoiceUrl").like("key", "transaction:%").in("value->>batchId", batchIds);
                if (driverId) query = query.eq("value->>driverId", driverId);
                const { data } = await query;
                (data || []).forEach((d: any) => {
                    const isToll = d.category?.includes('Toll') || d.description?.toLowerCase().includes('toll');
                    if (targets.includes('transactions') || (targets.includes('tolls') && isToll)) {
                        candidates.push({ key: d.key, data: d, type: 'transaction' });
                    }
                });
            }
        }
    } else {
        // Record Date mode
        if (targets.includes('trips')) {
            let query = supabase.from("kv_store_37f42386").select("key, value->id, value->date, value->requestTimestamp, value->platform, value->pickupLocation, value->dropoffLocation, value->amount, value->driverId, value->driverName").like("key", "trip:%")
                .or(`value->>date.gte.${start},value->>requestTime.gte.${start}`)
                .or(`value->>date.lte.${end},value->>requestTime.lte.${end}`);
            if (driverId) query = query.eq("value->>driverId", driverId);
            const { data } = await query;
            (data || []).forEach((d: any) => candidates.push({ key: d.key, data: d, type: 'trip' }));
        }
        
        if (targets.includes('transactions') || targets.includes('tolls') || targets.includes('fuel')) {
            let query = supabase.from("kv_store_37f42386").select("key, value->id, value->date, value->timestamp, value->amount, value->driverId, value->driverName, value->category, value->description, value->receiptUrl, value->invoiceUrl").like("key", "transaction:%")
                .gte("value->>date", start).lte("value->>date", end);
            if (driverId) query = query.eq("value->>driverId", driverId);
            const { data } = await query;
            (data || []).forEach((d: any) => {
                const isToll = d.category?.includes('Toll') || d.description?.toLowerCase().includes('toll');
                const isFuel = d.category === 'Fuel' || d.description?.toLowerCase().includes('fuel');
                if (targets.includes('transactions') || (targets.includes('tolls') && isToll) || (targets.includes('fuel') && isFuel)) {
                    candidates.push({ key: d.key, data: d, type: 'transaction' });
                }
            });
        }

        if (targets.includes('fuel')) {
            let query = supabase.from("kv_store_37f42386").select("key, value->id, value->date, value->amount, value->driverId, value->driverName, value->category, value->description, value->receiptUrl, value->invoiceUrl").like("key", "fuel_entry:%")
                .gte("value->>date", start).lte("value->>date", end);
            if (driverId) query = query.eq("value->>driverId", driverId);
            const { data } = await query;
            (data || []).forEach((d: any) => candidates.push({ key: d.key, data: d, type: 'fuel_entry' }));
        }
    }

    if (preview) {
        return c.json({
            success: true,
            items: candidates.map(c => ({
                id: c.data.id,
                key: c.key,
                type: c.type === 'trip' ? 'Trip' : (c.type === 'fuel_entry' ? 'Fuel Log' : (c.data.category || 'Transaction')),
                date: c.data.date || c.data.requestTimestamp || c.data.timestamp || c.data.uploadDate,
                description: c.type === 'trip' 
                    ? `Trip: ${c.data.pickupLocation || 'Unknown'} -> ${c.data.dropoffLocation || 'Unknown'}` 
                    : (c.data.description || c.data.category || 'Item'),
                amount: c.data.amount,
                driverId: c.data.driverId,
                driverName: c.data.driverName,
                receiptUrl: c.data.receiptUrl || c.data.invoiceUrl
            }))
        });
    }

    // Execute Deletion
    const keysToDelete = candidates.map(c => c.key);
    const filesToDelete: string[] = [];
    candidates.forEach(c => {
        const url = c.data.receiptUrl || c.data.invoiceUrl;
        if (url && typeof url === 'string' && url.includes('make-37f42386-docs')) {
             const parts = url.split('make-37f42386-docs/');
             if (parts.length > 1) filesToDelete.push(parts[1].split('?')[0]);
        }
    });

    if (keysToDelete.length > 0) {
        for (let i = 0; i < keysToDelete.length; i += 100) await kv.mdel(keysToDelete.slice(i, i + 100));
    }

    if (filesToDelete.length > 0) {
        const bucketName = "make-37f42386-docs";
        for (let i = 0; i < filesToDelete.length; i += 50) await supabase.storage.from(bucketName).remove(filesToDelete.slice(i, i + 50));
    }

    return c.json({ success: true, deletedCount: keysToDelete.length, filesDeletedCount: filesToDelete.length });

  } catch (e: any) {
    console.error("Reset by date error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// AI CSV Mapping Endpoint
app.post("/make-server-37f42386/ai/map-csv", async (c) => {
  try {
    const { headers, sample, targetFields } = await c.req.json();
    
    if (!headers || !sample) {
      return c.json({ error: "Headers and sample data required" }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return c.json({ error: "AI Service not configured" }, 503);
    }

    const openai = new OpenAI({ apiKey });

    const prompt = `
      You are an expert data analyst. 
      I have a CSV file with the following headers: ${JSON.stringify(headers)}.
      Here is a sample of the first 3 rows: ${JSON.stringify(sample.slice(0, 3))}.
      
      Please map the CSV headers to the following target system fields:
      ${JSON.stringify(targetFields)}

      Rules:
      1. Analyze the sample data to understand the content of each column (e.g. identify dates, currency, IDs).
      2. Return a JSON object where keys are the CSV Header Name and values are the Target Field Key.
      3. Only include mappings you are confident about.
      4. If a column doesn't match any target field, omit it.
      5. For "driverName", if it's split into "First Name" and "Last Name", map BOTH to "driverName".
      6. For "date", map columns that look like dates or timestamps.
      
      Example Output:
      {
        "Ride Date": "date",
        "Total Fare": "amount",
        "Driver First Name": "driverName", 
        "Driver Last Name": "driverName"
      }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a JSON mapping assistant." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0
    });

    const content = response.choices[0].message.content;
    const mapping = JSON.parse(content || "{}");

    return c.json({ success: true, mapping });
  } catch (e: any) {
    console.error("AI Mapping Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Integration Settings Endpoints
app.get("/make-server-37f42386/settings/integrations", async (c) => {
  try {
    const integrations = await kv.getByPrefix("integration:");
    return c.json(integrations || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/settings/integrations", async (c) => {
  try {
    const integration = await c.req.json();
    if (!integration.id) {
        return c.json({ error: "Integration ID is required" }, 400);
    }
    await kv.set(`integration:${integration.id}`, integration);
    return c.json({ success: true, data: integration });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Uber OAuth Endpoints

// 1. Generate Auth URL
app.get("/make-server-37f42386/uber/auth-url", async (c) => {
  try {
    const integration = await kv.get("integration:uber");
    if (!integration || !integration.credentials?.clientId) {
       return c.json({ error: "Uber integration not configured." }, 400);
    }
    
    // Allow frontend to specify redirect URI (must match exactly what is in Uber Dashboard)
    const clientRedirectUri = c.req.query("redirect_uri");
    const defaultRedirectUri = "https://csfllzzastacofsvcdsc.supabase.co/functions/v1/make-server-37f42386/uber/callback";
    
    // If client provides a URI, use it. Otherwise fallback to old default (which we are deprecating)
    const redirectUri = clientRedirectUri || defaultRedirectUri;
    
    const clientId = integration.credentials.clientId;
    
    // Allow frontend to request specific scopes (default to 'profile')
    // The user must enable these in Uber Dashboard -> Scopes
    const clientScope = c.req.query("scope");
    const scope = clientScope || "profile"; 
    
    const authUrl = `https://login.uber.com/oauth/v2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
    
    return c.json({ url: authUrl });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// 2. Exchange Code (Called by Frontend)
app.post("/make-server-37f42386/uber/exchange", async (c) => {
    try {
        const { code, redirect_uri } = await c.req.json();
        
        if (!code || !redirect_uri) {
            return c.json({ error: "Missing code or redirect_uri" }, 400);
        }

        const integration = await kv.get("integration:uber");
        if (!integration || !integration.credentials) {
            return c.json({ error: "Integration settings missing." }, 400);
        }

        const { clientId, clientSecret } = integration.credentials;

        const body = new URLSearchParams();
        body.append("client_id", clientId);
        body.append("client_secret", clientSecret);
        body.append("grant_type", "authorization_code");
        body.append("redirect_uri", redirect_uri);
        body.append("code", code);

        const tokenRes = await fetch("https://login.uber.com/oauth/v2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body
        });

        const tokenData = await tokenRes.json();
        
        if (!tokenRes.ok) {
            console.error("Uber Token Exchange Failed:", tokenData);
            return c.json({ error: "Token exchange failed", details: tokenData }, 400);
        }

        // Save Tokens
        const tokenStore = {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: Date.now() + (tokenData.expires_in * 1000),
            scope: tokenData.scope,
            token_type: tokenData.token_type
        };
        
        await kv.set("integration:uber_token", tokenStore);
        
        // Update status
        integration.status = 'connected';
        integration.lastConnected = new Date().toISOString();
        await kv.set("integration:uber", integration);

        return c.json({ success: true });

    } catch (e: any) {
        console.error("Exchange Error:", e);
        return c.json({ error: e.message }, 500);
    }
});

// 3. Handle Callback (Deprecated/Legacy for Backend-to-Backend)
app.get("/make-server-37f42386/uber/callback", async (c) => {
  const code = c.req.query("code");
  const error = c.req.query("error");
  
  if (error) {
    return c.html(`<h1>Login Failed</h1><p>${error}</p>`);
  }
  if (!code) {
    return c.html(`<h1>Error</h1><p>No code provided.</p>`);
  }

  try {
    const integration = await kv.get("integration:uber");
    if (!integration || !integration.credentials) {
       return c.html(`<h1>Error</h1><p>Integration settings missing.</p>`);
    }

    const { clientId, clientSecret } = integration.credentials;
    const redirectUri = "https://csfllzzastacofsvcdsc.supabase.co/functions/v1/make-server-37f42386/uber/callback";

    const body = new URLSearchParams();
    body.append("client_id", clientId);
    body.append("client_secret", clientSecret);
    body.append("grant_type", "authorization_code");
    body.append("redirect_uri", redirectUri);
    body.append("code", code);

    const tokenRes = await fetch("https://login.uber.com/oauth/v2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
    });

    const tokenData = await tokenRes.json();
    
    if (!tokenRes.ok) {
        console.error("Uber Token Exchange Failed:", tokenData);
        return c.html(`<h1>Auth Failed</h1><p>${JSON.stringify(tokenData)}</p>`);
    }

    // Save Tokens
    const tokenStore = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + (tokenData.expires_in * 1000),
        scope: tokenData.scope,
        token_type: tokenData.token_type
    };
    
    await kv.set("integration:uber_token", tokenStore);
    
    // Update status
    integration.status = 'connected';
    integration.lastConnected = new Date().toISOString();
    await kv.set("integration:uber", integration);

    return c.html(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: green;">Success!</h1>
        <p>Uber has been connected successfully.</p>
        <p>You can close this window and return to the dashboard.</p>
        <script>
          if (window.opener) {
            window.opener.postMessage("uber-connected", "*");
            setTimeout(() => window.close(), 1500);
          }
        </script>
      </div>
    `);

  } catch (e: any) {
    return c.html(`<h1>System Error</h1><p>${e.message}</p>`);
  }
});

// Uber API Sync Endpoint
app.post("/make-server-37f42386/uber/sync", async (c) => {
  try {
    // 1. Get Tokens
    let tokenStore = await kv.get("integration:uber_token");
    
    if (!tokenStore || !tokenStore.access_token) {
       return c.json({ error: "Uber not connected. Please click 'Connect' first.", code: "AUTH_REQUIRED" }, 401);
    }

    // 2. Check Expiry & Refresh if needed
    if (Date.now() > tokenStore.expires_at) {
        console.log("Token expired, attempting refresh...");
        const integration = await kv.get("integration:uber");
        if (integration?.credentials && tokenStore.refresh_token) {
            const { clientId, clientSecret } = integration.credentials;
            const body = new URLSearchParams();
            body.append("client_id", clientId);
            body.append("client_secret", clientSecret);
            body.append("grant_type", "refresh_token");
            body.append("refresh_token", tokenStore.refresh_token);
            
            const refreshRes = await fetch("https://login.uber.com/oauth/v2/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body
            });
            
            if (refreshRes.ok) {
                const newData = await refreshRes.json();
                tokenStore = {
                    access_token: newData.access_token,
                    refresh_token: newData.refresh_token,
                    expires_at: Date.now() + (newData.expires_in * 1000),
                    scope: newData.scope,
                    token_type: newData.token_type
                };
                await kv.set("integration:uber_token", tokenStore);
                console.log("Token refreshed successfully.");
            } else {
                return c.json({ error: "Session expired. Please reconnect.", code: "AUTH_REQUIRED" }, 401);
            }
        } else {
             return c.json({ error: "Session expired. Please reconnect.", code: "AUTH_REQUIRED" }, 401);
        }
    }

    const accessToken = tokenStore.access_token;
    let trips = [];

    // 3. Fetch Data (Rider History API)
    // Note: The 'history' scope provides this data.
    const historyRes = await fetch("https://api.uber.com/v1.2/history?limit=50", {
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    });

    if (historyRes.ok) {
        const data = await historyRes.json();
        if (data.history && Array.isArray(data.history)) {
            trips = data.history.map((t: any) => ({
                trip_id: t.request_id,
                date: new Date(t.start_time * 1000).toISOString(),
                platform: 'Uber',
                driverId: 'Self', 
                pickupLocation: t.start_city?.display_name || 'Unknown',
                dropoffLocation: t.end_city?.display_name || 'Unknown',
                amount: 0, // Price is often hidden in history-lite
                netPayout: 0,
                status: t.status,
                source: 'uber_oauth_api'
            }));
            return c.json({ success: true, trips });
        } else {
            return c.json({ success: true, trips: [], warning: "Connected, but no history found." });
        }
    } else {
        const errText = await historyRes.text();
        console.error("Uber API Error:", errText);
        return c.json({ error: "Failed to fetch history from Uber.", details: errText }, 500);
    }

  } catch (e: any) {
    console.error("Uber Sync Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Budget Management Endpoints
app.get("/make-server-37f42386/budgets", async (c) => {
  try {
    const budgets = await kv.getByPrefix("budget:");
    return c.json(budgets || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/budgets", async (c) => {
  try {
    const budget = await c.req.json();
    if (!budget.id) {
        budget.id = crypto.randomUUID();
    }
    await kv.set(`budget:${budget.id}`, budget);
    return c.json({ success: true, data: budget });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// General Preferences Endpoints
app.get("/make-server-37f42386/settings/preferences", async (c) => {
  try {
    const preferences = await kv.get("preferences:general");
    return c.json(preferences || {});
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/settings/preferences", async (c) => {
  try {
    const preferences = await c.req.json();
    await kv.set("preferences:general", preferences);
    return c.json({ success: true, data: preferences });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── Toll Info Endpoints ──────────────────────────────────────────────────
app.get("/make-server-37f42386/toll-info", async (c) => {
  try {
    const data = await kv.get("toll:rate_schedule");
    return c.json(data || null);
  } catch (e: any) {
    console.log(`[toll-info GET] Error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/toll-info", async (c) => {
  try {
    const schedule = await c.req.json();
    await kv.set("toll:rate_schedule", schedule);
    return c.json({ success: true });
  } catch (e: any) {
    console.log(`[toll-info POST] Error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// Fixed Expenses Endpoints
app.get("/make-server-37f42386/fixed-expenses/:vehicleId", async (c) => {
  try {
    const vehicleId = c.req.param("vehicleId");
    // Key pattern: fixed_expense:{vehicleId}:{expenseId}
    const expenses = await kv.getByPrefix(`fixed_expense:${vehicleId}:`);
    return c.json(expenses || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/fixed-expenses", async (c) => {
  try {
    const expense = await c.req.json();
    if (!expense.vehicleId) {
        return c.json({ error: "Vehicle ID is required" }, 400);
    }
    if (!expense.id) {
        expense.id = crypto.randomUUID();
    }
    if (!expense.createdAt) {
        expense.createdAt = new Date().toISOString();
    }
    expense.updatedAt = new Date().toISOString();

    const key = `fixed_expense:${expense.vehicleId}:${expense.id}`;
    await kv.set(key, expense);
    return c.json({ success: true, data: expense });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/fixed-expenses/:vehicleId/:id", async (c) => {
  const vehicleId = c.req.param("vehicleId");
  const id = c.req.param("id");
  try {
    const key = `fixed_expense:${vehicleId}:${id}`;
    await kv.del(key);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// AI Fleet Analysis Endpoint
app.post("/make-server-37f42386/analyze-fleet", async (c) => {
  try {
    const { payload } = await c.req.json();
    if (!payload) return c.json({ error: "No payload provided" }, 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return c.json({ error: "Gemini API Key not configured" }, 503);

    const genAI = new GoogleGenerativeAI(apiKey);
    // Model selection moved to execution block for fallback support

    const prompt = `
      You are an expert Fleet Management Data Analyst AI.
      I have uploaded multiple CSV files representing my fleet's activity (Trips, Payments, Driver Performance, Vehicle Stats).
      
      Your goal is to cross-reference these files and output a SINGLE JSON object that populates my database.
      
      ### RULES & LOGIC
      
      1. **Driver Identification**:
         - Group data by Driver Name or UUID. 
         - A driver might appear in multiple files (e.g., "Trip Logs" and "Payment Logs"). Merge them.
      
      2. **Financial Logic (CRITICAL)**:
         - **Cash Collected**: This is money the driver holds physically. Sum the "Cash Collected" column from Payment files.
         - **Phantom Trip Detection**: If a trip has Status="Cancelled" BUT Cash Collected > 0, this is a FRAUD INDICATOR. Add to 'insights.phantomTrips'.
         - **Net Outstanding**: Cash Collected minus any "Cash Deposit" entries found.
      
      3. **Vehicle Logic**:
         - Group earnings by "Vehicle Plate" or "License Plate".
         - If a vehicle appears in "Fuel Logs", subtract that cost from its earnings to estimate ROI.
      
      4. **Performance Targets**:
         - High Performance: Acceptance > 85%, Cancellation < 5%.
         - Critical Warning: Cancellation > 10% or Acceptance < 60%.
      
      ### OUTPUT SCHEMA (Strict JSON)
      
      {
        "metadata": {
          "periodStart": "ISO Date (earliest found)",
          "periodEnd": "ISO Date (latest found)",
          "filesProcessed": Number
        },
        "drivers": [
          {
            "driverId": "String (UUID or Name Hash)",
            "driverName": "String",
            "periodStart": "ISO Date",
            "periodEnd": "ISO Date",
            "totalEarnings": Number,
            "cashCollected": Number,
            "netEarnings": Number,
            "acceptanceRate": Number (0.0-1.0),
            "cancellationRate": Number (0.0-1.0),
            "completionRate": Number (0.0-1.0),
            "onlineHours": Number,
            "tripsCompleted": Number,
            "ratingLast500": Number,
            "score": Number (0-100),
            "tier": "String (Bronze/Silver/Gold/Platinum)",
            "recommendation": "String (Advice for manager)"
          }
        ],
        "vehicles": [
          {
            "plateNumber": "String",
            "totalEarnings": Number,
            "onlineHours": Number,
            "totalTrips": Number,
            "utilizationRate": Number (0-100),
            "roiScore": Number (0-100),
            "maintenanceStatus": "String (Good/Due Soon/Critical)"
          }
        ],
        "financials": {
          "totalEarnings": Number,
          "netFare": Number,
          "totalCashExposure": Number,
          "fleetProfitMargin": Number
        },
        "insights": {
          "alerts": ["String"],
          "trends": ["String"],
          "recommendations": ["String"],
          "phantomTrips": [ { "tripId": "String", "driver": "String", "amount": Number } ]
        }
      }

      ### DATA INPUT
      ${payload}
    `;

    // Robust fallback strategy for model selection
    // Added 'gemini-1.5-flash-latest' and 'gemini-1.5-pro-latest' and explicit fallback to OpenAI
    const modelCandidates = ["gemini-2.0-flash-exp", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.5-flash-latest", "gemini-1.5-pro-latest"];
    let result = null;
    let lastError = null;

    for (const modelName of modelCandidates) {
        try {
            console.log(`Attempting analysis with model: ${modelName}`);
            const model = genAI.getGenerativeModel({ model: modelName });
            result = await model.generateContent(prompt);
            if (result) break; 
        } catch (e: any) {
            console.warn(`Model ${modelName} failed:`, e.message);
            lastError = e;
        }
    }

    let text = "";
    if (!result) {
        console.warn("All Gemini models failed. Attempting fallback to OpenAI GPT-4o...");
        const openaiKey = Deno.env.get("OPENAI_API_KEY");
        if (openaiKey) {
            try {
                const openai = new OpenAI({ apiKey: openaiKey });
                const completion = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "system", content: "You are an expert Fleet Management Data Analyst AI." },
                        { role: "user", content: prompt }
                    ],
                    response_format: { type: "json_object" }
                });
                text = completion.choices[0].message.content || "{}";
                console.log("OpenAI Fallback Successful");
            } catch (openaiError: any) {
                 console.error("OpenAI Fallback Failed:", openaiError);
                 throw new Error(`Both Gemini and OpenAI failed. Gemini Error: ${lastError?.message}`);
            }
        } else {
             throw new Error(`All Gemini models failed and OPENAI_API_KEY is missing. Last Gemini Error: ${lastError?.message}`);
        }
    } else {
        const response = await result.response;
        text = response.text();
    }
    
    // Enhanced JSON Extraction and Cleaning
    let jsonStr = text.trim();
    
    // 1. Try to extract from Markdown code blocks first
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
    } else {
        // 2. Fallback: Find the first '{' and last '}'
        const firstOpen = text.indexOf('{');
        const lastClose = text.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
            jsonStr = text.substring(firstOpen, lastClose + 1);
        }
    }
    
    let data;
    try {
        data = JSON.parse(jsonStr);
    } catch(parseError) {
        console.warn("Initial JSON parse failed. Attempting to repair common errors...");
        try {
            // 3. Simple Repair: Remove trailing commas in arrays/objects
            // Note: This is a basic regex and won't catch everything, but fixes the most common AI error
            const fixedJson = jsonStr.replace(/,\s*([\]}])/g, '$1');
            data = JSON.parse(fixedJson);
            console.log("JSON successfully repaired.");
        } catch (repairError) {
             console.error("JSON Parse Error:", parseError);
             console.log("Raw Text:", text);
             
             // 4. Ultimate Fallback: Return raw text wrapped in a simple structure so the user sees something
             // This prevents the "500 Internal Server Error" crash and allows the frontend to show the raw analysis
             console.warn("Returning raw text as fallback due to parse failure.");
             return c.json({ 
                 success: true, 
                 warning: "AI output was not valid JSON. Showing raw analysis.",
                 data: {
                     metadata: { filesProcessed: 1 },
                     drivers: [],
                     vehicles: [],
                     financials: { totalEarnings: 0, netFare: 0, totalCashExposure: 0, fleetProfitMargin: 0 },
                     insights: { 
                         alerts: ["Analysis generated but format was invalid."], 
                         recommendations: [text], // Put the raw text here so the user can read it
                         phantomTrips: [] 
                     }
                 }
             });
        }
    }

    return c.json({ success: true, data });
  } catch (e: any) {
    console.error("Analysis Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Fleet Sync Endpoint (Mega-JSON Persistence)
app.post("/make-server-37f42386/fleet/sync", async (c) => {
  try {
    const { drivers, vehicles, financials, trips, metadata, insights } = await c.req.json();
    
    const operations = [];

    // 1. Driver Metrics
    if (Array.isArray(drivers) && drivers.length > 0) {
        // Deduplicate drivers by driverId to avoid "ON CONFLICT DO UPDATE command cannot affect row a second time"
        const uniqueDrivers = Array.from(new Map(drivers.map(d => [d.driverId, d])).values());
        const driverKeys = uniqueDrivers.map((d: any) => `driver_metric:${d.driverId}`);
        operations.push(kv.mset(driverKeys, uniqueDrivers));
    }

    // 2. Vehicle Metrics
    if (Array.isArray(vehicles) && vehicles.length > 0) {
        // Deduplicate vehicles by plateNumber or vehicleId
        const uniqueVehicles = Array.from(new Map(vehicles.map(v => [v.plateNumber || v.vehicleId, v])).values());
        const vehicleKeys = uniqueVehicles.map((v: any) => `vehicle_metric:${v.plateNumber || v.vehicleId}`);
        operations.push(kv.mset(vehicleKeys, uniqueVehicles));
    }

    // 3. Trips
    if (Array.isArray(trips) && trips.length > 0) {
        // Deduplicate trips by id
        const uniqueTrips = Array.from(new Map(trips.map(t => [t.id, t])).values());
        const tripKeys = uniqueTrips.map((t: any) => `trip:${t.id}`);
        operations.push(kv.mset(tripKeys, uniqueTrips));
    }

    // 4. Financials (Singleton)
    if (financials) {
        operations.push(kv.set("organization_metrics:current", financials));
    }

    // 5. Metadata & Insights
    if (metadata) {
        operations.push(kv.set("import_metadata:current", metadata));
    }
    if (insights) {
        operations.push(kv.set("import_insights:current", insights));
    }

    await Promise.all(operations);

    return c.json({ 
        success: true, 
        stats: {
            drivers: drivers?.length || 0,
            vehicles: vehicles?.length || 0,
            trips: trips?.length || 0
        }
    });

  } catch (e: any) {
      console.error("Fleet Sync Error:", e);
      return c.json({ error: e.message }, 500);
  }
});

// Financials Endpoint
app.get("/make-server-37f42386/financials", async (c) => {
    try {
        const data = await kv.get("organization_metrics:current");
        return c.json(data || {});
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post("/make-server-37f42386/financials", async (c) => {
    try {
        const data = await c.req.json();
        await kv.set("organization_metrics:current", data);
        return c.json({ success: true, data });
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Parse Invoice Endpoint
app.post("/make-server-37f42386/parse-invoice", async (c) => {
    try {
        const body = await c.req.parseBody();
        const file = body['file'];

        if (!file || !(file instanceof File)) {
            return c.json({ error: "No file uploaded" }, 400);
        }

        const apiKey = Deno.env.get("GEMINI_API_KEY");
        if (!apiKey) return c.json({ error: "Gemini API Key not configured" }, 500);

        const genAI = new GoogleGenerativeAI(apiKey);
        
        // Robust model selection
        const modelCandidates = ["gemini-1.5-flash-latest", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp"];
        
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = file.type;

        const prompt = `Analyze this vehicle service invoice or receipt. This is from Jamaica, which EXCLUSIVELY uses DD/MM/YYYY date format. Extract the following information in strict JSON format:
        - date (YYYY-MM-DD. The receipt uses DD/MM/YYYY. The FIRST number is the day, SECOND is the month. Example: "01/12/2025" = 1st Dec 2025 = "2025-12-01".)
        - type (Choose the best fit: 'oil', 'tires', 'brake', 'inspection', 'repair', 'maintenance' (for multi-service visits), or 'other')
        - cost (number, total numeric amount. Ignore currency symbols like JMD or $)
        - odometer (number, if present)
        - notes (Create a clean, detailed summary. List every service performed and part replaced. Include customer complaints if visible (e.g. 'Customer reported soft brakes'). Format as a readable string.)
        
        If a field is missing, use null. Return ONLY the JSON object, no markdown code blocks.`;

        let result = null;
        let lastError = null;

        for (const modelName of modelCandidates) {
            try {
                console.log(`Attempting invoice analysis with model: ${modelName}`);
                const model = genAI.getGenerativeModel({ model: modelName });
                result = await model.generateContent([
                    prompt,
                    {
                        inlineData: {
                            data: base64Data,
                            mimeType: mimeType
                        }
                    }
                ]);
                if (result) break;
            } catch (e: any) {
                console.warn(`Model ${modelName} failed:`, e.message);
                lastError = e;
            }
        }

        if (!result) {
             throw new Error(`All Gemini models failed. Last Error: ${lastError?.message}`);
        }

        const response = result.response;
        const text = response.text();
        
        // Clean markdown code blocks if present
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let data;
        try {
            data = JSON.parse(jsonStr);
        } catch (e) {
            console.error("Failed to parse JSON from Gemini:", text);
            return c.json({ error: "Failed to parse invoice data" }, 500);
        }

        return c.json({ success: true, data });

    } catch (e: any) {
        console.error("Error parsing invoice:", e);
        return c.json({ error: e.message }, 500);
    }
});

// Parse Inspection Endpoint
app.post("/make-server-37f42386/parse-inspection", async (c) => {
    try {
        const body = await c.req.parseBody();
        const file = body['file'];

        if (!file || !(file instanceof File)) {
            return c.json({ error: "No file uploaded" }, 400);
        }

        const apiKey = Deno.env.get("GEMINI_API_KEY");
        if (!apiKey) return c.json({ error: "Gemini API Key not configured" }, 500);

        const genAI = new GoogleGenerativeAI(apiKey);
        
        // Robust model selection
        const modelCandidates = ["gemini-1.5-flash-latest", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp"];
        
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = file.type;

        const checklistItems = [
            "Replace Engine Oil & Filter",
            "Replace Air Filter",
            "Replace Cabin Filter",
            "Replace Spark Plugs",
            "Replace Brake Pads (Front)",
            "Replace Brake Pads (Rear)",
            "Resurface/Replace Rotors",
            "Flush Brake Fluid",
            "Flush Coolant",
            "Transmission Service",
            "Wheel Alignment",
            "Rotate/Balance Tires",
            "Replace Tires",
            "Replace Wipers",
            "Replace Battery",
            "Suspension Repair",
            "Steering System Repair",
            "Exhaust System Repair",
            "AC Service",
            "Matching/Calibration",
            "Throttle Body Cleaning"
        ];

        const prompt = `Analyze this vehicle inspection report (or mechanic's checklist). Extract the following information in strict JSON format:
        - issues: array of strings. Identify all items marked as 'Failed', 'Needs Attention', 'Repair Needed', 'Bad', 'Replace', or general negative findings. 
          IMPORTANT: Try to map each issue to one of the following exact categories if it matches closely:
          ${JSON.stringify(checklistItems)}
          If an issue does not match any of these, use a concise, descriptive string (e.g. "Leaking Radiator").
        - notes: string. A comprehensive summary of the inspection findings. Include specific measurements (e.g. "Front Brake Pads: 3mm", "Tire Tread: 4/32") if visible. Include mechanic recommendations.
        
        Return ONLY the JSON object, no markdown code blocks.`;

        let result = null;
        let lastError = null;

        for (const modelName of modelCandidates) {
            try {
                console.log(`Attempting inspection analysis with model: ${modelName}`);
                const model = genAI.getGenerativeModel({ model: modelName });
                result = await model.generateContent([
                    prompt,
                    {
                        inlineData: {
                            data: base64Data,
                            mimeType: mimeType
                        }
                    }
                ]);
                if (result) break;
            } catch (e: any) {
                console.warn(`Model ${modelName} failed:`, e.message);
                lastError = e;
            }
        }

        if (!result) {
             throw new Error(`All Gemini models failed. Last Error: ${lastError?.message}`);
        }

        const response = result.response;
        const text = response.text();
        
        // Clean markdown code blocks if present
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let data;
        try {
            data = JSON.parse(jsonStr);
        } catch (e) {
            console.error("Failed to parse JSON from Gemini:", text);
            return c.json({ error: "Failed to parse inspection data" }, 500);
        }

        return c.json({ success: true, data });

    } catch (e: any) {
        console.error("Error parsing inspection:", e);
        return c.json({ error: e.message }, 500);
    }
});

// Odometer History Endpoints - Optimized
app.get("/make-server-37f42386/odometer-history/:vehicleId", async (c) => {
  try {
    const vehicleId = c.req.param("vehicleId");
    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", `odometer_reading:${vehicleId}:`)
        .order("value->>date", { ascending: false });

    if (error) throw error;
    const history = data?.map((d: any) => d.value) || [];
    return c.json(history);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/odometer-history", async (c) => {
  try {
    const reading = await c.req.json();
    if (!reading.id) reading.id = crypto.randomUUID();
    if (!reading.vehicleId) return c.json({ error: "Vehicle ID required" }, 400);
    if (!reading.createdAt) reading.createdAt = new Date().toISOString();
    
    // Key format: odometer_reading:{vehicleId}:{readingId}
    await kv.set(`odometer_reading:${reading.vehicleId}:${reading.id}`, reading);
    
    return c.json({ success: true, data: reading });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// AI Toll CSV Parsing
app.post("/make-server-37f42386/ai/parse-toll-csv", async (c) => {
  try {
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const { csvContent } = await c.req.json();
    if (!csvContent) {
        return c.json({ error: "No CSV content provided" }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return c.json({ error: "AI Service not configured" }, 503);
    }

    const openai = new OpenAI({ apiKey });

    const prompt = `
      You are an expert data parser.
      Parse the following toll transaction data into a JSON array.
      
      The input is likely a CSV, TSV, or copy-pasted table.
      This data is from Jamaica. Jamaica EXCLUSIVELY uses DD/MM/YYYY date format.

      Current Date Context: ${today}
      
      Output JSON Schema:
      {
        "transactions": [
            {
            "date": "ISO Date String (YYYY-MM-DD)",
            "tagId": "Tag ID or Serial Number (String) or empty",
            "location": "Plaza Name (String)",
            "laneId": "Lane ID (String) or empty",
            "amount": Number (Negative for deduction, Positive for Top-up),
            "type": "Usage" | "Top-up" | "Refund"
            }
        ]
      }
      
      Rules:
      1. DATE FORMAT — NON-NEGOTIABLE: This is Jamaican data. ALL dates are DD/MM/YYYY (Day/Month/Year). NEVER interpret as MM/DD/YYYY.
         - "01/05/2024" = 1st May 2024 → output "2024-05-01"
         - "10/04/2025" = 10th April 2025 → output "2025-04-10"
         - "23/10/2025" = 23rd October 2025 → output "2025-10-23"
         - "01/12/2025" = 1st December 2025 → output "2025-12-01"
         - The FIRST number is ALWAYS the day. The SECOND number is ALWAYS the month.
      2. FUTURE DATE CHECK: The Current Date is ${today}.
         - Do NOT output any date that is in the future relative to the Current Date.
         - If the resulting date would be in the future, subtract 1 from the year.
      3. If amount is like "JMD -275.00", parse as -275.00.
      4. If amount is negative, type is "Usage". If positive, type is usually "Top-up" (unless it's a refund).
      5. Ignore header rows or irrelevant lines.
      6. Extract the Tag ID or Serial Number if present in the first few columns.
      7. Return ONLY the valid JSON object with the "transactions" key.
      
      Input Data:
      ${csvContent.substring(0, 15000)}
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a JSON parsing assistant." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0
    });

    const content = response.choices[0].message.content;
    const result = JSON.parse(content || "{}");
    
    // Post-processing: catch and correct any future dates the AI missed
    const corrected = correctFutureDates(result.transactions || []);
    
    return c.json({ success: true, data: corrected });
  } catch (e: any) {
    console.error("AI Toll Parse Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// AI Toll Image Parsing
app.post("/make-server-37f42386/ai/parse-toll-image", async (c) => {
  try {
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file provided" }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return c.json({ error: "AI Service not configured" }, 503);
    }

    const openai = new OpenAI({ apiKey });

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Image = `data:${file.type};base64,${Buffer.from(arrayBuffer).toString('base64')}`;

    const prompt = `
      You are an expert data parser.
      Analyze the provided image of a toll transaction history or top-up history.
      Extract the transaction data into a JSON array.
      This data is from Jamaica. Jamaica EXCLUSIVELY uses DD/MM/YYYY date format.

      Current Date Context: ${today}

      Output JSON Schema:
      {
        "transactions": [
            {
            "date": "ISO Date String (YYYY-MM-DD)",
            "tagId": "Tag ID or Serial Number (String) or empty",
            "location": "Plaza Name (String) or empty if not visible",
            "laneId": "Lane ID (String) or empty",
            "amount": Number (Negative for deduction, Positive for Top-up),
            "type": "Usage" | "Top-up" | "Refund",
            "status": "Success" | "Failure" | "Pending",
            "discount": Number (0 if none),
            "paymentAfterDiscount": Number (equal to amount if none)
            }
        ]
      }

      Rules:
      1. DATE FORMAT — NON-NEGOTIABLE: This is Jamaican data. ALL dates are DD/MM/YYYY (Day/Month/Year). NEVER interpret as MM/DD/YYYY.
         - "01/05/2024" = 1st May 2024 → output "2024-05-01"
         - "10/04/2025" = 10th April 2025 → output "2025-04-10"
         - "23/10/2025" = 23rd October 2025 → output "2025-10-23"
         - "01/12/2025" = 1st December 2025 → output "2025-12-01"
         - The FIRST number is ALWAYS the day. The SECOND number is ALWAYS the month.
      2. FUTURE DATE CHECK: The Current Date is ${today}.
         - Do NOT output any date that is in the future relative to the Current Date.
         - If the resulting date would be in the future, subtract 1 from the year.
      3. Identify "Payment" or "Top Up Amount" columns.
      4. If the row indicates "Failure" or "Failed", ignore it or mark status as Failure.
      5. If "Top Up Amount" is present (e.g. "JMD 2,000.00"), it is a positive amount (Top-up).
      6. If "Usage" or toll charges are shown, they are negative amounts.
      7. Extract Tag ID (e.g. "212100286450") if visible in the header or rows.
      8. Return ONLY the valid JSON object with the "transactions" key.
      9. If multiple amounts are shown (e.g. "Payment After Discount" and "Topup Amount"), use the "Topup Amount" for the main 'amount' field.
      10. Extract "Discount / Bonus" if present.
      11. Extract "Payment After Discount / Bonus" if present.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a JSON parsing assistant."
        },
        {
          role: "user",
          content: [
             { type: "text", text: prompt },
             { type: "image_url", image_url: { url: base64Image } }
          ]
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0
    });

    const content = response.choices[0].message.content;
    const result = JSON.parse(content || "{}");
    
    // Post-processing: catch and correct any future dates the AI missed
    const corrected = correctFutureDates(result.transactions || []);
    
    return c.json({ success: true, data: corrected });

  } catch (e: any) {
    console.error("AI Toll Image Parse Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/odometer-history/:id", async (c) => {
    const id = c.req.param("id");
    const vehicleId = c.req.query("vehicleId");
    const source = c.req.query("source");
    
    if (!vehicleId) return c.json({ error: "vehicleId query param required" }, 400);
    
    try {
        // Determine the correct KV key based on source type
        const keysToTry: string[] = [];
        
        if (source === 'checkin') {
            const rawId = id.startsWith('checkin_') ? id.replace('checkin_', '') : id;
            keysToTry.push(`checkin:${rawId}`);
        } else if (source === 'fuel') {
            const rawId = id.startsWith('fuel_') ? id.replace('fuel_', '') : id;
            keysToTry.push(`fuel_entry:${rawId}`);
        } else if (source === 'service') {
            const rawId = id.startsWith('service_') ? id.replace('service_', '') : id;
            keysToTry.push(`maintenance_log:${vehicleId}:${rawId}`);
        } else {
            keysToTry.push(`odometer_reading:${vehicleId}:${id}`);
        }
        
        // Also always try the legacy odometer_reading key as fallback
        if (!keysToTry.includes(`odometer_reading:${vehicleId}:${id}`)) {
            keysToTry.push(`odometer_reading:${vehicleId}:${id}`);
        }
        
        console.log(`[DELETE odometer-history] Deleting keys for source=${source}, id=${id}:`, keysToTry);
        
        for (const key of keysToTry) {
            try {
                await kv.del(key);
            } catch (_e) {
                // Ignore errors for keys that don't exist
            }
        }
        
        return c.json({ success: true });
    } catch(e: any) {
        console.log(`[DELETE odometer-history] Error: ${e.message}`);
        return c.json({ error: e.message }, 500);
    }
});

// Update generic anchor (Fuel, Check-in, etc)
app.patch("/make-server-37f42386/anchors/:id", async (c) => {
    const id = c.req.param("id");
    const { date, value, type, vehicleId } = await c.req.json();
    let key = "";
    
    // Determine key prefix based on type
    // Note: MasterLogTimeline 'source' maps to these types
    if (type === 'Fuel Log' || type === 'fuel_entry') {
        key = `fuel_entry:${id}`;
    } else if (type === 'Check-in' || type === 'checkin' || type === 'Weekly Check-in') {
         key = `checkin:${id}`;
    } else if (type === 'Service Log' || type === 'maintenance_log') {
         if (!vehicleId) return c.json({ error: "Vehicle ID required for Service Logs" }, 400);
         key = `maintenance_log:${vehicleId}:${id}`;
    } else {
         // Fallback for generic odometer readings
         // Attempt to find the key format. Usually `odometer_reading:{vehicleId}:{id}`
         if (vehicleId) {
             key = `odometer_reading:${vehicleId}:${id}`;
         } else {
             // Try legacy or simple format?
             // Since we can't easily guess, we might fail here for Manual entries if vehicleId is missing
             return c.json({ error: "Vehicle ID required for Manual entries" }, 400);
         }
    }

    try {
        const entry = await kv.get(key);
        if (!entry) return c.json({ error: "Entry not found" }, 404);

        // Update fields
        if (date) entry.date = date;
        if (value) {
            const numVal = Number(value);
            // Update all potential fields for odometer to be safe
            if (entry.odometer !== undefined) entry.odometer = numVal;
            if (entry.value !== undefined) entry.value = numVal;
            if (entry.mileage !== undefined) entry.mileage = numVal; // Service logs often use mileage
        }
        
        await kv.set(key, entry);

        // Optional: Update associated Transaction if it exists (for Fuel Logs)
        if (entry.transactionId) {
            const txKey = `transaction:${entry.transactionId}`;
            const tx = await kv.get(txKey);
            if (tx) {
                if (date) tx.date = date.split('T')[0]; // Transactions use YYYY-MM-DD
                // We don't update time on transaction usually, or complex to parse
                // Also, odometer is sometimes on transaction
                if (value && tx.odometer !== undefined) tx.odometer = Number(value);
                await kv.set(txKey, tx);
            }
        }

        return c.json({ success: true, data: entry });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Claims Endpoints
app.get("/make-server-37f42386/claims", async (c) => {
  try {
    const claims = await kv.getByPrefix("claim:");
    const driverId = c.req.query("driverId");
    
    if (driverId && Array.isArray(claims)) {
        const filtered = claims.filter((claim: any) => claim.driverId === driverId);
        return c.json(filtered);
    }
    
    return c.json(claims || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/claims", async (c) => {
  try {
    const claim = await c.req.json();
    if (!claim.id) {
        claim.id = crypto.randomUUID();
    }
    if (!claim.createdAt) {
        claim.createdAt = new Date().toISOString();
    }
    claim.updatedAt = new Date().toISOString();
    
    // Auto-create Financial Transaction for "Charge Driver" resolution
    // This ensures the $10 charge appears in the driver's transaction ledger
    if (claim.status === 'Resolved' && claim.resolutionReason === 'Charge Driver' && !claim.resolutionTransactionId) {
        const txId = crypto.randomUUID();
        const transaction = {
            id: txId,
            driverId: claim.driverId,
            date: new Date().toISOString(),
            // Ensure description contains 'Toll' so it's picked up by DriverDetail filter
            description: `Toll Dispute Charge - ${claim.subject || 'Resolution'}`, 
            category: 'Adjustment',
            tripId: claim.tripId, // Link to the Trip so it appears nested in the ledger
            type: 'Adjustment',
            amount: Math.abs(claim.amount || 0), // Positive magnitude; ledger logic subtracts it
            status: 'Completed',
            paymentMethod: 'Cash', // Affects Cash Wallet
            metadata: {
                claimId: claim.id,
                source: 'claim_resolution'
            }
        };
        
        await kv.set(`transaction:${txId}`, transaction);
        claim.resolutionTransactionId = txId; // Link it to prevent duplicates
    }
    
    await kv.set(`claim:${claim.id}`, claim);
    return c.json({ success: true, data: claim });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/claims/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`claim:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Admin: List Users
app.get("/make-server-37f42386/users", async (c) => {
  try {
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    
    if (error) throw error;
    
    // Transform to TeamMember format
    const members = users.map((u: any) => ({
        id: u.id,
        name: u.user_metadata?.name || 'Unknown',
        email: u.email || '',
        role: u.user_metadata?.role || 'driver',
        status: 'active', 
        lastActive: u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : 'Never',
        avatarUrl: u.user_metadata?.avatarUrl
    }));
    
    return c.json(members);
  } catch (e: any) {
    console.error("List Users Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Admin: Invite User
app.post("/make-server-37f42386/invite-user", async (c) => {
  try {
    const { email, password, name, role } = await c.req.json();
    
    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }
    
    const { data, error } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      user_metadata: { 
        name: name || '',
        role: role || 'driver'
      },
      email_confirm: true
    });
    
    if (error) throw error;
    
    // Also create a driver profile if role is driver
    if ((role === 'driver' || !role) && data.user) {
        const driverId = data.user.id;
        const driverProfile = {
            id: driverId,
            driverId: driverId, // legacy field compat
            driverName: name || email.split('@')[0],
            email: email,
            status: 'active',
            createdAt: new Date().toISOString(),
            // Initialize empty metrics/defaults
            acceptanceRate: 0,
            cancellationRate: 0,
            completionRate: 0,
            ratingLast500: 5.0,
            totalEarnings: 0
        };
        await kv.set(`driver:${driverId}`, driverProfile);
    }

    return c.json({ success: true, data });
  } catch (e: any) {
    console.error("Invite User Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Admin: Update User Password
app.post("/make-server-37f42386/update-password", async (c) => {
  try {
    const { userId, password } = await c.req.json();
    
    if (!userId || !password) {
      return c.json({ error: "User ID and new password are required" }, 400);
    }
    
    const { data, error } = await supabase.auth.admin.updateUserById(
      userId,
      { password: password }
    );
    
    if (error) throw error;
    
    return c.json({ success: true });
  } catch (e: any) {
    console.error("Update Password Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Admin: Delete User (Driver)
app.post("/make-server-37f42386/delete-user", async (c) => {
  try {
    const { userId } = await c.req.json();
    
    if (!userId) {
      return c.json({ error: "User ID is required" }, 400);
    }
    
    // 1. Delete from Auth (Attempt)
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
        console.warn(`Auth delete failed for ${userId} (ignoring):`, error.message);
    }
    
    // 2. Delete from KV Store
    await kv.del(`driver:${userId}`);
    
    return c.json({ success: true });
  } catch (e: any) {
    console.error("Delete User Error:", e);
    return c.json({ error: e.message }, 500);
  }
});

// Fuel Dispute Endpoints
app.get("/make-server-37f42386/fuel-disputes", async (c) => {
  try {
    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "fuel_dispute:%")
        .order("value->>createdAt", { ascending: false });

    if (error) throw error;
    const disputes = data?.map((d: any) => d.value) || [];
    return c.json(disputes);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/fuel-disputes", async (c) => {
  try {
    const dispute = await c.req.json();
    if (!dispute.id) {
        dispute.id = crypto.randomUUID();
    }
    if (!dispute.createdAt) {
        dispute.createdAt = new Date().toISOString();
    }
    await kv.set(`fuel_dispute:${dispute.id}`, dispute);
    return c.json({ success: true, data: dispute });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/fuel-disputes/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`fuel_dispute:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Equipment Endpoints
app.get("/make-server-37f42386/equipment/:vehicleId", async (c) => {
  try {
    const vehicleId = c.req.param("vehicleId");
    // Get all equipment items for this vehicle. We assume keys are formatted as equipment:{vehicleId}:{itemId}
    const items = await kv.getByPrefix(`equipment:${vehicleId}:`);
    return c.json(items || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/equipment", async (c) => {
  try {
    const item = await c.req.json();
    if (!item.id) {
        item.id = crypto.randomUUID();
    }
    if (!item.vehicleId) {
        return c.json({ error: "Vehicle ID is required" }, 400);
    }
    if (!item.updatedAt) {
        item.updatedAt = new Date().toISOString();
    }
    
    // Key structure: equipment:{vehicleId}:{itemId}
    await kv.set(`equipment:${item.vehicleId}:${item.id}`, item);
    return c.json({ success: true, data: item });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/equipment/:vehicleId/:id", async (c) => {
  const vehicleId = c.req.param("vehicleId");
  const id = c.req.param("id");
  try {
    await kv.del(`equipment:${vehicleId}:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Map Match Endpoint (OSRM Proxy)
app.post("/make-server-37f42386/map-match", async (c) => {
  try {
    const { points } = await c.req.json();
    if (!Array.isArray(points) || points.length === 0) {
      return c.json({ error: "Points array is required" }, 400);
    }

    // Filter valid points with timestamps and sort them
    const rawPoints = points
        .filter((p: any) => {
            const lat = Number(p.lat);
            const lon = Number(p.lon);
            const ts = Number(p.timestamp);
            return p && 
                   !isNaN(lat) && lat !== 0 && 
                   !isNaN(lon) && lon !== 0 && 
                   !isNaN(ts) && ts > 0;
        })
        .sort((a: any, b: any) => Number(a.timestamp) - Number(b.timestamp));

    // Deduplicate to ensure strictly increasing timestamps (seconds) for OSRM
    const uniquePoints: any[] = [];
    let lastSec = -1;
    for (const p of rawPoints) {
        const sec = Math.floor(Number(p.timestamp) / 1000);
        if (sec > lastSec) {
            uniquePoints.push(p);
            lastSec = sec;
        }
    }

    if (uniquePoints.length < 2) {
      // Not enough points for a route, return success with empty/null data to avoid crashing frontend
      return c.json({ success: true, data: { totalDistance: 0, totalDuration: 0, confidence: 0, snappedRoute: [] } });
    }

    // Chunking Logic (60 points per chunk to be safe within 100 limit and URL length)
    const CHUNK_SIZE = 60;
    const chunks = [];
    
    // Create chunks with 1 point overlap
    for (let i = 0; i < uniquePoints.length - 1; i += (CHUNK_SIZE - 1)) {
        const chunk = uniquePoints.slice(i, Math.min(i + CHUNK_SIZE, uniquePoints.length));
        if (chunk.length >= 2) {
            chunks.push(chunk);
        }
    }
    
    const responses = await Promise.all(chunks.map(async (chunk) => {
        // Format: lon,lat;lon,lat
        const coords = chunk.map((p: any) => `${Number(p.lon)},${Number(p.lat)}`).join(';');
        const timestamps = chunk.map((p: any) => Math.floor(Number(p.timestamp) / 1000)).join(';');
        // Increase radius to 60m to be more forgiving of GPS drift
        const radiuses = chunk.map(() => "60").join(';');
        
        // Using public OSRM server. 
        // fallback to 'router.project-osrm.org' but ideally this should be configurable
        const url = `https://router.project-osrm.org/match/v1/driving/${coords}?timestamps=${timestamps}&radiuses=${radiuses}&overview=full&geometries=geojson&steps=false&annotations=true`;
        
        try {
            const res = await fetch(url);
            if (!res.ok) {
                const text = await res.text();
                console.log(`OSRM Failed (${res.status}): ${text.substring(0, 100)}... URL length: ${url.length}`);
                // Return null instead of throwing to allow partial results
                return null;
            }
            return res.json();
        } catch (fetchErr) {
            console.error("OSRM Fetch Error:", fetchErr);
            return null;
        }
    }));

    // Result Stitching
    let totalDistance = 0;
    let totalDuration = 0;
    const stitchedCoordinates: any[] = [];
    let confidenceSum = 0;
    let validResponses = 0;
    
    responses.forEach((res, index) => {
        if (!res || res.code !== 'Ok' || !res.matchings || res.matchings.length === 0) return;
        
        const match = res.matchings[0]; // Take best match
        
        totalDistance += match.distance;
        totalDuration += match.duration;
        confidenceSum += match.confidence;
        validResponses++;

        // Geometry Stitching
        if (match.geometry && match.geometry.coordinates) {
             const coords = match.geometry.coordinates;
             // If this is not the first chunk, remove the first coordinate to avoid duplicate vertex at join
             if (index > 0 && stitchedCoordinates.length > 0) {
                 stitchedCoordinates.push(...coords.slice(1));
             } else {
                 stitchedCoordinates.push(...coords);
             }
        }
    });

    const confidence = validResponses > 0 ? confidenceSum / validResponses : 0;

    return c.json({
        success: true,
        data: {
            snappedRoute: stitchedCoordinates.map((c: any) => ({ lat: c[1], lon: c[0] })), // GeoJSON is [lon, lat]
            totalDistance, // Meters
            totalDuration, // Seconds
            confidence
        }
    });

  } catch (e: any) {
    console.error("Map Matching Error:", e);
    return c.json({ success: false, error: e.message });
  }
});

// Performance Report Endpoint - Optimized with Streaming (Phase 6) & Caching (Phase 7)
app.get("/make-server-37f42386/performance-report", async (c) => {
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");
    const dailyRideTarget = parseInt(c.req.query("dailyRideTarget") || "10");
    const dailyEarningsTarget = parseInt(c.req.query("dailyEarningsTarget") || "0");
    const summaryOnly = c.req.query("summaryOnly") === "true";
    const limit = parseInt(c.req.query("limit") || "100");
    const offset = parseInt(c.req.query("offset") || "0");
    
    if (!startDate || !endDate) {
        return c.json({ error: "startDate and endDate are required" }, 400);
    }

    // Phase 7.1: Caching Strategy
    try {
        const cacheParams = { startDate, endDate, dailyRideTarget, dailyEarningsTarget, summaryOnly, limit, offset };
        const version = await cache.getCacheVersion("performance");
        const cacheKey = await cache.generateKey(`performance:${version}`, cacheParams);
        
        const cachedData = await cache.getCache(cacheKey);
        if (cachedData) {
            c.header("X-Cache", "HIT");
            return c.json(cachedData);
        }
        
        c.header("X-Cache", "MISS");

        return streamText(c, async (stream) => {
            // Helper for safe streaming to handle Broken Pipe
            const safeWrite = async (content: string): Promise<boolean> => {
                try {
                    await stream.write(content);
                    return true;
                } catch (writeErr: any) {
                    if (writeErr.message.includes("broken pipe") || 
                        writeErr.name === "EPIPE" || 
                        writeErr.name === "Http" || 
                        writeErr.name === "BadResource") {
                        console.warn(`Stream Client disconnected (${writeErr.name}) - Stopping stream`);
                        return false;
                    }
                    // Log unexpected errors but still return false to stop the loop safely
                    console.error("Unexpected stream write error:", writeErr);
                    return false;
                }
            };

            try {
                // Buffer for caching
                const cachedReports: any[] = [];

                // 1. Get total count of drivers first (for pagination metadata)
                const { count: totalDrivers, error: countError } = await supabase
                    .from("kv_store_37f42386")
                    .select("key", { count: 'exact', head: true })
                    .like("key", "driver:%");

                if (countError) throw countError;

                // Log Start
                const reqStart = Date.now();
                console.log(`[Performance Report] Starting processing for offset ${offset}, limit ${limit}`);

                // Start JSON response
                if (!await safeWrite(`{"data": [`)) return;

                // 2. Fetch Drivers for the requested page
                // We still fetch the full page of drivers requested (e.g., 100)
                let { data: driverData, error: driverError } = await supabase
                    .from("kv_store_37f42386")
                    .select("value->id, value->name, value->driverId, value->uberDriverId, value->inDriveDriverId")
                    .like("key", "driver:%")
                    .range(offset, offset + limit - 1);

                if (driverError) throw driverError;

                let driversPage = (driverData as any) || [];
                // Free raw driver response
                (driverData as any) = null;

                let firstItem = true;

                // 3. Process drivers in chunks (Throttled via pMap)
                const CHUNK_SIZE = 10; 
                let driverChunks = [];
                for (let i = 0; i < driversPage.length; i += CHUNK_SIZE) {
                    driverChunks.push(driversPage.slice(i, i + CHUNK_SIZE));
                }
                // Free driversPage as it is now chunked
                (driversPage as any) = null;

                // Circuit Breaker State
                let failureCount = 0;
                const MAX_FAILURES = 3;

                // Define the processor for a single chunk
                const processChunk = async (driverChunk: any[], chunkIndex: number) => {
                    // Circuit Breaker Check
                    if (failureCount >= MAX_FAILURES) {
                        console.warn("Circuit Breaker Open: Skipping chunk due to previous failures");
                        return;
                    }

                    const driverIds = new Set<string>();
                    driverChunk.forEach((d: any) => {
                        if (d.id) driverIds.add(d.id);
                        if (d.driverId) driverIds.add(d.driverId);
                        if (d.uberDriverId) driverIds.add(d.uberDriverId);
                        if (d.inDriveDriverId) driverIds.add(d.inDriveDriverId);
                    });

                    if (driverIds.size === 0) return;

                    const chunkStart = Date.now();

                    // Fetch raw trips
                    let { data: tripData, error: tripError } = await supabase
                        .from("kv_store_37f42386")
                        .select("value->id, value->amount, value->date, value->driverId, value->status")
                        .like("key", "trip:%")
                        .in("value->>driverId", Array.from(driverIds))
                        .or(`value->>date.gte.${startDate},value->>requestTime.gte.${startDate}`)
                        .or(`value->>date.lte.${endDate},value->>requestTime.lte.${endDate}`);

                    if (tripError) {
                        console.error(`[Chunk Error] Failed to fetch trips. Drivers: ${driverIds.size}`, tripError);
                        failureCount++; // Increment failure count
                        return;
                    }
                    
                    const tripCount = (tripData as any)?.length || 0;

                    // Aggregate immediately
                    const report = generatePerformanceReport(
                        (tripData as any) || [], 
                        driverChunk, 
                        startDate, 
                        endDate,
                        { dailyRideTarget, dailyEarningsTarget },
                        summaryOnly
                    );
                    
                    // Explicitly free heavy trip data to prevent OOM
                    (tripData as any) = null;

                    console.log(`[Chunk] Processed ${driverIds.size} drivers. Trips: ${tripCount}. Duration: ${Date.now() - chunkStart}ms`);

                    // Stream items INDIVIDUALLY to reduce memory pressure
                    for (const reportItem of report) {
                        let prefix = "";
                        if (!firstItem) {
                            prefix = ",";
                        }
                        const itemStr = prefix + JSON.stringify(reportItem);
                        
                        // CRITICAL FIX: Check if write succeeded
                        const success = await safeWrite(itemStr);
                        if (!success) {
                            console.warn(`[Chunk] Stream broken during write. Aborting processing.`);
                            throw new Error("StreamAborted");
                        }
                        
                        firstItem = false;
                    }

                    // Add to cache buffer
                    cachedReports.push(...report);
                };

                // Execute with concurrency limit of 1 (Serial)
                // specific error handling for StreamAborted to exit cleanly
                try {
                    await pMap(driverChunks, processChunk, { concurrency: 1 });
                } catch (err: any) {
                    if (err.message === "StreamAborted") {
                        console.warn("Processing halted due to client disconnection.");
                        return; // Exit function cleanly, do not try to write footer
                    }
                    throw err; // Re-throw real errors
                }

                // End JSON response
                const resultMetadata = { total: totalDrivers || 0, limit, offset };
                if (!await safeWrite(`], "total": ${totalDrivers || 0}, "limit": ${limit}, "offset": ${offset}}`)) return;
                
                console.log(`[Performance Report] Completed in ${Date.now() - reqStart}ms`);

                // 7. Save to Cache (Async) - Step 7.3: Increase TTL for summary data
                const ttl = summaryOnly ? 600 : 300; // 10 mins for summary, 5 mins for details
                const finalResponse = {
                    data: cachedReports,
                    ...resultMetadata
                };
                
                // We don't await this to keep the response fast, but Deno Deploy might kill background tasks?
                // Better to await it or use specific background pattern.
                await cache.setCache(cacheKey, finalResponse, ttl);

            } catch (e: any) {
                console.error("Stream Error:", e);
                // If we already started the stream, we can't change the status code.
                try {
                    await safeWrite(`]}`); // Try to close valid JSON even if empty
                } catch (innerErr) {
                    // Ignore failure to write the closing bracket if connection is dead
                }
            }
        });
    } catch (e: any) {
        console.error("Cache Error:", e);
        return c.json({ error: "Internal Server Error" }, 500);
    }
});

// Scan Receipt Endpoint (OpenAI)
app.post("/make-server-37f42386/scan-receipt", async (c) => {
    try {
        const body = await c.req.parseBody();
        const file = body['file'];

        if (!file || !(file instanceof File)) {
            return c.json({ error: "No file uploaded" }, 400);
        }

        const apiKey = Deno.env.get("OPENAI_API_KEY");
        if (!apiKey) return c.json({ error: "OpenAI API Key not configured" }, 500);

        const openai = new OpenAI({ apiKey });
        
        const arrayBuffer = await file.arrayBuffer();
        const base64Image = `data:${file.type};base64,${Buffer.from(arrayBuffer).toString('base64')}`;

        const prompt = `Analyze this receipt image. It is a Jamaican receipt.
        Jamaica EXCLUSIVELY uses DD/MM/YYYY date format. NEVER interpret dates as MM/DD/YYYY.
        
        Extract the following details in JSON format:
        - merchant (string, name of the store/service. For tolls, use the Highway name e.g. Highway 2000, East-West, North-South)
        - date (YYYY-MM-DD. The receipt date is in DD/MM/YYYY format. The FIRST number is ALWAYS the day, the SECOND is ALWAYS the month. Example: "01/12/2025" on the receipt = 1st December 2025 = output "2025-12-01".)
        - time (HH:MM:SS, 24-hour format. Look for the time of transaction.)
        - amount (number, total amount. Remove currency symbols.)
        - type (string, one of: 'Fuel', 'Service', 'Toll', 'Other'. Infer from context. If it mentions tolls, highway, plaza, etc. use 'Toll'.)
        - notes (string, brief description of items)
        
        If it is a Toll receipt, specifically extract these additional fields if present:
        - plaza (string, e.g. Portmore East, Spanish Town, Angels, Vineyards)
        - lane (string, e.g. K15, M01)
        - vehicleClass (string, e.g. 1, 2)
        - receiptNumber (string, the Ticket No or No)
        - collector (string, e.g. 613893)

        Return ONLY the JSON object, no markdown.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are a receipt scanning assistant that outputs strict JSON." },
                { 
                  role: "user", 
                  content: [
                      { type: "text", text: prompt },
                      { type: "image_url", image_url: { url: base64Image } }
                  ] 
                }
            ],
            response_format: { type: "json_object" },
            temperature: 0
        });

        const content = response.choices[0].message.content;
        const data = JSON.parse(content || "{}");

        return c.json({ success: true, data });

    } catch (e: any) {
        console.error("Receipt Scan Error:", e);
        return c.json({ error: e.message }, 500);
    }
});

// Fleet Equipment Endpoints
app.get("/make-server-37f42386/fleet/equipment/all", async (c) => {
    try {
        const { data, error } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "equipment:%");

        if (error) throw error;
        const equipment = data?.map((d: any) => d.value) || [];
        return c.json(equipment);
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post("/make-server-37f42386/fleet/equipment/bulk", async (c) => {
    try {
        const items = await c.req.json();
        if (!Array.isArray(items)) {
            return c.json({ error: "Expected array of items" }, 400);
        }
        
        // Key format: equipment:{vehicleId}:{itemId}
        // Ensure keys match this format
        const keys = items.map((item: any) => `equipment:${item.vehicleId}:${item.id}`);
        await kv.mset(keys, items);
        
        return c.json({ success: true, count: items.length });
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Inventory Endpoints
app.get("/make-server-37f42386/inventory", async (c) => {
    try {
        const { data, error } = await supabase
            .from("kv_store_37f42386")
            .select("value")
            .like("key", "inventory:%");

        if (error) throw error;
        const inventory = data?.map((d: any) => d.value) || [];
        return c.json(inventory);
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post("/make-server-37f42386/inventory", async (c) => {
    try {
        const item = await c.req.json();
        if (!item.id) item.id = crypto.randomUUID();
        await kv.set(`inventory:${item.id}`, item);
        return c.json({ success: true, data: item });
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post("/make-server-37f42386/inventory/bulk", async (c) => {
    try {
        const items = await c.req.json();
        if (!Array.isArray(items)) return c.json({ error: "Expected array" }, 400);
        
        const keys = items.map((i: any) => `inventory:${i.id}`);
        await kv.mset(keys, items);
        return c.json({ success: true, count: items.length });
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Templates Endpoints
app.get("/make-server-37f42386/templates", async (c) => {
    try {
        const templates = await kv.getByPrefix("template:equipment:");
        return c.json(templates || []);
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post("/make-server-37f42386/templates", async (c) => {
    try {
        const t = await c.req.json();
        if (!t.id) t.id = crypto.randomUUID();
        await kv.set(`template:equipment:${t.id}`, t);
        return c.json({ success: true, data: t });
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});


// Weekly Check-Ins Endpoints - Optimized
app.get("/make-server-37f42386/check-ins", async (c) => {
  try {
    const driverId = c.req.query("driverId");
    const weekStart = c.req.query("weekStart");
    const limit = parseInt(c.req.query("limit") || "100");
    
    let query = supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "checkin:%");
    
    if (driverId) query = query.eq("value->>driverId", driverId);
    if (weekStart) query = query.eq("value->>weekStart", weekStart);
    
    const { data, error } = await query
        .order("value->>timestamp", { ascending: false })
        .limit(limit);

    if (error) throw error;
    const checkIns = data?.map((d: any) => d.value) || [];
    return c.json(checkIns);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/check-ins", async (c) => {
  try {
    const checkIn = await c.req.json();
    if (!checkIn.driverId || !checkIn.weekStart || !checkIn.odometer) {
        return c.json({ error: "Missing required fields" }, 400);
    }

    // Validation for Manual Override
    if (checkIn.method === 'manual_override' && !checkIn.manualReadingReason) {
        return c.json({ error: "Reason required for manual override" }, 400);
    }
    
    // Key: checkin:{id}
    const key = `checkin:${checkIn.id}`;
    
    // Log manual overrides for review
    if (checkIn.method === 'manual_override') {
        console.warn(`[Alert] Manual Odometer Override by Driver ${checkIn.driverId}: ${checkIn.odometer}km. Reason: ${checkIn.manualReadingReason}`);
        // In a real system, we might create a 'notification' object here for the fleet manager
    }

    await kv.set(key, { ...checkIn, timestamp: new Date().toISOString() });
    
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/check-ins/review", async (c) => {
  try {
    const { checkInId, status, managerNotes } = await c.req.json();
    
    if (!checkInId || !status) {
        return c.json({ error: "Missing checkInId or status" }, 400);
    }

    const key = `checkin:${checkInId}`;
    const checkIn = await kv.get(key);
    
    if (!checkIn) {
        return c.json({ error: "Check-in not found" }, 404);
    }

    // Update status
    checkIn.reviewStatus = status; // 'approved' | 'rejected'
    checkIn.verified = (status === 'approved');
    checkIn.managerNotes = managerNotes;
    checkIn.reviewedAt = new Date().toISOString();

    await kv.set(key, checkIn);
    return c.json({ success: true, data: checkIn });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/check-ins/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`checkin:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/maintenance-logs/:vehicleId/:id", async (c) => {
  const vehicleId = c.req.param("vehicleId");
  const id = c.req.param("id");
  try {
    await kv.del(`maintenance_log:${vehicleId}:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/fuel-entries/:id", async (c) => {
    const id = c.req.param("id");
    try {
        await kv.del(`fuel_entry:${id}`);
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// --- PERSISTENT ALERTS (Phase 1) ---

app.get("/make-server-37f42386/notifications/list", async (c) => {
    try {
        const userId = c.req.query("userId");
        const vehicleId = c.req.query("vehicleId");
        
        // Use kv.getByPrefix for reliable retrieval (avoids unsupported JSON path ordering)
        let alerts: any[] = await kv.getByPrefix("alert:");

        // Filter in-memory if optional query params are provided
        if (userId) alerts = alerts.filter((a: any) => a.driverId === userId);
        if (vehicleId) alerts = alerts.filter((a: any) => a.vehicleId === vehicleId);

        // Sort newest-first by timestamp
        alerts.sort((a: any, b: any) => {
            const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return tb - ta;
        });

        return c.json(alerts);
    } catch (e: any) {
        console.log("Error listing persistent alerts:", e.message);
        return c.json({ error: e.message }, 500);
    }
});

app.post("/make-server-37f42386/notifications/push", async (c) => {
    try {
        const alert = await c.req.json();
        if (!alert.id) alert.id = crypto.randomUUID();
        if (!alert.timestamp) alert.timestamp = new Date().toISOString();
        alert.isRead = false;

        // Key: alert:{id}
        await kv.set(`alert:${alert.id}`, alert);
        return c.json({ success: true, data: alert });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post("/make-server-37f42386/notifications/acknowledge", async (c) => {
    try {
        const { id, isDismissed } = await c.req.json();
        const alert = await kv.get(`alert:${id}`);
        if (!alert) return c.json({ error: "Alert not found" }, 404);

        if (isDismissed) {
            await kv.del(`alert:${id}`);
        } else {
            alert.isRead = true;
            await kv.set(`alert:${id}`, alert);
        }
        
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Mount Fuel Controller for missing endpoints
app.route("/", fuelApp);

// ---------------------------------------------------------------------------
// Global handler for unhandled promise rejections caused by client disconnects.
// Deno.serve's `onError` only catches errors thrown INSIDE the handler.
// Broken-pipe errors during response body streaming (`respondWith`) surface as
// unhandled rejections at the runtime level — suppress them here so they don't
// pollute the logs.
// ---------------------------------------------------------------------------
globalThis.addEventListener("unhandledrejection", (e) => {
  const err = e.reason;
  const msg = err instanceof Error ? err.message : String(err);
  const name = (err as any)?.name || "";
  const code = (err as any)?.code || "";

  const isConnectionError =
    msg.includes("broken pipe") ||
    msg.includes("connection closed") ||
    msg.includes("connection reset") ||
    msg.includes("message completed") ||
    name === "Http" ||
    name === "BrokenPipe" ||
    name === "BadResource" ||
    code === "EPIPE" ||
    code === "ECONNRESET";

  if (isConnectionError) {
    e.preventDefault(); // Suppress — client simply disconnected
    return;
  }
  // Let other unhandled rejections propagate normally
});

Deno.serve({
  onError: (e) => {
    const msg = e instanceof Error ? e.message : String(e);
    const name = (e as any)?.name || '';
    const isConnectionError =
        msg.includes("broken pipe") ||
        msg.includes("connection closed") ||
        msg.includes("message completed") ||
        name === "Http" ||
        name === "BrokenPipe" ||
        name === "BadResource" ||
        (e as any).code === "EPIPE" ||
        (e as any).code === "ECONNRESET";

    if (isConnectionError) {
        // Silently handle client disconnects — this is normal when responses
        // are large or the client navigates away before transfer completes.
        return new Response(null, { status: 499 });
    }
    console.error(e);
    return new Response("Internal Server Error", { status: 500 });
  }
}, app.fetch);
