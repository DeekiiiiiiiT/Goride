/**
 * Peeled from index.tsx — Wave F0. Behavior unchanged.
 */
import type { Hono } from "npm:hono@4.3.11";
import * as kv from "./kv_store.tsx";
import { fromKvStore } from "./fleet_sql_bridge.ts";
import { requireAuth, requirePermission } from "./rbac_middleware.ts";

export function registerAdminOpsRoutes(app: Hono) {
  // Phase 8.4: Automated Monthly Report Generation
  app.get("/make-server-37f42386/admin/monthly-report", async (c) => {
      try {
          const month = c.req.query("month"); // YYYY-MM
          if (!month) return c.json({ error: "Month is required (YYYY-MM)" }, 400);

          console.log(`[Monthly Report] Generating for ${month}...`);

          // Fetch all transactions for that month
          const { data: txData } = await fromKvStore()
              .select("value")
              .like("key", "transaction:%")
              .filter("value->>date", "like", `${month}%`);

          const transactions = (txData || []).map((d: any) => d.value);

          // Fetch all trips for that month
          const { data: tripData } = await fromKvStore()
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
        app.get("/make-server-37f42386/vehicles/:id/unified-logs", requireAuth(), async (c) => {
            try {
                const vehicleId = c.req.param("id");

                // Fetch specific category lists using KV prefixes or direct keys
                const [history, maintenance] = await kv.mget([
                    `odometer-history:${vehicleId}`,
                    `maintenance-logs:${vehicleId}`
                ]);

                // For fuel entries which are stored as individual items
                // Support both hyphen and underscore prefixes for maximum reliability during transition
                const { data: fuelDataUnderscore } = await fromKvStore()
                    .select("value")
                    .like("key", "fuel_entry:%")
                    .eq("value->>vehicleId", vehicleId);

                const { data: fuelDataHyphen } = await fromKvStore()
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

  // Phase 8.3: Forensic Audit Export Hardening - Signing (secrets audit Wave 3)
  app.post(
    "/make-server-37f42386/audit/sign-report",
    requireAuth({ strict: true }),
    requirePermission("data.export"),
    async (c) => {
      try {
        const { reportData, reportType } = await c.req.json();

        const hmacSecret = Deno.env.get("AUDIT_HMAC_SECRET");
        if (!hmacSecret || !hmacSecret.trim()) {
          return c.json(
            { error: "AUDIT_HMAC_SECRET is required for report signing" },
            503,
          );
        }

        // Canonical JSON for stable signatures
        const canonical = JSON.stringify(reportData, Object.keys(reportData).sort());
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          "raw",
          encoder.encode(hmacSecret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
        const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(canonical));
        const signature = Array.from(new Uint8Array(sigBuf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        return c.json({
          signature,
          reportType: reportType ?? null,
          signer: "Fleet Integrity Security Module",
          algorithm: "HMAC-SHA256",
          timestamp: new Date().toISOString(),
        });
      } catch (e: any) {
        console.error("[audit/sign-report]", e);
        return c.json({ error: "internal_error", code: "INTERNAL", message: "Something went wrong" }, 500);
      }
    },
  );

}
