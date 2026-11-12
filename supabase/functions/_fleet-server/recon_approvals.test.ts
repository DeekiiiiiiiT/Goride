/**
 * Round 2b-2 approvals proof on a LOCAL Supabase copy (made-up data only).
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
  name: "approvals: state moves, two approvers at once, append-only, legacy weeks (local DB)",
  ignore: !enabled,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { getServiceClient } = await import("./service_client.ts");
    const { isLegacyCleanupWeek } = await import("./recon_week_change.ts");
    const recon = getServiceClient().schema("recon");
    const orgId = `test-org-${crypto.randomUUID()}`;
    const { data: run, error: runErr } = await recon.from("week_runs").insert({
      organization_id: orgId, service_line: "rideshare", week_key: "2026-09-21", state: "collecting", main_line: "rideshare",
    }).select("id, version").single();
    if (runErr) throw new Error(runErr.message);

    const newRequest = async () => {
      const { data, error } = await recon.from("run_events").insert({
        run_id: run!.id, actor: "accountant", kind: "approval_request",
        payload: { action: "close", params: {} }, prepared_by: "accountant",
        status: "pending_approval", version_at_send: run!.version,
      }).select("id").single();
      if (error) throw new Error(error.message);
      return data!.id;
    };

    // Two approvers press Approve at the same moment: exactly one move succeeds.
    const req = await newRequest();
    const approve = () => recon.from("run_events").update({ status: "approved", approved_by: "manager" })
      .eq("id", req).in("status", ["pending_approval"]).select("id");
    const [a, b] = await Promise.all([approve(), approve()]);
    assertEquals((a.data?.length ?? 0) + (b.data?.length ?? 0), 1, "first wins, second gets APPROVAL_GONE");

    // Approved cannot go back, and no other column may change.
    const back = await recon.from("run_events").update({ status: "pending_approval" }).eq("id", req).select("id");
    assert(back.error, "approved → pending refused by the trigger");
    const edit = await recon.from("run_events").update({ reason: "changed" }).eq("id", req).select("id");
    assert(edit.error, "editing a logged row is refused");

    // pending → stale → withdrawn is allowed; stale → approved is not.
    const req2 = await newRequest();
    assert(!(await recon.from("run_events").update({ status: "stale" }).eq("id", req2)).error);
    assert((await recon.from("run_events").update({ status: "approved", approved_by: "m" }).eq("id", req2)).error);
    assert(!(await recon.from("run_events").update({ status: "withdrawn" }).eq("id", req2)).error);

    // Legacy clean-up weeks are recognised (they refuse reopen).
    assertEquals(await isLegacyCleanupWeek(orgId, "rideshare", "2026-09-21"), false);
    const { error: legErr } = await recon.from("run_events").insert({
      run_id: run!.id, actor: "system", kind: "legacy_cleanup", payload: {}, status: "applied",
    });
    if (legErr) throw new Error(legErr.message);
    assertEquals(await isLegacyCleanupWeek(orgId, "rideshare", "2026-09-21"), true);
  },
});
