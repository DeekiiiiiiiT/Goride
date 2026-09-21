/**
 * Peeled from index.tsx — Wave F0. Behavior unchanged.
 */
import type { Hono } from "npm:hono@4.3.11";
import * as kv from "./kv_store.tsx";
import * as fuelLogic from "./fuel_logic.ts";
import { fromKvStore } from "./fleet_sql_bridge.ts";
import { requireAuth, requirePermission, requirePlatformStaff } from "./rbac_middleware.ts";
import { stampOrg } from "./org_scope.ts";

export function registerFuelAuditRoutes(app: Hono) {
  // --- FUEL AUDIT DASHBOARD (Phase 6) — platform staff only (Evidence Bridge Phase 0) ---
  app.get("/make-server-37f42386/admin/fuel-audit/summary", requireAuth({ strict: true }), requirePlatformStaff(), async (c) => {
      try {
          const { data: txData } = await fromKvStore()
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

  app.get("/make-server-37f42386/admin/fuel-audit/flagged", requireAuth({ strict: true }), requirePlatformStaff(), async (c) => {
      try {
          const { data: txData } = await fromKvStore()
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

  app.post("/make-server-37f42386/admin/fuel-audit/resolve", requireAuth({ strict: true }), requirePlatformStaff(), async (c) => {
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

          await kv.set(`transaction:${transactionId}`, stampOrg(tx, c));
          return c.json({ success: true });
      } catch (e: any) {
          return c.json({ error: e.message }, 500);
      }
  });

  // Capacity-cycle history re-score — fleet owners (data.backfill) + platform staff
  app.post("/make-server-37f42386/admin/fuel-audit/recalculate-all", requireAuth({ strict: true }), requirePermission('data.backfill'), async (c) => {
      try {
          const body = await c.req.json().catch(() => ({}));
          const vehicleFilterRaw = String(body?.vehicleId || body?.licensePlate || "").trim();
          console.log("[Recalculate] Starting history recalculation (capacity full @ 98% spine)...", vehicleFilterRaw ? `filter=${vehicleFilterRaw}` : "fleet-wide");

          // Load configurable frequency threshold
          const auditConfig = await kv.get("config:audit_settings");
          const frequencyThreshold = Number(auditConfig?.frequencyThreshold) || 3;
          // Phase 21: configurable efficiency variance threshold (default 30%)
          const efficiencyThreshold = Number(auditConfig?.efficiencyThreshold) || 0.30;

          // 1. Fetch all Vehicles (for Tank Capacity)
          const { data: vehicleData } = await fromKvStore()
              .select("value")
              .like("key", "vehicle:%");

          const vehicleMap = new Map();
          const plateToId = new Map<string, string>();
          (vehicleData || []).forEach((d: any) => {
              const v = d.value;
              if (v && v.id) {
                  vehicleMap.set(v.id, {
                      capacity: fuelLogic.resolveTankCapacity(v),
                      fuelEconomy: Number(v.specifications?.fuelEconomy) || Number(v.fuelSettings?.efficiencyCity) || 0,
                      estimatedRangeMin: Number(v.specifications?.estimatedRangeMin) || 0,
                      licensePlate: String(v.licensePlate || v.plate || "").toUpperCase(),
                  });
                  const plate = String(v.licensePlate || v.plate || "").toUpperCase().replace(/\s+/g, "");
                  if (plate) plateToId.set(plate, v.id);
              }
          });
          console.log(`[Recalculate] Loaded ${vehicleMap.size} vehicles.`);

          // Optional scope: UUID or license plate (e.g. 5179KZ)
          let filterVehicleId: string | null = null;
          if (vehicleFilterRaw) {
              const normalized = vehicleFilterRaw.toUpperCase().replace(/\s+/g, "");
              if (vehicleMap.has(vehicleFilterRaw)) {
                  filterVehicleId = vehicleFilterRaw;
              } else if (plateToId.has(normalized)) {
                  filterVehicleId = plateToId.get(normalized)!;
              } else if (vehicleMap.has(normalized)) {
                  filterVehicleId = normalized;
              } else {
                  return c.json({ error: `Vehicle not found for filter: ${vehicleFilterRaw}` }, 404);
              }
              console.log(`[Recalculate] Scoped to vehicleId=${filterVehicleId}`);
          }

          // 2. Fetch all Transactions
          const { data: txData, error: txError } = await fromKvStore()
              .select("value")
              .like("key", "transaction:%");

          if (txError) throw txError;

          const allTransactions = (txData || []).map((d: any) => d.value);
          let fuelTransactions = allTransactions.filter((t: any) => t.category === 'Fuel' || t.category === 'Fuel Reimbursement');
          if (filterVehicleId) {
              fuelTransactions = fuelTransactions.filter((t: any) => t.vehicleId === filterVehicleId);
          }

          console.log(`[Recalculate] Processing ${fuelTransactions.length} fuel transactions...`);

          // 3. Group by Vehicle
          const byVehicle = new Map<string, any[]>();
          fuelTransactions.forEach((tx: any) => {
              const vId = tx.vehicleId || 'unknown';
              if (filterVehicleId && vId !== filterVehicleId) return;
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
              let currentCycleId = fuelLogic.isStableCycleId(txs[0]?.metadata?.cycleId)
                  ? (txs[0].metadata.cycleId as string)
                  : fuelLogic.mintCycleId();
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

                  // Capacity full + SPLIT via shared classifyAnchor (98%). Reimbursements never anchor.
                  const anchor = fuelLogic.classifyAnchor({
                      prevCumulative,
                      volume,
                      tankCapacity: capacity,
                      entryType: tx.type || tx.metadata?.entryType,
                      paymentSource: tx.paymentSource || tx.metadata?.paymentSource,
                  });
                  const isSoftAnchor = anchor.isSoft;
                  const isCapacityClose = anchor.isCapacityClose;
                  const isAnchor = anchor.isAnchor;
                  const volumeContributed = anchor.volumeContributed;
                  const excessVolume = anchor.excessVolume;
                  const percentOfTank = anchor.percentOfTank;
                  // Align running cumulative with classify result before integrity checks
                  runningCumulative = anchor.totalVolumeInCycle;

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
                      isCapacityClose: isCapacityClose || undefined,
                      isFullTank: isCapacityClose || undefined,
                      isAnchor: isAnchor,
                      isHardAnchor: undefined,
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
                      currentCycleId = fuelLogic.resolveNextCycleIdAfterAnchor(txs[i + 1], currentCycleId);
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
          const { data: entryData, error: entryError } = await fromKvStore()
              .select("key, value")
              .like("key", "fuel_entry:%");

          if (entryError) {
              console.log(`[Recalculate] Warning: Could not load fuel entries: ${entryError.message}`);
          }

          const allEntriesRaw = (entryData || []).map((d: any) => ({ _kvKey: d.key, ...d.value }));
          const allEntries = filterVehicleId
              ? allEntriesRaw.filter((e: any) => e.vehicleId === filterVehicleId)
              : allEntriesRaw;
          console.log(`[Recalculate] Found ${allEntries.length} fuel entries to re-score${filterVehicleId ? ` (scoped)` : ''}.`);

          // Group fuel entries by vehicle
          const entriesByVehicle = new Map<string, any[]>();
          allEntries.forEach((entry: any) => {
              const vId = entry.vehicleId || 'unknown';
              if (filterVehicleId && vId !== filterVehicleId) return;
              if (!entriesByVehicle.has(vId)) entriesByVehicle.set(vId, []);
              entriesByVehicle.get(vId)!.push(entry);
          });

          const entryUpdates: any[] = [];
          let entryModifiedCount = 0;

          for (const [vId, entries] of entriesByVehicle.entries()) {
              const vehicleInfo = vehicleMap.get(vId);
              if (!vehicleInfo || vehicleInfo.capacity <= 0) continue;
              const vehicle = await kv.get(`vehicle:${vId}`);
              if (!vehicle) continue;

              const { modified } = await recalculateVehicleFuelEntries(
                  entries,
                  vehicle as Record<string, unknown>,
                  auditConfig,
              );
              for (const entry of modified) {
                  entryUpdates.push(entry);
              }
              entryModifiedCount += modified.length;
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
              vehicleId: filterVehicleId || undefined,
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

  // Phase 0 / S9: idempotent service-line re-resolve (never overwrites explicit).
  // Heals T0/T2/T4 gaps the T3-only SQL backfill left in Unattributed.
  app.post(
    "/make-server-37f42386/admin/fuel-audit/re-resolve-service-lines",
    requireAuth({ strict: true }),
    requirePermission("data.backfill"),
    async (c) => {
      try {
        const body = (await c.req.json().catch(() => ({}))) as {
          organizationId?: string;
          limit?: number;
          /** When true (default), only null-source or unattributed rows — S9 backlog heal. */
          onlyBacklog?: boolean;
          /** Also heal expense_journal rows (default true). */
          includeExpenseJournal?: boolean;
          dryRun?: boolean;
        };
        const orgFilter = String(body.organizationId || "").trim();
        const limit = Math.min(Math.max(Number(body.limit) || 5000, 1), 20000);
        const onlyBacklog = body.onlyBacklog !== false;
        const includeExpenseJournal = body.includeExpenseJournal !== false;
        const dryRun = body.dryRun === true;

        const { reResolveCostRowServiceLine } = await import("./service_line_attribution.ts");

        type PrefixSpec = { prefix: string; keyOf: (row: Record<string, unknown>) => string };
        const specs: PrefixSpec[] = [
          {
            prefix: "fuel_entry:",
            keyOf: (row) => `fuel_entry:${String(row.id)}`,
          },
        ];
        if (includeExpenseJournal) {
          specs.push({
            prefix: "expense_journal:",
            keyOf: (row) => `expense_journal:${String(row.id)}`,
          });
        }

        let scanned = 0;
        let changed = 0;
        let skippedExplicit = 0;
        let skippedNotBacklog = 0;
        const CHUNK = 50;
        const pendingKeys: string[] = [];
        const pendingVals: Record<string, unknown>[] = [];

        const flush = async () => {
          if (!pendingKeys.length || dryRun) {
            pendingKeys.length = 0;
            pendingVals.length = 0;
            return;
          }
          await kv.mset(pendingKeys.splice(0), pendingVals.splice(0));
        };

        for (const spec of specs) {
          if (scanned >= limit) break;
          const entries =
            ((await kv.getByPrefix(spec.prefix)) as Record<string, unknown>[]) || [];
          for (const raw of entries) {
            if (scanned >= limit) break;
            if (!raw || typeof raw !== "object") continue;
            if (orgFilter) {
              const oid = String(raw.organizationId ?? raw.organization_id ?? "");
              if (oid !== orgFilter) continue;
            }
            scanned++;
            const src = raw.service_line_source ?? raw.serviceLineSource;
            if (src === "explicit") {
              skippedExplicit++;
              continue;
            }
            if (onlyBacklog) {
              const isBacklog =
                src == null ||
                src === "" ||
                src === "unattributed" ||
                (raw.service_line == null && raw.serviceLine == null);
              if (!isBacklog) {
                skippedNotBacklog++;
                continue;
              }
            }
            const result = await reResolveCostRowServiceLine(raw);
            if (!result.changed) continue;
            changed++;
            const stamped = stampOrg(result.record, c) as Record<string, unknown>;
            pendingKeys.push(spec.keyOf(stamped));
            pendingVals.push(stamped);
            if (pendingKeys.length >= CHUNK) await flush();
          }
        }
        await flush();

        return c.json({
          success: true,
          scanned,
          changed,
          skippedExplicit,
          skippedNotBacklog,
          onlyBacklog,
          includeExpenseJournal,
          dryRun,
          organizationId: orgFilter || undefined,
        });
      } catch (e: any) {
        console.error("re-resolve-service-lines Error:", e);
        return c.json({ error: e.message }, 500);
      }
    },
  );

}
