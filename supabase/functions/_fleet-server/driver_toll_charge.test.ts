import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deterministicProjectionTxId } from "./driver_toll_charge_id.ts";

/**
 * Guards the concurrent-double-charge fix: the projection transaction id MUST
 * be derived deterministically from (tollId, version) so two racing
 * emitDriverTollCharge calls upsert the SAME `transaction:{id}` row instead of
 * creating two. Run: deno test driver_toll_charge.test.ts
 */

Deno.test("projection id is stable for the same toll + version (idempotent upsert)", async () => {
  const a = await deterministicProjectionTxId("toll-123", 1);
  const b = await deterministicProjectionTxId("toll-123", 1);
  assertEquals(a, b);
});

Deno.test("projection id differs across versions (re-charge after reversal)", async () => {
  const v1 = await deterministicProjectionTxId("toll-123", 1);
  const v2 = await deterministicProjectionTxId("toll-123", 2);
  assertNotEquals(v1, v2);
});

Deno.test("projection id differs across tolls", async () => {
  const t1 = await deterministicProjectionTxId("toll-a", 1);
  const t2 = await deterministicProjectionTxId("toll-b", 1);
  assertNotEquals(t1, t2);
});

Deno.test("projection id is UUID-shaped", async () => {
  const id = await deterministicProjectionTxId("toll-xyz", 3);
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id));
});
