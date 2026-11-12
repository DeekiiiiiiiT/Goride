/**
 * Round 2b wrapper proof on a LOCAL Supabase copy (made-up data only).
 * Skipped unless RECON_LOCAL_DB=1 (see recon_one_truth.test.ts).
 */
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

const enabled = (() => {
  try {
    return Deno.env.get("RECON_LOCAL_DB") === "1";
  } catch {
    return false; // CI runs without env access: the local-DB proof is skipped there.
  }
})();

function fakeContext(headers: Record<string, string> = {}) {
  return {
    req: { header: (k: string) => headers[k] ?? headers[k.toLowerCase()] },
    json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }),
  } as unknown as import("npm:hono@4.3.11").Context;
}

Deno.test({
  name: "withWeekChange: version check, repeat-safety, closed week, failure log, hold (local DB)",
  ignore: !enabled,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { getServiceClient } = await import("./service_client.ts");
    const { withWeekChange } = await import("./recon_week_change.ts");
    const sb = getServiceClient();
    const recon = sb.schema("recon");
    const orgId = `test-org-${crypto.randomUUID()}`;

    const insertRun = async (week: string, state: string) => {
      const { data, error } = await recon.from("week_runs").insert({
        organization_id: orgId, service_line: "rideshare", week_key: week, state, main_line: "rideshare",
        closed_at: state === "closed" ? new Date().toISOString() : null,
      }).select("id, version").single();
      if (error) throw new Error(error.message);
      return data as { id: string; version: number };
    };
    const run = await insertRun("2026-09-21", "collecting");
    const closed = await insertRun("2026-09-14", "closed");
    let applied = 0;
    const base = { actor: "tester", kind: "test_change", step: "sources", payload: { a: 1 } };

    // 1. Stale version → WEEK_CHANGED, nothing applied, version unchanged.
    const stale = await withWeekChange(fakeContext(), {
      ...base, runId: run.id, expectedVersion: run.version + 5, apply: async () => { applied += 1; },
    });
    assertEquals(stale.kind, "refused");
    assertEquals((stale as { response: Response }).response.status, 409);
    assertEquals(applied, 0);

    // 2. Missing version → VERSION_REQUIRED.
    const noVersion = await withWeekChange(fakeContext(), {
      ...base, runId: run.id, expectedVersion: undefined, apply: async () => { applied += 1; },
    });
    assertEquals((noVersion as { response: Response }).response.status, 400);

    // 3. Applied once; the same Idempotency-Key again is a replay (double-click).
    const key = crypto.randomUUID();
    const ctx = fakeContext({ "x-recon-correlation-id": "corr-1" });
    const first = await withWeekChange(ctx, {
      ...base, runId: run.id, expectedVersion: run.version, idempotencyKey: key, apply: async () => { applied += 1; return "done"; },
    });
    assertEquals(first.kind, "applied");
    assertEquals((first as { version: number }).version, run.version + 1);
    const second = await withWeekChange(ctx, {
      ...base, runId: run.id, expectedVersion: run.version, idempotencyKey: key, apply: async () => { applied += 1; },
    });
    assertEquals(second.kind, "replay");
    assertEquals(applied, 1, "the change ran once");
    const { data: rows } = await recon.from("run_events").select("kind, correlation_id, idempotency_key, version_at_send").eq("run_id", run.id);
    assertEquals((rows ?? []).filter((r) => r.idempotency_key === key).length, 1, "one history row");
    assertEquals((rows ?? [])[0].correlation_id, "corr-1");

    // 4. The 2-minute hold is set.
    const { data: hold } = await recon.from("week_publish_holds").select("hold_until, held_since").eq("run_id", run.id).single();
    assert(Date.parse(String(hold!.hold_until)) > Date.now() + 60_000, "hold ~2 minutes ahead");
    assert(hold!.held_since, "held_since set");

    // 5. A failing change throws and appends a change_failed row.
    await assertRejects(() => withWeekChange(fakeContext(), {
      ...base, runId: run.id, expectedVersion: run.version + 1, apply: async () => { throw new Error("boom"); },
    }), Error, "boom");
    const { data: failed } = await recon.from("run_events").select("kind, payload").eq("run_id", run.id).eq("kind", "change_failed");
    assertEquals((failed ?? []).length, 1);

    // 5b. An approver's direct action is marked self-approved (WRA-32).
    const self = await withWeekChange(fakeContext(), {
      ...base, runId: run.id, expectedVersion: run.version + 2, selfApproved: true, kind: 'source_waived', apply: async () => undefined,
    });
    assertEquals(self.kind, 'applied');
    const { data: selfRow } = await recon.from('run_events').select('self_approved, approved_by').eq('id', (self as { eventId: number }).eventId).single();
    assertEquals([selfRow!.self_approved, selfRow!.approved_by], [true, 'tester']);

    // 6. A closed week refuses ordinary changes.
    const onClosed = await withWeekChange(fakeContext(), {
      ...base, runId: closed.id, expectedVersion: closed.version, apply: async () => { applied += 1; },
    });
    assertEquals((onClosed as { response: Response }).response.status, 409);
    assertEquals(applied, 1);
  },
});
