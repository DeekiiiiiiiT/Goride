import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decideClaimResolutionSync,
  mapResolutionReasonToTollResolution,
} from "./claim_resolution_sync.ts";

/**
 * Policy matrix for the Claimable Loss reversible resolution sync. Each case
 * pins one real transition an admin can trigger via the UI (Charge Driver /
 * Write Off / Reimbursed dropdown, or reverting a claim off Resolved).
 * Run: deno test claim_resolution_sync.test.ts
 */

Deno.test("mapResolutionReasonToTollResolution — all mappings", () => {
  assertEquals(mapResolutionReasonToTollResolution("Charge Driver"), "personal");
  assertEquals(mapResolutionReasonToTollResolution("Write Off"), "write_off");
  assertEquals(mapResolutionReasonToTollResolution("Reimbursed"), "refunded");
  assertEquals(mapResolutionReasonToTollResolution("Other"), null);
  assertEquals(mapResolutionReasonToTollResolution(undefined), null);
});

Deno.test("no change (same reason resaved) → full no-op, idempotent", () => {
  const r = decideClaimResolutionSync({ prevReason: "Charge Driver", nextReason: "Charge Driver" });
  assertEquals(r.isNoop, true);
  assertEquals(r.shouldReverse, false);
  assertEquals(r.shouldCharge, false);
  assertEquals(r.nextLedgerResolution, "personal");
});

Deno.test("unresolved → Charge Driver: charge only, no reversal", () => {
  const r = decideClaimResolutionSync({ prevReason: undefined, nextReason: "Charge Driver" });
  assertEquals(r.isNoop, false);
  assertEquals(r.shouldReverse, false);
  assertEquals(r.shouldCharge, true);
  assertEquals(r.nextLedgerResolution, "personal");
});

Deno.test("Reimbursed → Charge Driver: charge only (no prior charge to reverse)", () => {
  const r = decideClaimResolutionSync({ prevReason: "Reimbursed", nextReason: "Charge Driver" });
  assertEquals(r.shouldReverse, false);
  assertEquals(r.shouldCharge, true);
  assertEquals(r.nextLedgerResolution, "personal");
});

Deno.test("Write Off → Charge Driver: charge only", () => {
  const r = decideClaimResolutionSync({ prevReason: "Write Off", nextReason: "Charge Driver" });
  assertEquals(r.shouldReverse, false);
  assertEquals(r.shouldCharge, true);
});

Deno.test("Charge Driver → Write Off: reverse the active charge, no new charge", () => {
  const r = decideClaimResolutionSync({ prevReason: "Charge Driver", nextReason: "Write Off" });
  assertEquals(r.isNoop, false);
  assertEquals(r.shouldReverse, true);
  assertEquals(r.shouldCharge, false);
  assertEquals(r.nextLedgerResolution, "write_off");
});

Deno.test("Charge Driver → Reimbursed: reverse, no new charge", () => {
  const r = decideClaimResolutionSync({ prevReason: "Charge Driver", nextReason: "Reimbursed" });
  assertEquals(r.shouldReverse, true);
  assertEquals(r.shouldCharge, false);
  assertEquals(r.nextLedgerResolution, "refunded");
});

Deno.test("Charge Driver → unresolved (reverted off Resolved): reverse + clear label", () => {
  const r = decideClaimResolutionSync({ prevReason: "Charge Driver", nextReason: undefined });
  assertEquals(r.shouldReverse, true);
  assertEquals(r.shouldCharge, false);
  assertEquals(r.nextLedgerResolution, null);
});

Deno.test("the flip-flop cycle: Charge Driver -> Write Off -> Charge Driver re-charges cleanly", () => {
  const step1 = decideClaimResolutionSync({ prevReason: "Charge Driver", nextReason: "Write Off" });
  assertEquals(step1.shouldReverse, true);
  assertEquals(step1.shouldCharge, false);

  const step2 = decideClaimResolutionSync({ prevReason: "Write Off", nextReason: "Charge Driver" });
  assertEquals(step2.shouldReverse, false);
  assertEquals(step2.shouldCharge, true);
});

Deno.test("Write Off → Reimbursed: neither reverse nor charge (no money ever moved)", () => {
  const r = decideClaimResolutionSync({ prevReason: "Write Off", nextReason: "Reimbursed" });
  assertEquals(r.shouldReverse, false);
  assertEquals(r.shouldCharge, false);
  assertEquals(r.nextLedgerResolution, "refunded");
});
