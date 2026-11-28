/**
 * fleet-ops — maintenance + expense hub (ADR-0021 F2).
 * Built exclusively via createFleetFunction (ADR-0020).
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { createFleetFunction } from "../../_shared/edgeKernel.ts";
import {
  registerMaintenanceManualRoutes,
  registerMaintenanceRoutes,
} from "../../_fleet-server/maintenance/index.ts";
import { registerExpenseHubRoutes } from "../../_fleet-server/expense_hub_routes.ts";
import { registerBusinessFinanceRoutes } from "../../_fleet-server/business_finance_week_read.ts";
import { requireServiceKey } from "../../_shared/serviceKey.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  requireServiceKey(),
);

const app = createFleetFunction({
  slug: "fleet-ops",
  pathStyle: "slug",
  registerParentRoutes: (parent) => {
    registerMaintenanceRoutes(parent, supabase);
    // Step 3: the owner's manual reader.
    registerMaintenanceManualRoutes(parent, supabase);
    registerExpenseHubRoutes(parent);
    registerBusinessFinanceRoutes(parent);
  },
});

export default app;
