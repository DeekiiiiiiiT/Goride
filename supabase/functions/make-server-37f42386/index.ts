/**
 * Supabase CLI entry for Edge Function `make-server-37f42386`.
 * The real server calls `Deno.serve` at module load — import `index.tsx` last so side effects run.
 *
 * Deploy (from repo root):
 *   npx supabase functions deploy make-server-37f42386 --use-api
 *
 * Explicit `toll_controller` import: the CLI packager sometimes omits this module when only
 * pulled in transitively from `index.tsx` (remote bundle then fails with "Module not found").
 */
import "../../../src/supabase/functions/server/toll_controller.tsx";
import "../../../src/supabase/functions/server/index.tsx";
