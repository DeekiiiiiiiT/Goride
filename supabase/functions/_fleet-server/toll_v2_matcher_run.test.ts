import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runTollMatcher, type TollRpc } from "./toll_v2_matcher_run.ts";

function mockRpc(steps: Array<{ fn: string; data?: unknown; error?: { message: string } | null }>): TollRpc {
  let i = 0;
  return async (fn: string) => {
    const step = steps[i++];
    if (!step || step.fn !== fn) {
      throw new Error(`unexpected rpc ${fn} at step ${i}`);
    }
    if (step.error) return { data: null, error: step.error };
    return { data: step.data ?? null, error: null };
  };
}

Deno.test("matcher run: empty claim stops immediately", async () => {
  const rpc = mockRpc([{ fn: "toll_sys_match_claim", data: { claim_id: null } }]);
  const report = await runTollMatcher(rpc, "org-a");
  assertEquals(report.rounds, 0);
  assertEquals(report.queueLeft, false);
});

Deno.test("matcher run: two rounds then empty", async () => {
  const rpc = mockRpc([
    {
      fn: "toll_sys_match_claim",
      data: {
        claim_id: "claim-1",
        focal: { charge_ids: ["c1"], payback_ids: [] },
        charges: [],
        paybacks: [],
        trips: [],
        settings: [],
      },
    },
    { fn: "toll_sys_match_store", data: { status: "stored", new: 1, unchanged: 0, replaced: 0, withdrawn: 0, skipped: 0 } },
    {
      fn: "toll_sys_match_claim",
      data: {
        claim_id: "claim-2",
        focal: { charge_ids: ["c2"], payback_ids: [] },
        charges: [],
        paybacks: [],
        trips: [],
        settings: [],
      },
    },
    { fn: "toll_sys_match_store", data: { status: "stored", new: 0, unchanged: 1, replaced: 0, withdrawn: 0, skipped: 0 } },
    { fn: "toll_sys_match_claim", data: { claim_id: null } },
  ]);
  const report = await runTollMatcher(rpc, "org-a");
  assertEquals(report.rounds, 2);
  assertEquals(report.stored.new, 1);
  assertEquals(report.queueLeft, false);
});

Deno.test("matcher run: claim_gone counted and loop continues", async () => {
  const rpc = mockRpc([
    { fn: "toll_sys_match_claim", data: { claim_id: "claim-1", focal: { charge_ids: [], payback_ids: [] }, charges: [], paybacks: [], trips: [], settings: [] } },
    { fn: "toll_sys_match_store", data: { status: "claim_gone", claim_id: "claim-1" } },
    { fn: "toll_sys_match_claim", data: { claim_id: null } },
  ]);
  const report = await runTollMatcher(rpc, "org-a");
  assertEquals(report.claimGone, 1);
  assertEquals(report.rounds, 1);
});

Deno.test("matcher run: rpc error throws with function name", async () => {
  const rpc = mockRpc([
    { fn: "toll_sys_match_claim", error: { message: "boom" } },
  ]);
  await assertRejects(
    () => runTollMatcher(rpc, "org-a"),
    Error,
    "toll_sys_match_claim: boom",
  );
});

Deno.test("matcher run: maxRounds leaves queueLeft true", async () => {
  const claim = {
    claim_id: "claim-1",
    focal: { charge_ids: ["c1"], payback_ids: [] },
    charges: [],
    paybacks: [],
    trips: [],
    settings: [],
  };
  const rpc = mockRpc([
    { fn: "toll_sys_match_claim", data: claim },
    { fn: "toll_sys_match_store", data: { status: "stored", new: 0, unchanged: 0, replaced: 0, withdrawn: 0, skipped: 0 } },
    { fn: "toll_sys_match_claim", data: claim },
    { fn: "toll_sys_match_store", data: { status: "stored", new: 0, unchanged: 0, replaced: 0, withdrawn: 0, skipped: 0 } },
  ]);
  const report = await runTollMatcher(rpc, "org-a", { maxRounds: 2 });
  assertEquals(report.rounds, 2);
  assertEquals(report.queueLeft, true);
});
