/**
 * fleet-ops — maintenance + expense hub (ADR-0021 F2).
 * Built exclusively via createFleetFunction (ADR-0020).
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { createFleetFunction } from "../../_shared/edgeKernel.ts";
import { registerMaintenanceRoutes } from "../../_fleet-server/maintenance_routes.ts";
import { registerExpenseHubRoutes } from "../../_fleet-server/expense_hub_routes.ts";
import { registerBusinessFinanceRoutes } from "../../_fleet-server/business_finance_week_read.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const app = createFleetFunction({
  slug: "fleet-ops",
  pathStyle: "slug",
  registerParentRoutes: (parent) => {
    registerMaintenanceRoutes(parent, supabase);
    registerExpenseHubRoutes(parent);
    registerBusinessFinanceRoutes(parent);
  },
});

export default app;
