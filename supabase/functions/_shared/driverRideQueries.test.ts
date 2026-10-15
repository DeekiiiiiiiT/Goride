import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cashReceivedMinorFromTripRow } from "./cashInHand.ts";
import { getDriverActiveRideRequest, isQueryError } from "./driverRideQueries.ts";

Deno.test("isQueryError treats null as success shape (no active ride)", () => {
  assertEquals(isQueryError(null), false);
  assertEquals(isQueryError({ id: "ride-1" }), false);
  assertEquals(isQueryError({ error: "db down" }), true);
});

/** Minimal chainable mock for getActiveRideFromTable's maybeSingle path. */
function mockDbReturning(
  result: { data: Record<string, unknown> | null; error: { message: string } | null },
) {
  const terminal = {
    maybeSingle: () => Promise.resolve(result),
  };
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "gte", "order", "limit"]) {
    chain[m] = () => chain;
  }
  Object.assign(chain, terminal);
  return {
    from: () => chain,
  } as never;
}

Deno.test("getDriverActiveRideRequest returns null when no active ride (no throw)", async () => {
  const ridesDb = mockDbReturning({ data: null, error: null });
  const publicDb = mockDbReturning({ data: null, error: null });
  const out = await getDriverActiveRideRequest(ridesDb, publicDb, "driver-user-1");
  assertEquals(out, null);
  assertEquals(isQueryError(out), false);
});

Deno.test("getDriverActiveRideRequest returns ride row when present", async () => {
  const ride = { id: "rr-1", status: "in_progress" };
  const ridesDb = mockDbReturning({ data: ride, error: null });
  const publicDb = mockDbReturning({ data: null, error: null });
  const out = await getDriverActiveRideRequest(ridesDb, publicDb, "driver-user-1");
  assertEquals(out, ride);
});

Deno.test("getDriverActiveRideRequest falls back to public only on native query error", async () => {
  const ridesDb = mockDbReturning({ data: null, error: { message: "schema missing" } });
  const pubRide = { id: "pub-1", status: "accepted" };
  const publicDb = mockDbReturning({ data: pubRide, error: null });
  const out = await getDriverActiveRideRequest(ridesDb, publicDb, "driver-user-1");
  assertEquals(out, pubRide);
});


Deno.test("cashReceivedMinorFromTripRow uses cash_received column", () => {
  assertEquals(
    cashReceivedMinorFromTripRow({
      status: "completed",
      payment_method: "cash",
      cash_received_minor: 100000,
    }),
    100000,
  );
});

Deno.test("cashReceivedMinorFromTripRow reads settlement snapshot", () => {
  assertEquals(
    cashReceivedMinorFromTripRow({
      status: "completed",
      payment_method: "cash",
      cash_settlement_snapshot: { cash_received_minor: 100000 },
    }),
    100000,
  );
});

Deno.test("cashReceivedMinorFromTripRow is zero without settlement data", () => {
  assertEquals(
    cashReceivedMinorFromTripRow({
      status: "completed",
      payment_method: "cash",
    }),
    0,
  );
});

Deno.test("cashReceivedMinorFromTripRow ignores card trips", () => {
  assertEquals(
    cashReceivedMinorFromTripRow({
      status: "completed",
      payment_method: "card",
      cash_received_minor: 100000,
    }),
    0,
  );
});
