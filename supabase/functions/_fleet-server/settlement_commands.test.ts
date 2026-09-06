import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  toMinor,
  assertExpectedOutstanding,
  assertPeriodCasClaimed,
  enforcePayCap,
  enforceCollectCap,
  buildMovementRow,
  isSameIdempotencyScope,
  SettlementCommandError,
  companyOwesResidual,
  driverOwesResidual,
} from "./settlement_commands.ts";

Deno.test("toMinor rounds major units to cents", () => {
  assertEquals(toMinor(10), 1000);
  assertEquals(toMinor(10.005), 1001);
  assertEquals(toMinor(10.004), 1000);
  assertEquals(toMinor(228160.87), 22816087);
});

Deno.test("assertExpectedOutstanding accepts within eps", () => {
  assertExpectedOutstanding(100.001, 100);
  assertExpectedOutstanding(50, 50.004);
});

Deno.test("assertExpectedOutstanding throws STALE_RESIDUAL", () => {
  assertThrows(
    () => assertExpectedOutstanding(100, 90),
    SettlementCommandError,
    "Outstanding amount changed",
  );
  try {
    assertExpectedOutstanding(12.5, 12);
  } catch (e) {
    assertEquals((e as SettlementCommandError).code, "STALE_RESIDUAL");
    assertEquals((e as SettlementCommandError).status, 409);
  }
});

Deno.test("assertPeriodCasClaimed fails closed when CAS returns null (concurrent pay)", () => {
  assertPeriodCasClaimed({ id: "period-1" });
  try {
    assertPeriodCasClaimed(null);
    throw new Error("expected throw");
  } catch (e) {
    assertEquals((e as SettlementCommandError).code, "STALE_RESIDUAL");
    assertEquals((e as SettlementCommandError).status, 409);
  }
  // Two writers: first claim wins, second sees null → exactly one success.
  const firstClaim = { id: "a" };
  const secondClaim = null;
  assertPeriodCasClaimed(firstClaim);
  assertThrows(() => assertPeriodCasClaimed(secondClaim), SettlementCommandError);
});

Deno.test("enforcePayCap blocks over-entitlement", () => {
  enforcePayCap(50, 100, 50); // exact remaining ok
  assertThrows(
    () => enforcePayCap(80, 100, 30),
    SettlementCommandError,
    "exceed entitlement",
  );
  try {
    enforcePayCap(0, 10, 0);
  } catch (e) {
    assertEquals((e as SettlementCommandError).code, "INVALID_AMOUNT");
  }
});

Deno.test("enforceCollectCap blocks over-collect without override", () => {
  enforceCollectCap(100, 100);
  assertThrows(
    () => enforceCollectCap(50, 60),
    SettlementCommandError,
    "exceeds amount owed",
  );
});

Deno.test("enforceCollectCap allows over-collect with reason", () => {
  enforceCollectCap(50, 60, true, "driver brought extra cash");
  assertThrows(
    () => enforceCollectCap(50, 60, true, "  "),
    SettlementCommandError,
    "requires a reason",
  );
});

Deno.test("residual helpers split company vs driver owes", () => {
  assertEquals(companyOwesResidual(125.5), 125.5);
  assertEquals(companyOwesResidual(-40), 0);
  assertEquals(driverOwesResidual(-40), 40);
  assertEquals(driverOwesResidual(10), 0);
});

Deno.test("buildMovementRow requires idempotency key and scopes uniquely", () => {
  const row = buildMovementRow({
    organizationId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    driverId: "driver-1",
    periodAnchor: "2026-09-01",
    kind: "pay",
    amountMinor: 5000,
    idempotencyKey: "pay-1",
    method: "Cash",
  });
  assertEquals(row.idempotency_key, "pay-1");
  assertEquals(row.organization_id, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  assertEquals(row.kind, "pay");
  assertEquals(row.amount_minor, 5000);

  assertThrows(
    () =>
      buildMovementRow({
        organizationId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        driverId: "driver-1",
        periodAnchor: "2026-09-01",
        kind: "collect",
        amountMinor: 100,
        idempotencyKey: "  ",
      }),
    SettlementCommandError,
    "idempotencyKey is required",
  );

  assertEquals(
    isSameIdempotencyScope(
      { organizationId: "org-a", idempotencyKey: "k1" },
      { organizationId: "org-a", idempotencyKey: "k1" },
    ),
    true,
  );
  assertEquals(
    isSameIdempotencyScope(
      { organizationId: "org-a", idempotencyKey: "k1" },
      { organizationId: "org-b", idempotencyKey: "k1" },
    ),
    false,
  );
});
