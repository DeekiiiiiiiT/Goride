/**
 * Cron door for Driver Activity ingest / drift / backfill.
 * verify_jwt=false — auth is X-Fleet-Cron-Secret only (same pattern as finance-recon).
 * Proxies to fleet-core with service_role JWT.
 * Path: /functions/v1/fleet-core/internal/activity/* (fleet-core rewrites to make-server prefix).
 */
import { requireInternalSecret } from "../_shared/requireInternalSecret.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-fleet-cron-secret, x-rides-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const denied = requireInternalSecret(req, {
    envKeys: ["FLEET_CRON_SECRET", "RIDES_CRON_SECRET", "CRON_SECRET"],
    headerNames: ["X-Fleet-Cron-Secret", "X-Rides-Cron-Secret"],
  });
  if (denied) {
    const body = await denied.text();
    return new Response(body, {
      status: denied.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  let targetPath = "/internal/activity/ingest";
  let body = '{"lanes":"rides,presence,delivery,admin"}';

  if (path.endsWith("/drift-check") || url.searchParams.has("day")) {
    const day = url.searchParams.get("day") || "";
    targetPath = `/internal/activity/drift-check${day ? `?day=${encodeURIComponent(day)}` : ""}`;
    body = "{}";
  } else if (path.endsWith("/backfill")) {
    targetPath = "/internal/activity/backfill";
    body = "{}";
  }

  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const cronSecret = Deno.env.get("FLEET_CRON_SECRET") ||
    Deno.env.get("RIDES_CRON_SECRET") ||
    Deno.env.get("CRON_SECRET") ||
    "";

  if (!base || !serviceKey) {
    return new Response(JSON.stringify({ error: "missing_supabase_env" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const upstream = await fetch(`${base}/functions/v1/fleet-core${targetPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "X-Fleet-Cron-Secret": cronSecret,
    },
    body,
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      ...corsHeaders,
      "Content-Type": upstream.headers.get("Content-Type") || "application/json",
    },
  });
});
