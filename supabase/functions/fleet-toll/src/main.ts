/**
 * fleet-toll — toll HTTP surface: tags / plazas / toll info and the new toll system (imports, commands,
 * matcher sweep). The old toll system is removed (docs/toll-old-system-removal-audit.md).
 * Built exclusively via createFleetFunction (ADR-0020).
 */
import { reconWeekVersionGuard } from "../../_fleet-server/recon_week_version_guard.ts";
import { createFleetFunction } from "../../_shared/edgeKernel.ts";
import tollInventoryApp from "../../_fleet-server/toll_inventory_controller.tsx";
import tollV2CommandApp from "../../_fleet-server/toll_v2_command_controller.ts";
import tollV2ImportApp, { handleMatcherSweep } from "../../_fleet-server/toll_v2_import_controller.ts";
import { createServiceRpcFromModule } from "../../_fleet-server/toll_v2_import_lookups.ts";

const app = createFleetFunction({
  slug: "fleet-toll",
  pathStyle: "slug",
  // Tags, plazas and toll info; the new toll system's imports and commands are mounted below.
  domainApp: tollInventoryApp,
  registerParentRoutes: (parent) => {
    // WRA-27: opt-in week-version check (header x-recon-week) for Week Reconciliation changes.
    parent.use("*", reconWeekVersionGuard);
    // Register before the tags/plazas app (domainApp, mounted last). It requires a user
    // login on every path, and a later route never runs once that gate answers.
    parent.post("/internal/toll-matcher-sweep", async (c) => {
      const rpc = await createServiceRpcFromModule();
      try {
        const reports = await handleMatcherSweep(rpc);
        return c.json({ reports });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[fleet-toll] toll-matcher-sweep failed", msg);
        return c.json({ error: msg }, 500);
      }
    });

    parent.route("/", tollV2ImportApp);
    parent.route("/", tollV2CommandApp);
  },
});

export default app;
