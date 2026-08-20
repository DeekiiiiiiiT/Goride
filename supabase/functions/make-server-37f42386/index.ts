/**
 * Supabase CLI entry for Edge Function `make-server-37f42386`.
 * Source of truth is now `supabase/functions/_fleet-server/`.
 * This shim still boots Deno.serve via `index.tsx` — do not delete until cutover is complete.
 *
 * Deploy (from repo root):
 *   npx supabase functions deploy make-server-37f42386 --use-api
 *
 * Explicit imports: the CLI packager sometimes omits modules when only pulled
 * in transitively from `index.tsx` (remote bundle then fails with "Module not found").
 */
import "../_fleet-server/toll_controller.tsx";
import "../_fleet-server/fuel_pnl_offset.ts";
import "../_fleet-server/maintenance_schedule_engine.ts";
import "../_fleet-server/normalize_platform.ts";
import "../_fleet-server/period_share_cash.ts";
import "../_fleet-server/driver_period_settlement.ts";
import "../_fleet-server/fleet_admin_storage_routes.ts";
import "../_fleet-server/fleet_sql_bridge.ts";
import "../_fleet-server/fleet_select.ts";
import "../_fleet-server/supabase_platform_usage.ts";
import "../_fleet-server/api_command_center.tsx";
import "../../../apps/fleet/src/utils/businessTransactionAccounting.ts";
import "../../../apps/fleet/src/utils/fixedExpenseOccurrences.ts";
import "../_fleet-server/index.tsx";
