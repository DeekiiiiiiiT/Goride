import { createClient } from "npm:@supabase/supabase-js@2";
import { formatSupabaseError } from "../_shared/formatSupabaseError.ts";
import { requireInternalSecret } from "../_shared/requireInternalSecret.ts";
import { runCatalogResearchWorker } from "../_fleet-server/catalog_research_worker.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }
  const denied = requireInternalSecret(req, {
    envKeys: ["FLEET_CRON_SECRET", "CRON_SECRET"],
    headerNames: ["X-Fleet-Cron-Secret"],
  });
  if (denied) return denied;

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return new Response(JSON.stringify({ error: "misconfigured" }), { status: 500 });
  }
  const supabase = createClient(url, key);

  try {
    const result = await runCatalogResearchWorker(supabase);
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = formatSupabaseError(e);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
