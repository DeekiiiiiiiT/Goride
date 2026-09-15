/**
 * W-2: write-off reversal guards (no DB).
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { validateWriteOffReversalTarget } from "./settleRemittance.ts";
import { reverseIdempotencyKey } from "./money.ts";

Deno.test("write-off reverse refuses missing / non-write_off / zero", () => {
  assertEquals(validateWriteOffReversalTarget(null).ok, false);
  assertEquals(
    validateWriteOffReversalTarget({ event_type: "settled", amount_minor: -100 })
      .ok,
    false,
  );
  const bad = validateWriteOffReversalTarget({
    event_type: "write_off",
    amount_minor: 0,
  });
  assertEquals(bad.ok, false);
});

Deno.test("write-off reverse restores absolute magnitude", () => {
  const ok = validateWriteOffReversalTarget({
    event_type: "write_off",
    amount_minor: -45000,
  });
  assertEquals(ok.ok, true);
  if (ok.ok) assertEquals(ok.restoreMinor, 45000);
});

Deno.test("write-off reverse idempotency key is stable", () => {
  const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  assertEquals(reverseIdempotencyKey(id), `cod:reverse:v1:${id}`);
});
