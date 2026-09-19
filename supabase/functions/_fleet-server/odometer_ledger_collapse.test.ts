import { assertEquals } from "jsr:@std/assert";
import { collapseOdometerRowsWithDelta } from "./odometer_ledger.ts";

Deno.test("collapse before deltaKm: twin same recordedAt+value does not zero distance", () => {
  // Newest-first (ledger read order). Twin at 50000, then prior distinct 49000.
  const rows = [
    { id: "a", value: 50000, recordedAt: "2026-09-18T12:00:00.000Z" },
    { id: "b", value: 50000, recordedAt: "2026-09-18T12:00:00.000Z" },
    { id: "c", value: 49000, recordedAt: "2026-09-17T08:00:00.000Z" },
  ];
  const out = collapseOdometerRowsWithDelta(rows);
  assertEquals(out.length, 2);
  assertEquals(out[0].value, 50000);
  assertEquals(out[0].deltaKm, 1000);
  assertEquals(out[1].value, 49000);
  assertEquals(out[1].deltaKm, null);
});

Deno.test("collapse before deltaKm: later fill after twin sees real distance", () => {
  const rows = [
    { id: "later", value: 51000, recordedAt: "2026-09-19T10:00:00.000Z" },
    { id: "split-cash", value: 50000, recordedAt: "2026-09-18T12:00:00.000Z" },
    { id: "split-card", value: 50000, recordedAt: "2026-09-18T12:00:00.000Z" },
    { id: "prior", value: 49000, recordedAt: "2026-09-17T08:00:00.000Z" },
  ];
  const out = collapseOdometerRowsWithDelta(rows);
  assertEquals(out.length, 3);
  assertEquals(out[0].deltaKm, 1000); // 51000 - 50000 (not 0 against twin)
  assertEquals(out[1].deltaKm, 1000);
  assertEquals(out[2].deltaKm, null);
});
