/**
 * Daily purge of expired ephemeral scan evidence.
 * Invoke via Supabase cron or: POST .../internal/evidence-cleanup with X-Fleet-Cron-Secret
 * Retention days from enterprise.privacy.retention.deliveryPhotosDays (reader).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as kv from "../_fleet-server/kv_store.tsx";
import { runEvidenceCleanup } from "../_fleet-server/evidence_storage.ts";
import { requireInternalSecret } from "../_shared/requireInternalSecret.ts";
import { getSetting } from "../_shared/rushSettings/getSetting.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fleet-cron-secret, x-rides-cron-secret",
};

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
    return new Response("ok", { headers: corsHeaders });
  }

  const denied = requireInternalSecret(req, {
    envKeys: ["FLEET_CRON_SECRET", "RIDES_CRON_SECRET"],
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
  const dryRun = url.searchParams.get("dryRun") === "true";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const retention = await getSetting<DataRetention>("enterprise.privacy.retention", {
      supabase,
    });
    const retentionDays = Math.max(1, Number(retention?.deliveryPhotosDays) || 90);
    const result = await runEvidenceCleanup(supabase, kv, { dryRun });
    return new Response(JSON.stringify({
      success: true,
      ...result,
      retentionDays,
      retentionSource: "enterprise.privacy.retention",
    }), {
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
