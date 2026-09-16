/**
 * fleet-claims — claims HTTP surface (ADR-0021 F3 scaffold).
 * Built exclusively via createFleetFunction (ADR-0020).
 */
import { createFleetFunction } from "../../_shared/edgeKernel.ts";
import claimsApp from "../../_fleet-server/claims_controller.tsx";

const app = createFleetFunction({
  slug: "fleet-claims",
  pathStyle: "slug",
  domainApp: claimsApp,
});

export default app;
