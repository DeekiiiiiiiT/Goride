import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  assertExpectedUpdatedAt,
  StaleWriteError,
  stripConcurrencyToken,
} from "./optimistic_concurrency.ts";

Deno.test("assertExpectedUpdatedAt allows a first write with no expected token", () => {
  assertExpectedUpdatedAt({ id: "t1", updatedAt: "2026-01-01T00:00:00Z" }, undefined);
  assertExpectedUpdatedAt(null, "2026-01-01T00:00:00Z");
});

Deno.test("assertExpectedUpdatedAt allows a matching token", () => {
  assertExpectedUpdatedAt(
    { id: "t1", updatedAt: "2026-01-01T00:00:00Z" },
    "2026-01-01T00:00:00Z",
  );
});

Deno.test("assertExpectedUpdatedAt rejects a stale token", () => {
  assertThrows(
    () =>
      assertExpectedUpdatedAt(
        { id: "t1", updatedAt: "2026-01-02T00:00:00Z" },
        "2026-01-01T00:00:00Z",
      ),
    StaleWriteError,
  );
});

Deno.test("stripConcurrencyToken removes the expectedUpdatedAt field", () => {
  const cleaned = stripConcurrencyToken({
    id: "t1",
    tagNumber: "T-1",
    expectedUpdatedAt: "2026-01-01T00:00:00Z",
  });
  assertEquals(cleaned, { id: "t1", tagNumber: "T-1" });
  assertEquals(("expectedUpdatedAt" in cleaned), false);
});
