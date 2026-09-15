/**
 * Idempotency / concurrency invariants for remittance collect keys (Phase 1 gate).
 * Full 200-parallel RPC soak runs via scripts/remittance_concurrency_soak.sql against DB.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { collectIdempotencyKey } from "./money.ts";

Deno.test("200 parallel collect keys are unique per order", () => {
  const keys = new Set<string>();
  for (let i = 0; i < 200; i++) {
    keys.add(collectIdempotencyKey(`order-${i}`));
  }
  assertEquals(keys.size, 200);
});

Deno.test("replay same order collapses to one idempotency key", () => {
  const a = collectIdempotencyKey("same-order");
  const b = collectIdempotencyKey("same-order");
  assertEquals(a, b);
  assertEquals(a, "cod:collect:v1:same-order");
});
