/**
 * F-13: weekly km per litre is fill to fill, card fills counted once, and "—" while a
 * fill in the week is waiting for its card statement.
 */
import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1.0.13";
import { dedupeFills, kmPerLiterForWeek } from "./fuel_vehicle_economy_weeks.ts";

Deno.test("fill to fill: the first fill of the week pays for the km since the fill before the week", () => {
  const fills = dedupeFills([
    { date: "2026-11-15", odometer: 198_250, liters: 20 }, // before the week
    { date: "2026-11-16", odometer: 198_437, liters: 15 }, // 187 km
    { date: "2026-11-17", odometer: 198_577, liters: 12 }, // 140 km
  ]);
  // (187 + 140) ÷ (15 + 12) — not (577 − 437) ÷ 27
  assertAlmostEquals(kmPerLiterForWeek(fills, "2026-11-16", "2026-11-22")!, 327 / 27, 1e-9);
});

Deno.test("a gas-card fill stored twice (scan + statement line) counts once", () => {
  const fills = dedupeFills([
    { date: "2026-11-08", odometer: 196_429, liters: 30 },
    { date: "2026-11-10", odometer: 196_858, liters: 0 }, // scan row, no litres
    { date: "2026-11-10", odometer: 196_858, liters: 35 }, // statement row
  ]);
  assertEquals(fills.length, 2);
  assertAlmostEquals(kmPerLiterForWeek(fills, "2026-11-09", "2026-11-15")!, 429 / 35, 1e-9);
});

Deno.test("a fill waiting for its card statement makes the week —", () => {
  const fills = dedupeFills([
    { date: "2026-11-17", odometer: 198_807, liters: 10 },
    { date: "2026-11-18", odometer: 198_973, liters: 0 }, // waiting
  ]);
  assertEquals(kmPerLiterForWeek(fills, "2026-11-16", "2026-11-22"), null);
});
