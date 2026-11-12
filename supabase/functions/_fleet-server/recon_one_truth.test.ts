/**
 * Round 2a "one truth" proof on a LOCAL Supabase copy (made-up data only).
 * Skipped unless RECON_LOCAL_DB=1 with SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 * pointing at `npx supabase start`.
 *
 * One seeded week with blocking rows: the week list count, the step rail, each
 * step's count, the desk's closeCheck and the close workflow's gate all agree,
 * and the desk publish keeps the driver rows it does not own.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const enabled = (() => {
  try {
    return Deno.env.get("RECON_LOCAL_DB") === "1";
  } catch {
    return false; // CI runs without env access: the local-DB proof is skipped there.
  }
})();

Deno.test({
  name: "one truth: week list = step rail = steps = closeCheck = close gate (local DB)",
  ignore: !enabled,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { getServiceClient } = await import("./service_client.ts");
    const { publishWeekDesk } = await import("./recon_routes.ts");
    const { listWeekBlocks } = await import("./recon_week_blockers.ts");
    const { countBlockersForStep } = await import("../../../packages/finance-core/src/closeBlockerSteps.ts");
    const { requiredSourcesMissing } = await import("./recon_desk_shape.ts");

    const sb = getServiceClient();
    const recon = sb.schema("recon");
    const orgId = crypto.randomUUID();
    const driverId = `test-driver-${orgId.slice(0, 8)}`;
    const W0 = "2026-09-14"; // closed in the money record → adopted
    const W1 = "2026-09-21"; // open, earlier than W2
    const W2 = "2026-09-28"; // the week under test

    const must = (label: string, r: { error: { message: string } | null }) => {
      if (r.error) throw new Error(`${label}: ${r.error.message}`);
    };

    const { data: owner, error: ownerErr } = await sb.auth.admin.createUser({
      email: `recon-one-truth-${orgId.slice(0, 8)}@example.test`,
      password: crypto.randomUUID(),
      email_confirm: true,
    });
    if (ownerErr || !owner?.user) throw new Error(`owner: ${ownerErr?.message}`);
    must("org", await sb.from("organizations").insert({
      id: orgId,
      name: "Round 2a one-truth test org",
      service_lines: ["rideshare"],
      owner_id: owner.user.id,
    }));
    for (const [week, closed] of [[W0, true], [W1, false], [W2, false]] as const) {
      const end = new Date(Date.parse(`${week}T00:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10);
      must(`period ${week}`, await sb.from("driver_financial_periods").insert({
        organization_id: orgId,
        driver_id: driverId,
        period_anchor: week,
        period_end: end,
        status: closed ? "closed" : "open",
        closed_at: closed ? "2026-10-27T17:16:29Z" : null,
      }));
    }
    must("unit", await recon.from("projection_state").insert({
      organization_id: orgId,
      unit_kind: "driver_week",
      week_key: W2,
      driver_id: driverId,
      status: "fresh",
      inputs_hash: "seed",
      computed_at: new Date(Date.now() - 120_000).toISOString(),
      updated_at: new Date(Date.now() - 120_000).toISOString(),
    }));
    // A driver row the desk publish does NOT own (written by the driver's own unit).
    must("driver blocker", await recon.from("week_blockers").insert({
      organization_id: orgId,
      week_key: W2,
      service_line: "rideshare",
      driver_id: driverId,
      code: "FUEL_STATEMENT_MISSING",
      severity: "block",
      fingerprint: `FUEL_STATEMENT_MISSING:${driverId}:`,
      message: "Fuel statement missing (seed)",
    }));

    // WRA-13 + WRA-39: the calculator creates the weeks and adopts the money close.
    must("ensure", await recon.rpc("ensure_ended_week_runs", { p_org: orgId }));
    const { data: runs } = await recon.from("week_runs")
      .select("id, week_key, state, version, desk_snapshot, main_line")
      .eq("organization_id", orgId).order("week_key");
    const byWeek = new Map((runs ?? []).map((r) => [String(r.week_key).slice(0, 10), r]));
    assert(byWeek.has(W0) && byWeek.has(W1) && byWeek.has(W2), "runs created for every ended week");
    assertEquals(byWeek.get(W0)!.state, "closed", "closed money week is adopted");
    assertEquals(byWeek.get(W1)!.state, "collecting");
    assertEquals(byWeek.get(W2)!.main_line, "rideshare");
    const { count: adopted } = await recon.from("run_events")
      .select("id", { count: "exact", head: true })
      .eq("run_id", byWeek.get(W0)!.id).eq("kind", "adopt_period_close");
    assertEquals(adopted, 1);

    // Build + publish the desk for W2 with the real server code.
    const versionBefore = Number(byWeek.get(W2)!.version);
    const payload = await publishWeekDesk(orgId, "rideshare", W2, "test");
    assert(payload, "desk built");
    const p = payload as unknown as {
      run: { version: number };
      steps: Array<{ id: string; actionable: number; hidden: boolean }>;
      closeCheck: { status: string; blockers: Array<{ code: string; severity: string }> };
      sources: Array<{ id: string; requirement: string; status: string }>;
      calculator: { paused: boolean };
    };
    assertEquals(p.run.version, versionBefore + 1, "publish bumps the version once");

    const { data: stored } = await recon.from("week_runs").select("version, desk_snapshot").eq("id", byWeek.get(W2)!.id).single();
    assertEquals(Number(stored!.version), p.run.version);
    const snapshot = stored!.desk_snapshot as typeof p;
    assertEquals(snapshot.steps.map((s) => [s.id, s.actionable, s.hidden]), p.steps.map((s) => [s.id, s.actionable, s.hidden]));

    // run_steps = the desk's steps.
    const { data: stepRows } = await recon.from("run_steps").select("step_id, actionable, hidden").eq("run_id", byWeek.get(W2)!.id);
    for (const step of p.steps) {
      const row = (stepRows ?? []).find((r) => r.step_id === step.id);
      assert(row, `run_steps has ${step.id}`);
      assertEquals([row!.actionable, row!.hidden], [step.actionable, step.hidden], step.id);
    }

    // week_blockers: the driver row survives; the whole-week rows include "close in order".
    const { data: blockerRows } = await recon.from("week_blockers")
      .select("code, severity, driver_id")
      .eq("organization_id", orgId).eq("week_key", W2).eq("service_line", "rideshare");
    const codes = (blockerRows ?? []).map((r) => r.code).sort();
    assert(codes.includes("FUEL_STATEMENT_MISSING"), "driver row kept");
    assert(codes.includes("EARLIER_WEEK_OPEN"), "WRA-40: earlier open week is a stored blocker");

    // closeCheck = the stored rows (same codes, same count).
    assertEquals(p.closeCheck.status, "ok");
    assertEquals(p.closeCheck.blockers.map((b) => b.code).sort(), codes);

    // Step counts = countBlockersForStep over the same rows.
    const stepOf = (id: string) => p.steps.find((s) => s.id === id)!;
    const blocking = p.closeCheck.blockers;
    assertEquals(stepOf("close").actionable, countBlockersForStep("close", blocking));
    assert(stepOf("close").actionable >= 1, "close step counts EARLIER_WEEK_OPEN");
    assert(stepOf("fuel").actionable >= countBlockersForStep("fuel", blocking));

    // Close workflow gate reads the same rows.
    const gate = await listWeekBlocks(orgId, W2, "rideshare");
    assertEquals(gate.length, blocking.filter((b) => b.severity === "block").length);

    // Week list count = Upload inputs step count.
    const { data: srcRows } = await recon.from("run_sources").select("source_id, requirement, status").eq("run_id", byWeek.get(W2)!.id);
    const listCount = requiredSourcesMissing((srcRows ?? []).map((r) => ({ requirement: r.requirement, status: r.status })));
    assertEquals(listCount, stepOf("sources").actionable);
    assertEquals(listCount, requiredSourcesMissing(p.sources));

    // Publishing again does not duplicate whole-week rows.
    await publishWeekDesk(orgId, "rideshare", W2, "test");
    const { data: again } = await recon.from("week_blockers").select("code").eq("organization_id", orgId).eq("week_key", W2);
    assertEquals((again ?? []).filter((r) => r.code === "EARLIER_WEEK_OPEN").length, 1);
  },
});
