/**
 * V-3 write-off validation (no DB) — amount, reason, notes, overdraw rule shape.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  validateWriteOffFields,
  WRITE_OFF_REASON_CODES,
} from "./writeOffRemittance.ts";
import { writeOffIdempotencyKey } from "./money.ts";

function expectError(
  input: Parameters<typeof validateWriteOffFields>[0],
): string {
  const r = validateWriteOffFields(input);
  if (r.ok) throw new Error("expected validation failure");
  return r.error;
}

Deno.test("write-off rejects missing courier / amount / reason / short notes", () => {
  assertEquals(
    validateWriteOffFields({
      courierId: "",
      amountMinor: 100,
      reasonCode: "uncollectible",
      notes: "long enough note",
      expectedBalanceMinor: 100,
    }).ok,
    false,
  );
  assertEquals(
    expectError({
      courierId: "c1",
      amountMinor: 0,
      reasonCode: "uncollectible",
      notes: "long enough note",
      expectedBalanceMinor: 100,
    }),
    "amount_required",
  );
  assertEquals(
    expectError({
      courierId: "c1",
      amountMinor: 100,
      reasonCode: "not_a_reason",
      notes: "long enough note",
      expectedBalanceMinor: 100,
    }),
    "invalid_reason",
  );
  assertEquals(
    expectError({
      courierId: "c1",
      amountMinor: 100,
      reasonCode: "uncollectible",
      notes: "short",
      expectedBalanceMinor: 100,
    }),
    "notes_required",
  );
});

Deno.test("write-off accepts valid fields and known reason codes", () => {
  for (const reasonCode of WRITE_OFF_REASON_CODES) {
    const r = validateWriteOffFields({
      courierId: "c1",
      amountMinor: 500,
      reasonCode,
      notes: "Courier left market; uncollectible",
      expectedBalanceMinor: 500,
    });
    assertEquals(r.ok, true);
  }
});

Deno.test("write-off idempotency key is stable and prefixed", () => {
  assertEquals(writeOffIdempotencyKey("abc"), "cod:writeoff:v1:abc");
  assertEquals(
    writeOffIdempotencyKey("cod:writeoff:v1:abc"),
    "cod:writeoff:v1:abc",
  );
});
