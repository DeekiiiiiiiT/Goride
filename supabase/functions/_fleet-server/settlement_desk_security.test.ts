import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  filterPeriodsByOrganizationId,
  isSettlementDeskCategory,
  mayMutateTransactionOrg,
} from "./settlement_desk_security.ts";

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

Deno.test("S1-1: settlement desk categories are gated", () => {
  assertEquals(isSettlementDeskCategory("Driver Payouts"), true);
  assertEquals(isSettlementDeskCategory("Cash Collection"), true);
  assertEquals(isSettlementDeskCategory("Cash Write Off"), true);
  assertEquals(isSettlementDeskCategory("Float Issue"), true);
  assertEquals(isSettlementDeskCategory("Adjustment"), true);
  assertEquals(isSettlementDeskCategory("Fuel"), false);
  assertEquals(isSettlementDeskCategory("insurance"), false);
  assertEquals(isSettlementDeskCategory(null), false);
});

Deno.test("S1-2b: org-A cannot mutate org-B transaction", () => {
  assertEquals(mayMutateTransactionOrg(ORG_B, ORG_A), false);
  assertEquals(mayMutateTransactionOrg(ORG_A, ORG_A), true);
  assertEquals(mayMutateTransactionOrg(ORG_A, null), true); // platform
  assertEquals(mayMutateTransactionOrg(null, ORG_A), true); // legacy
  assertEquals(mayMutateTransactionOrg("roam-default-org", ORG_A), true);
});

Deno.test("S1-3: reconciled periods filter by organizationId", () => {
  const rows = [
    { id: "1", organizationId: ORG_A },
    { id: "2", organizationId: ORG_B },
    { id: "3", organizationId: ORG_A },
  ];
  const forA = filterPeriodsByOrganizationId(rows, ORG_A);
  assertEquals(forA.map((r) => r.id), ["1", "3"]);
  const forB = filterPeriodsByOrganizationId(rows, ORG_B);
  assertEquals(forB.map((r) => r.id), ["2"]);
  assertEquals(forB.some((r) => r.organizationId === ORG_A), false);
});
