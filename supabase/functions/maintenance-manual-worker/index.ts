/**
 * Maintenance manual worker (rebuild step 3) — cron / service-role only.
 *
 *   POST /functions/v1/maintenance-manual-worker/run
 *
 * Reads the pages of an owner's manual that are queued, one model call per page, a few pages per run and always
 * inside a time budget, so a 300-page manual never has to finish inside one request. The reader is the
 * `manual_reader` setting (`maintenance_manual:settings`): DeepSeek by default, with Gemini reading a page in the
 * same attempt when DeepSeek fails. The database job private.invoke_maintenance_manual_worker (every minute) is
 * the normal caller; a service-role caller may also press it.
 *
 * Door: `authorizeCronOrServiceRole` (the same check the other cron jobs use). `verify_jwt = false` is set in
 * supabase/config.toml because the cron header is not a JWT; that shared helper is the lock.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeCronOrServiceRole } from "../_shared/authorizeCronOrServiceRole.ts";
import { r2FromEnv } from "../_shared/objectStorage/r2Client.ts";
import { checkProviderGuards } from "../_fleet-server/api_usage_logger.ts";
import { createManualJobDb } from "../_fleet-server/maintenance_manual_job_db.ts";
import {
  callDeepSeekManualPageReader,
  callGeminiManualPageReader,
  createManualPageReader,
  MANUAL_READ_MODEL,
  pageAnswerIsEmpty,
} from "../_fleet-server/maintenance_manual_reader.ts";
import { loadManualSettings } from "../_fleet-server/maintenance_manual_settings.ts";
import { runMaintenanceManualWorker } from "../_fleet-server/maintenance_manual_worker.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const auth = await authorizeCronOrServiceRole(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const op = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  if (op !== "run") return json({ error: "Unknown operation" }, 404);

  const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const key = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!url || !key) return json({ error: "server_misconfigured" }, 500);

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // No R2 keys means the file cannot be read; the worker then waits instead of burning a page's attempts.
  let store: ReturnType<typeof r2FromEnv> | null = null;
  try {
    store = r2FromEnv();
  } catch (err) {
    console.error("[maintenance-manual-worker] R2 not configured", err);
  }

  // Which reader reads the pages is a setting, read fresh each run; the default is DeepSeek.
  const settings = await loadManualSettings();

  try {
    const result = await runMaintenanceManualWorker({
      now: () => new Date(),
      jobDb: createManualJobDb(supabase),
      store,
      readPage: createManualPageReader({
        choice: settings.manual_reader,
        gemini: callGeminiManualPageReader(Deno.env.get("GEMINI_API_KEY")),
        deepseek: callDeepSeekManualPageReader(Deno.env.get("DEEPSEEK_API_KEY")),
        answeredNothing: pageAnswerIsEmpty,
      }),
      // Pause the run for the provider that actually reads the pages (a Gemini budget pause must not stop a
      // DeepSeek run, and the other way round). Each page re-checks its own provider anyway.
      checkGuards: () => checkProviderGuards(settings.manual_reader),
      model: MANUAL_READ_MODEL,
    });

    console.log(
      "[maintenance-manual-worker] " +
        JSON.stringify({
          reader: settings.manual_reader,
          skipped: result.skipped,
          pagesRead: result.pagesRead,
          pagesFailed: result.pagesFailed,
          rowsWritten: result.rowsWritten,
          stopped: result.stopped,
        }),
    );

    return json({ success: true, reader: settings.manual_reader, ...result });
  } catch (err) {
    console.error("[maintenance-manual-worker] run failed", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
