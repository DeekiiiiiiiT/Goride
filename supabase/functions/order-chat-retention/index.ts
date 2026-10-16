/**
 * Retention purge for order_messages — call via cron with service role.
 * Uses public.purge_order_messages_retention(days).
 * Days from enterprise.privacy.retention.chatDays (query ?days= overrides).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternalSecret } from "../_shared/requireInternalSecret.ts";
import { getSetting } from "../_shared/rushSettings/getSetting.ts";

type DataRetention = {
  deliveryPhotosDays: number;
  chatDays: number;
  gpsTrailDays: number;
  receiptsDays: number;
  exportRoles: string[];
  dataRequestEmail: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const denied = requireInternalSecret(req, {
    headerNames: ["x-fleet-cron-secret", "x-service-role"],
    envKeys: ["FLEET_CRON_SECRET", "SUPABASE_SERVICE_ROLE_KEY"],
  });
  if (denied) return denied;

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const retention = await getSetting<DataRetention>("enterprise.privacy.retention", {
    supabase: sb,
  });
  const url = new URL(req.url);
  const override = Number(url.searchParams.get("days"));
  const configured = Number(retention?.chatDays) || 365;
  const days = Math.min(
    3650,
    Math.max(1, Number.isFinite(override) && override > 0 ? override : configured),
  );

  const { data, error } = await sb.rpc("purge_order_messages_retention", { p_days: days });
  if (error) {
    console.error("[order-chat-retention]", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  console.log("[order-chat-retention] purged", data, "days=", days);
  return Response.json({
    ok: true,
    deleted: data,
    days,
    source: Number.isFinite(override) && override > 0 ? "query" : "enterprise.privacy.retention",
  });
});
