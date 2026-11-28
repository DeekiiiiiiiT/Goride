import { assertEquals } from "jsr:@std/assert@1";
import { fillableParts, plainHistoryError } from "./maintenance_history_fill_routes.ts";

Deno.test("Fill in history lists scheduled parts only: never retired, as-needed or rule-less rows", () => {
  const rows = [
    { id: "a", schedule_status: "active", rule_id: "r1" },
    { id: "b", schedule_status: "odometer_needed", rule_id: "r2" },
    { id: "c", schedule_status: "manual_override", rule_id: null },
    { id: "d", schedule_status: "retired", rule_id: null, retired_reason: "As needed: done only when a job calls for it" },
    { id: "e", schedule_status: "retired", rule_id: "r3", retired_reason: "Job doesn't fit this car's powertrain" },
    { id: "f", schedule_status: "no_rule", rule_id: null },
  ];
  assertEquals(fillableParts(rows).map((r) => r.id), ["a", "b", "c"]);
});

Deno.test("database refusals come back in plain words", () => {
  assertEquals(plainHistoryError("ERROR: last done on 2026-12-01 is in the future"), "A last-done date can't be in the future.");
  assertEquals(
    plainHistoryError("ERROR:  part 1234 is not on this car"),
    "One of these parts is no longer on this car. Close and open the list again.",
  );
  assertEquals(
    plainHistoryError("last done at 250000 km is more than the car's odometer (200932 km)"),
    "Last done at 250000 km is more than the car's odometer (200932 km).",
  );
});
