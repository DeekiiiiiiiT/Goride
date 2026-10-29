import { assertEquals } from "jsr:@std/assert";
import {
  confidenceFor,
  mapFuelGrade,
  priceStatusFor,
  resolveFleetGrade,
  resolvePlugGrade,
  weightedMedian,
} from "./priceEngineMath.ts";

Deno.test("fleet grade prefers the vehicle, then the fill, then the statement", () => {
  assertEquals(resolveFleetGrade({ catalog: "87", fill: "diesel", statement: "90" }), { grade: "e10_87", source: "vehicle" });
  assertEquals(resolveFleetGrade({ fill: "ADO", statement: "87" }), { grade: "diesel", source: "fill" });
  assertEquals(resolveFleetGrade({ statement: "ULSD" }), { grade: "ulsd", source: "statement" });
  assertEquals(resolveFleetGrade({ fill: "mystery" }), { grade: "unknown", source: "unknown" });
  assertEquals(mapFuelGrade("Gasoline_87"), "e10_87");
  assertEquals(mapFuelGrade("E10 90"), "e10_90");
});

Deno.test("a Plug grade change is recorded, and a missing lock is unknown", () => {
  assertEquals(resolvePlugGrade("87", "87"), { grade: "e10_87", source: "vehicle_locked" });
  assertEquals(resolvePlugGrade("87", "90"), { grade: "e10_90", source: "user_changed" });
  assertEquals(resolvePlugGrade(null, "diesel"), { grade: "diesel", source: "unknown" });
});

Deno.test("weighted median and confidence follow the published rule", () => {
  assertEquals(weightedMedian([
    { price: 200, weight: 1 },
    { price: 205, weight: 1 },
    { price: 210, weight: 2 },
  ]), 205);
  assertEquals(confidenceFor({ reports: 3, fleetReports: 3, spread: 0.01 }), "high");
  assertEquals(confidenceFor({ reports: 1, fleetReports: 1, spread: 0 }), "medium");
  assertEquals(confidenceFor({ reports: 1, fleetReports: 0, spread: 0 }), "low");
  assertEquals(priceStatusFor("accepted"), "published");
  assertEquals(priceStatusFor("review"), "review");
  assertEquals(priceStatusFor("waiting_place"), "review");
});

Deno.test("replay: a J$39.07 fill is out of bounds and a normal fill is not", () => {
  const wholesale = 201.81;
  const low = wholesale * 0.8;
  const high = wholesale * 1.5;
  const rows = [39.07, 229.2, 228.4, 230.1];
  const held = rows.filter((price) => price < low || price > high);
  const kept = rows.filter((price) => price >= low && price <= high);
  assertEquals(held, [39.07]);
  assertEquals(weightedMedian(kept.map((price) => ({ price, weight: 2 }))), 229.2);
});
