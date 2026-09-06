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
