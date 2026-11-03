/**
 * Parts auto-match route validation and wiring.
 * deno test --no-check supabase/functions/_fleet-server/parts_auto_match_routes.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isValidUuid,
  parseConflictResolveInput,
  parseKeepBatchInput,
  parseOptionalVehicleId,
  registerPartsAutoMatchRoutes,
  rpcClientErrorStatus,
  tallyField,
  UUID_RE,
} from "./parts_auto_match_routes.ts";

const VALID = "11111111-1111-4111-8111-111111111111";

Deno.test("parts auto-match routes module loads", () => {
  assertEquals(typeof registerPartsAutoMatchRoutes, "function");
});

Deno.test({
  name: "health vehicleId validation",
  fn() {
    const cases: Array<[string | undefined, boolean, string | null]> = [
      [undefined, true, null],
      ["", true, null],
      [VALID, true, VALID],
      ["not-a-uuid", false, null],
      ["11111111-1111-4111-8111-11111111111g", false, null],
    ];
    for (const [raw, ok, id] of cases) {
      const out = parseOptionalVehicleId(raw);
      assertEquals(out.ok, ok, raw);
      if (out.ok) assertEquals(out.id, id, raw);
    }
  },
});

Deno.test({
  name: "conflict resolve input validation",
  fn() {
    const good = parseConflictResolveInput({ action: "keep", note: "audit" });
    assertEquals(good.ok, true);
    if (good.ok) {
      assertEquals(good.action, "keep");
      assertEquals(good.note, "audit");
    }
    assertEquals(parseConflictResolveInput({ action: "remove" }).ok, true);
    assertEquals(parseConflictResolveInput({ action: "hold" }).ok, false);
    assertEquals(parseConflictResolveInput(null).ok, false);
  },
});

Deno.test({
  name: "keep-batch input validation",
  fn() {
    const good = parseKeepBatchInput({ derivedIds: [VALID], note: "batch" });
    assertEquals(good.ok, true);
    if (good.ok) {
      assertEquals(good.ids, [VALID]);
      assertEquals(good.note, "batch");
    }
    assertEquals(parseKeepBatchInput({ derivedIds: [] }).ok, false);
    assertEquals(parseKeepBatchInput({ derivedIds: ["bad"] }).ok, false);
    assertEquals(parseKeepBatchInput({}).ok, false);
  },
});

Deno.test("tallyField aggregates conflict totals", () => {
  const totals = tallyField([
    { conflict_type: "oe_ambiguous", status: "open" },
    { conflict_type: "oe_ambiguous", status: "open" },
    { conflict_type: "system_link", status: "kept" },
  ], "conflict_type");
  assertEquals(totals.oe_ambiguous, 2);
  assertEquals(totals.system_link, 1);
});

Deno.test("rpcClientErrorStatus maps client errors to 400", () => {
  assertEquals(rpcClientErrorStatus({ code: "P0001", message: "Derived fit not found" }), 400);
  assertEquals(rpcClientErrorStatus({ message: "Unknown conflict id" }), 400);
  assertEquals(rpcClientErrorStatus({ message: "connection reset" }), 500);
});

Deno.test("UUID helper matches route regex", () => {
  assertEquals(isValidUuid(VALID), true);
  assertEquals(UUID_RE.test(VALID), true);
  assertEquals(isValidUuid("nope"), false);
});
