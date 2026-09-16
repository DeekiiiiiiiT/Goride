/**
 * fleet-core — ADR-0021 residual home (successor name for make-server-37f42386).
 * Mounts the same residual registrar; pathStyle maps /fleet-core → /make-server-37f42386.
 * Keep make-server slug live until N-day zero-traffic soak (ADR-0022).
 */
import { createFleetFunction } from "../../_shared/edgeKernel.ts";
import { assertRequiredEnv } from "../../_fleet-server/env_boot.ts";
import { registerResidualMonolithRoutes } from "../../_fleet-server/register_residual_monolith_routes.tsx";
import { extractionStatus } from "../../_shared/extractionStatus.generated.ts";

assertRequiredEnv();

const app = createFleetFunction({
  slug: "fleet-core",
  pathStyle: "fleet-core",
  serve: false,
  registerParentRoutes: (parent) => {
    parent.get("/v1/extraction-status", (c) => c.json(extractionStatus));
    parent.get("/make-server-37f42386/v1/extraction-status", (c) =>
      c.json(extractionStatus),
    );
  },
});

registerResidualMonolithRoutes(app);

Deno.serve({
  onError: (e) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[fleet-core]", msg);
    return new Response("Internal Server Error", { status: 500 });
  },
}, app.fetch);

export default app;
