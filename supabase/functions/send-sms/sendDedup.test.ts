import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { _resetForTest, recordSent, wasRecentlySent } from "./sendDedup.ts";

Deno.test("first send is not a duplicate; a recorded send is suppressed within TTL", () => {
  _resetForTest();
  const key = "wid:msg-1";
  const t0 = 1_000_000;
  assertEquals(wasRecentlySent(key, t0), false);
  recordSent(key, 30_000, t0);
  // Same key within window -> duplicate.
  assertEquals(wasRecentlySent(key, t0 + 5_000), true);
});

Deno.test("send is allowed again after the TTL expires", () => {
  _resetForTest();
  const key = "poh:abc";
  const t0 = 2_000_000;
  recordSent(key, 30_000, t0);
  assertEquals(wasRecentlySent(key, t0 + 29_999), true);
  assertEquals(wasRecentlySent(key, t0 + 30_001), false);
});

Deno.test("distinct keys do not collide", () => {
  _resetForTest();
  const t0 = 3_000_000;
  recordSent("wid:a", 30_000, t0);
  assertEquals(wasRecentlySent("wid:b", t0 + 100), false);
});

Deno.test("a failed send (never recorded) permits a retry", () => {
  _resetForTest();
  const key = "wid:retry";
  const t0 = 4_000_000;
  // Simulate: checked, send failed, so recordSent was NOT called.
  assertEquals(wasRecentlySent(key, t0), false);
  // Retry within the window is still allowed because nothing was recorded.
  assertEquals(wasRecentlySent(key, t0 + 1_000), false);
});
