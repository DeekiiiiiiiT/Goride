/**
 * Daily purge of expired ephemeral scan evidence.
 * Invoke via Supabase cron or: POST .../internal/evidence-cleanup with X-Fleet-Cron-Secret
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as kv from "../../../apps/fleet/src/supabase/functions/server/kv_store.tsx";
import { runEvidenceCleanup } from "../../../apps/fleet/src/supabase/functions/server/evidence_storage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fleet-cron-secret, x-rides-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const secret = Deno.env.get("FLEET_CRON_SECRET") || Deno.env.get("RIDES_CRON_SECRET");
  const headerSecret = req.headers.get("X-Fleet-Cron-Secret") || req.headers.get("X-Rides-Cron-Secret");
  if (!secret || headerSecret !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "true";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const result = await runEvidenceCleanup(supabase, kv, { dryRun });
    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
