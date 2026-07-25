/**
 * Fleet Operations Service — strangler-fig extraction target.
 *
 * Phase 3: shared CORS, health, extraction-status, and register* hooks imported
 * from `_fleet-server` (live traffic still on make-server-37f42386).
 *
 * Cutover order: fuel → toll → claims → driver pay → retire shim.
 * See docs/fleet-monolith-extraction.md
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { applyCors } from "../_shared/corsAllowlist.ts";
// Extracted register hooks — modules resolve from new home; mount when cutover starts.
import { registerMaintenanceRoutes } from "../_fleet-server/maintenance_routes.ts";
import { registerExpenseHubRoutes } from "../_fleet-server/expense_hub_routes.ts";

const app = new Hono();

applyCors(app);

app.get("/health", (c) => c.json({ service: "fleet-ops", status: "ok" }));

app.get("/v1/extraction-status", (c) =>
  c.json({
    phase: 3,
    sourceOfTruth: "supabase/functions/_fleet-server/",
    shim: "make-server-37f42386",
    fleetOpsMounted: false,
    registerHooksAvailable: {
      maintenance: typeof registerMaintenanceRoutes === "function",
      expenseHub: typeof registerExpenseHubRoutes === "function",
    },
    domains: {
      maintenance: { liveOn: "make-server-37f42386", module: "_fleet-server/maintenance_routes.ts", cutover: "pending" },
      expenseHub: { liveOn: "make-server-37f42386", module: "_fleet-server/expense_hub_routes.ts", cutover: "pending" },
      fuel: { liveOn: "make-server-37f42386", nextCutover: 1 },
      toll: { liveOn: "make-server-37f42386", nextCutover: 2 },
      claims: { liveOn: "make-server-37f42386", nextCutover: 3 },
      driverPay: { liveOn: "make-server-37f42386", nextCutover: 4 },
    },
    cutoverOrder: ["fuel", "toll", "claims", "driverPay", "retire-shim"],
  }),
);

Deno.serve(app.fetch);
