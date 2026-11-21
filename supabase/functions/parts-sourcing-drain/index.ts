import { createClient } from "npm:@supabase/supabase-js@2";
import { formatSupabaseError } from "../_shared/formatSupabaseError.ts";
import { timingSafeEqual } from "../_shared/timingSafeEqual.ts";
import { runPartsSourcingDrain } from "../_fleet-server/parts_sourcing_drain.ts";

function drainSecretDenied(req: Request): Response | null {
  const expected = (Deno.env.get("PARTS_SOURCING_DRAIN_SECRET") || "").trim();
  if (!expected) {
    console.error("[parts-sourcing-drain] PARTS_SOURCING_DRAIN_SECRET missing");
    return new Response(JSON.stringify({ error: "misconfigured" }), { status: 500 });
  }
  const provided = (req.headers.get("X-Parts-Sourcing-Drain-Secret") || "").trim();
  if (!provided || !timingSafeEqual(provided, expected)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }
  const denied = drainSecretDenied(req);
  if (denied) return denied;

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return new Response(JSON.stringify({ error: "misconfigured" }), { status: 500 });
  }
  const supabase = createClient(url, key);

  try {
    const result = await runPartsSourcingDrain(supabase);
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