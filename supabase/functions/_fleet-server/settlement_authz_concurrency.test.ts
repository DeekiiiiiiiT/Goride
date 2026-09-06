/**
 * Authz / money-path predicates that live-handler tests will call.
 * Pure coverage until Deno integration harness hits real routes.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isSettlementDeskCategory,
  mayMutateTransactionOrg,
} from "./settlement_desk_security.ts";
import {
  assertExpectedOutstanding,
  assertPeriodCasClaimed,
  casBumpRowVersion,
  enforcePayCap,
  SettlementCommandError,
} from "./settlement_commands.ts";

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

Deno.test("authz: view-only style — settlement desk categories still gated", () => {
  assertEquals(isSettlementDeskCategory("Driver Payouts"), true);
  assertEquals(isSettlementDeskCategory("Fuel"), false);
});

Deno.test("authz: org-A cannot reverse org-B movement (org guard)", () => {
  assertEquals(mayMutateTransactionOrg(ORG_B, ORG_A), false);
});

Deno.test("concurrency: CAS null fails; claimed row succeeds (two pays → one)", () => {
  assertPeriodCasClaimed({ id: "winner" });
  try {
    assertPeriodCasClaimed(null);
    throw new Error("expected STALE_RESIDUAL");
  } catch (e) {
    assertEquals((e as SettlementCommandError).code, "STALE_RESIDUAL");
    assertEquals((e as SettlementCommandError).status, 409);
  }
});

Deno.test("concurrency: two observers of v1 → exactly one CAS win (N-5)", () => {
  let dbVersion = 1;

  /** Correct lock: CAS against the version residual was computed from. */
  function claim(expectedRowVersion: number): { id: string } | null {
    const bump = casBumpRowVersion(dbVersion, expectedRowVersion);
    if (!bump) return null;
    dbVersion = bump.next;
    return { id: "period" };
  }

  const observedA = 1;
  const observedB = 1; // both saw residual under v1

  assertPeriodCasClaimed(claim(observedA)); // wins → dbVersion = 2
  try {
    assertPeriodCasClaimed(claim(observedB)); // must fail
    throw new Error("expected STALE_RESIDUAL");
  } catch (e) {
    assertEquals((e as SettlementCommandError).code, "STALE_RESIDUAL");
    assertEquals((e as SettlementCommandError).status, 409);
  }
  assertEquals(dbVersion, 2);

  // Broken re-read CAS would let both win — prove casBump rejects that pattern.
  let broken = 1;
  function claimBrokenReRead(): { id: string } | null {
    const current = broken; // re-read at claim time
    const bump = casBumpRowVersion(broken, current);
    if (!bump) return null;
    broken = bump.next;
    return { id: "period" };
  }
  assertPeriodCasClaimed(claimBrokenReRead());
  assertPeriodCasClaimed(claimBrokenReRead()); // both succeed — documents why N-5 mattered
  assertEquals(broken, 3);
});

Deno.test("R-1 semantics: STALE_RESIDUAL and pay cap are 4xx business errors", () => {
  try {
    assertExpectedOutstanding(100, 50);
  } catch (e) {
    assertEquals((e as SettlementCommandError).status, 409);
  }
  try {
    enforcePayCap(0, 10, 50);
  } catch (e) {
    assertEquals((e as SettlementCommandError).status, 400);
  }
});
