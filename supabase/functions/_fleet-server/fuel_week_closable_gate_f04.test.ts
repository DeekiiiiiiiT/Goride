import { assertEquals } from "jsr:@std/assert@1.0.13";
import { listAwaitingCardStatementFills } from "./fuel_week_closable_gate.ts";
import { evaluateFuelWeekClosable } from "../../../packages/fuel-core/src/evaluateFuelWeekClosable.ts";

Deno.test("F-04: recommended gap charge blocks close with car and stretch", () => {
  const blockers = evaluateFuelWeekClosable({
    gapChargesPendingApproval: [
      { vehicleLabel: "5179KZ", startYmd: "2026-11-10", endYmd: "2026-11-11" },
    ],
  });
  assertEquals(blockers.length, 1);
  assertEquals(blockers[0]?.code, "gap_charge_recommended");
  assertEquals(
    blockers[0]?.message.includes("5179KZ"),
    true,
  );
});

Deno.test("F-09: awaiting card statement fill blocks close", () => {
  const blockers = evaluateFuelWeekClosable({
    awaitingCardStatementFills: [{ vehicleLabel: "5179KZ", dateYmd: "2026-11-18" }],
  });
  assertEquals(blockers[0]?.code, "awaiting_card_statement");
});

Deno.test("listAwaitingCardStatementFills names car and date", () => {
  const rows = listAwaitingCardStatementFills(
    [
      {
        date: "2026-11-18",
        vehicleId: "v-5179",
        metadata: { awaitingCardStatement: true },
        odometer: 197000,
      },
    ],
    [{ vehicleId: "v-5179", vehiclePlate: "5179KZ" }],
    "2026-11-16",
    "2026-11-22",
  );
  assertEquals(rows, [{ vehicleLabel: "5179KZ", dateYmd: "2026-11-18" }]);
});

Deno.test("F-04: approved gap charge does not block close", () => {
  const blockers = evaluateFuelWeekClosable({ gapChargesPendingApproval: [] });
  assertEquals(blockers.length, 0);
});