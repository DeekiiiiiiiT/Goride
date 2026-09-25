/**
 * Unit tests for toll request idempotency helper (TR Phase 6).
 * Uses in-memory store (KV failures are swallowed).
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  beginTollIdempotency,
  completeTollIdempotency,
  abandonTollIdempotency,
  TOLL_IDEMPOTENCY_TTL_MS,
  __resetTollIdempotencyMemForTests,
} from "./toll_request_idempotency.ts";

Deno.test("toll idempotency: proceed → complete → replay", async () => {
  __resetTollIdempotencyMemForTests();
  const key = `test-${crypto.randomUUID()}`;
  const route = "unit-test-route";
  const g1 = await beginTollIdempotency(route, key, Date.now());
  assertEquals(g1.mode, "proceed");

  await completeTollIdempotency(route, key, 200, { ok: true, n: 1 }, Date.now());

  const g2 = await beginTollIdempotency(route, key, Date.now());
  assertEquals(g2.mode, "replay");
  if (g2.mode === "replay") {
    assertEquals((g2.body as { n: number }).n, 1);
    assertEquals(g2.httpStatus, 200);
  }

  await abandonTollIdempotency(route, key);
  assertEquals(TOLL_IDEMPOTENCY_TTL_MS > 0, true);
});

Deno.test("toll idempotency: in_progress conflicts", async () => {
  __resetTollIdempotencyMemForTests();
  const key = `test-conflict-${crypto.randomUUID()}`;
  const route = "unit-test-conflict";
  const g1 = await beginTollIdempotency(route, key, Date.now());
  assertEquals(g1.mode, "proceed");
  const g2 = await beginTollIdempotency(route, key, Date.now());
  assertEquals(g2.mode, "conflict");
  await abandonTollIdempotency(route, key);
});

Deno.test("toll idempotency: missing key skips", async () => {
  const g = await beginTollIdempotency("r", null);
  assertEquals(g.mode, "skip");
});
