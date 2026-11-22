import { assertEquals } from "jsr:@std/assert@1.0.13";
import {
  validateFuelFlagDispositionInput,
  FUEL_FLAG_CODES_WITH_NOTE,
} from "./fuel_flag_disposition_action.ts";

Deno.test("F-26: possible_fill_not_scanned close needs note >= 10", () => {
  assertEquals(FUEL_FLAG_CODES_WITH_NOTE.has("possible_fill_not_scanned"), true);
  const short = validateFuelFlagDispositionInput({
    orgId: "o",
    entryId: "e1",
    flagCode: "possible_fill_not_scanned",
    action: "accepted",
    note: "too short",
    actorId: "u1",
  });
  assertEquals(short.ok, false);
  if (!short.ok) assertEquals(short.error, "note_required");
  const ok = validateFuelFlagDispositionInput({
    orgId: "o",
    entryId: "e1",
    flagCode: "possible_fill_not_scanned",
    action: "accepted",
    note: "Odometer chain checked OK",
    actorId: "u1",
  });
  assertEquals(ok, { ok: true });
});