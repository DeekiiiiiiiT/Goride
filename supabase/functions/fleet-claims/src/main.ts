/**
 * fleet-claims — claims HTTP surface (ADR-0021 F3 scaffold).
 * Built exclusively via createFleetFunction (ADR-0020).
 */
import { reconWeekVersionGuard } from "../../_fleet-server/recon_week_version_guard.ts";
import { createFleetFunction } from "../../_shared/edgeKernel.ts";
import claimsApp from "../../_fleet-server/claims_controller.tsx";

const app = createFleetFunction({
  slug: "fleet-claims",
  pathStyle: "slug",
  domainApp: claimsApp,
  registerParentRoutes: (parent) => {
    // WRA-27: Charge Driver on a toll creates its charge here, so it gets the same
    // opt-in week-version check (header x-recon-week) as fleet-toll / fuel / pay.
    parent.use("*", reconWeekVersionGuard);
  },
});

export default app;
