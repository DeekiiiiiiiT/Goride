/**
 * Retention purge for order_messages — call via cron with service role.
 * Uses public.purge_order_messages_retention(days).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternalSecret } from "../_shared/requireInternalSecret.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const denied = requireInternalSecret(req, {
    headerNames: ["x-fleet-cron-secret", "x-service-role"],
    envKeys: ["FLEET_CRON_SECRET", "SUPABASE_SERVICE_ROLE_KEY"],
  });
  if (denied) return denied;

  const url = new URL(req.url);
  const days = Math.min(365, Math.max(7, Number(url.searchParams.get("days") || 90)));

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await sb.rpc("purge_order_messages_retention", { p_days: days });
  if (error) {
    console.error("[order-chat-retention]", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  console.log("[order-chat-retention] purged", data, "days=", days);
  return Response.json({ ok: true, deleted: data, days });
});
