/**
 * WRA-31 alerts proof on a LOCAL Supabase copy (made-up data only).
 * Skipped unless RECON_LOCAL_DB=1 (see recon_one_truth.test.ts).
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const enabled = (() => {
  try {
    return Deno.env.get("RECON_LOCAL_DB") === "1";
  } catch {
    return false;
  }
})();

Deno.test({
  name: "alerts: raise once, refresh, resolve, SMS step recorded (local DB)",
  ignore: !enabled,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { getServiceClient } = await import("./service_client.ts");
    const { syncOrgAlerts, escalateOrgAlerts } = await import("./recon_alerts.ts");
    const recon = getServiceClient().schema("recon");
    const orgId = `test-org-${crypto.randomUUID()}`;
    const { data: run, error: runErr } = await recon.from("week_runs").insert({
      organization_id: orgId, service_line: "rideshare", week_key: "2026-09-21", state: "collecting", main_line: "rideshare",
    }).select("id, version").single();
    if (runErr) throw new Error(runErr.message);

    // A calculation that failed 3 times, and an approval request waiting 25 hours.
    const { error: uErr } = await recon.from("projection_state").insert({
      organization_id: orgId, unit_kind: "driver_week", week_key: "2026-09-21", driver_id: "d1", status: "failed", attempts: 3,
    });
    if (uErr) throw new Error(uErr.message);
    const { error: rErr } = await recon.from("run_events").insert({
      run_id: run!.id, actor: "accountant", kind: "approval_request", payload: { action: "close" },
      prepared_by: "accountant", status: "pending_approval", version_at_send: run!.version,
      at: new Date(Date.now() - 25 * 3_600_000).toISOString(),
    });
    if (rErr) throw new Error(rErr.message);

    const first = await syncOrgAlerts(orgId);
    const keys = first.map((a) => a.dedupeKey).sort();
    assert(keys.includes("unit_failed"), "failed calculation raises an alert");
    assert(keys.includes("approval_waiting"), "approval waiting > 24 h raises an alert");

    await syncOrgAlerts(orgId);
    const { data: open } = await recon.from("alerts").select("id, dedupe_key").eq("organization_id", orgId).is("resolved_at", null);
    assertEquals((open ?? []).filter((a) => a.dedupe_key === "unit_failed").length, 1, "no duplicate on the next pass");

    // Fixed → resolved on the next pass.
    await recon.from("projection_state").update({ status: "fresh" }).eq("organization_id", orgId);
    await syncOrgAlerts(orgId);
    const { data: failedAlert } = await recon.from("alerts").select("resolved_at").eq("organization_id", orgId).eq("dedupe_key", "unit_failed").single();
    assert(failedAlert!.resolved_at, "resolved once the calculation is fixed");

    // 24 h unacknowledged → manager SMS step is recorded (this test org has no managers or phones).
    await recon.from("alerts").update({ raised_at: new Date(Date.now() - 25 * 3_600_000).toISOString() })
      .eq("organization_id", orgId).eq("dedupe_key", "approval_waiting");
    const steps = await escalateOrgAlerts(orgId);
    assertEquals(steps, 1);
    const { data: escalated } = await recon.from("alerts").select("sms_manager_at, sms_status").eq("organization_id", orgId).eq("dedupe_key", "approval_waiting").single();
    assert(escalated!.sms_manager_at, "manager step stamped");
    assertEquals(escalated!.sms_status, "manager: no mobile number on file");
    assertEquals(await escalateOrgAlerts(orgId), 0, "each step is sent once");
  },
});
