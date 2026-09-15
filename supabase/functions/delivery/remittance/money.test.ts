/**
 * Unit tests for remittance money helpers (Deno).
 * Ledger concurrency is covered by SQL/RPC integration after migration apply.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  collectIdempotencyKey,
  fromMinor,
  settleIdempotencyKey,
  toMinor,
} from "./money.ts";

Deno.test("toMinor / fromMinor round trip", () => {
  assertEquals(toMinor(10.005), 1001);
  assertEquals(fromMinor(1001), 10.01);
  assertEquals(toMinor(2200), 220000);
});

Deno.test("idempotency key formats", () => {
  assertEquals(collectIdempotencyKey("abc"), "cod:collect:v1:abc");
  assertEquals(settleIdempotencyKey("s1"), "cod:settle:v1:s1");
});
