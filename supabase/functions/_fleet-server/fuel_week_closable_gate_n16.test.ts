import { assertEquals } from "jsr:@std/assert@1.0.13";
import { evaluateFuelWeekClosable } from "../../../packages/fuel-core/src/evaluateFuelWeekClosable.ts";
import { loadFuelNightlyCheckFailures } from "./fuel_week_closable_gate.ts";

Deno.test("F-16: nightly failure blocks close naming check and week", () => {
  const blockers = evaluateFuelWeekClosable({
    nightlyCheckFailures: [{ name: "v3_lines_vs_week_shares", weekStart: "2026-11-16" }],
  });
  assertEquals(blockers.length, 1);
  assertEquals(blockers[0]?.code, "nightly_check_failed");
  assertEquals(blockers[0]?.message.includes("lines vs week shares"), true);
  assertEquals(blockers[0]?.message.includes("16 Nov"), true);
});

Deno.test("F-16: only failures on v3 weeks are passed to the close gate", () => {
  const src = Deno.readTextFileSync(new URL("./fuel_week_closable_gate.ts", import.meta.url));
  const loader = src.slice(src.indexOf("export async function loadFuelNightlyCheckFailures"));
  assertEquals(loader.slice(0, 1500).includes(".filter((f) => f.v3 === true)"), true);
});

Deno.test("F-16: loadFuelNightlyCheckFailures returns empty when RPC fails", async () => {
  const rows = await loadFuelNightlyCheckFailures("org-with-no-db-local");
  assertEquals(rows, []);
});