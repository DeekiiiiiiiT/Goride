import { assertEquals } from "jsr:@std/assert@1.0.13";
import {
  validateFuelFlagDispositionInput,
  FUEL_FLAG_CODES_WITH_NOTE,
} from "./fuel_flag_disposition_action.ts";

const routes = Deno.readTextFileSync(new URL("./fuel_period_routes.ts", import.meta.url)).replace(
  /\r\n/g,
  "\n",
);
const api = Deno.readTextFileSync(
  new URL("../../../apps/fleet/src/services/api.ts", import.meta.url),
).replace(/\r\n/g, "\n");

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

Deno.test("F-26 done-test 17: step 5 route upserts through fuel_flag_disposition_action", () => {
  const slice = routes.slice(
    routes.indexOf("/** Upsert fill-level flag disposition"),
    routes.indexOf("/** List dispositions scoped by entry IDs"),
  );
  assertEquals(slice.includes("`${BASE}/fuel/flags/disposition`"), true);
  assertEquals(slice.includes("upsertFuelFlagDisposition"), true);
  assertEquals(slice.includes('./fuel_flag_disposition_action.ts'), true);
});

Deno.test("F-26 done-test 17: Fuel Integrity desk calls the same disposition URL", () => {
  const m = api.match(/upsertFuelFlagDisposition[\s\S]*?`([^`]+)`/);
  assertEquals(m?.[1]?.includes("/fuel/flags/disposition"), true);
});