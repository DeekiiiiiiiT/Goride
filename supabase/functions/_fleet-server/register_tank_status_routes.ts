/**
 * Peeled from index.tsx — Wave F0. Behavior unchanged.
 */
import type { Hono } from "npm:hono@4.3.11";
import * as kv from "./kv_store.tsx";
import * as fuelLogic from "./fuel_logic.ts";
import { fromKvStore } from "./fleet_sql_bridge.ts";
import { requireAuth } from "./rbac_middleware.ts";

export function registerTankStatusRoutes(app: Hono) {
  // --- VEHICLE TANK STATUS (Phase 4) ---
  app.get("/make-server-37f42386/vehicles/:id/tank-status", requireAuth(), async (c) => {
      try {
          const vehicleId = c.req.param("id");

          // 1. Get Vehicle for Capacity
          const vehicle = await kv.get(`vehicle:${vehicleId}`);
          if (!vehicle) return c.json({ error: "Vehicle not found" }, 404);

          const tankCapacity = fuelLogic.resolveTankCapacity(vehicle);

          // 2. Get Last Transactions to calculate current cumulative
          const { data: lastTxData } = await fromKvStore()
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
              if (tx.metadata?.isCapacityClose || tx.metadata?.isAnchor || tx.metadata?.isSoftAnchor || tx.metadata?.isFullTank) {
                  // Fills after this close already summed; spillover starts the open cycle
                  cumulative += Number(tx.metadata?.excessVolume) || 0;
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
              status: tankCapacity <= 0 ? 'No Tank Capacity' :
                      cumulative > (tankCapacity * 1.05) ? 'Critical: Tank Overflow' : 
                      cumulative >= (tankCapacity * 0.98) ? 'Capacity Full Ready' :
                      cumulative > (tankCapacity * 0.85) ? 'Approaching Capacity' : 'Normal',
              isAnomaly: tankCapacity > 0 && cumulative > (tankCapacity * 1.05)
          });
      } catch (e: any) {
          return c.json({ error: e.message }, 500);
      }
  });

}
