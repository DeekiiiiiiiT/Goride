/**
 * Supabase CLI entry for Edge Function `make-server-37f42386`.
 * The real server calls `Deno.serve` at module load — import `index.tsx` last so side effects run.
 *
 * Deploy (from repo root):
 *   npx supabase functions deploy make-server-37f42386 --use-api
 *
 * Explicit imports: the CLI packager sometimes omits modules when only pulled
 * in transitively from `index.tsx` (remote bundle then fails with "Module not found").
 */
import "../../../apps/fleet/src/supabase/functions/server/toll_controller.tsx";
import "../../../apps/fleet/src/supabase/functions/server/maintenance_schedule_engine.ts";
import "../../../apps/fleet/src/supabase/functions/server/normalize_platform.ts";
import "../../../apps/fleet/src/supabase/functions/server/period_share_cash.ts";
import "../../../apps/fleet/src/supabase/functions/server/driver_period_settlement.ts";
import "../../../apps/fleet/src/supabase/functions/server/index.tsx";
