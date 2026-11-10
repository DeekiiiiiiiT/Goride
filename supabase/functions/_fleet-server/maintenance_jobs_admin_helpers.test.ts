import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  duplicateMemberMessage,
  opCodePrefixForSystem,
  relationRefusal,
  renumberSortOrders,
  shortOpSuffix,
  slugCode,
  usedJobPatchRefusal,
} from "./maintenance_jobs_admin_helpers.ts";

Deno.test("slugCode and op suffix from name", () => {
  assertEquals(slugCode("Fuel Pressure Test"), "fuel_pressure_test");
  assertEquals(shortOpSuffix("Fuel Pressure Test"), "FPT");
  assertEquals(opCodePrefixForSystem("sys_engine"), "ENG-");
});

Deno.test("renumberSortOrders uses 10, 20, 30", () => {
  assertEquals(renumberSortOrders(["a", "b", "c"]), [10, 20, 30]);
});

Deno.test("duplicate member message names section", () => {
  assertEquals(duplicateMemberMessage("Air Intake & Induction"), "Already in Air Intake & Induction.");
});

Deno.test("used job patch refusal for home group and form type", () => {
  assertEquals(usedJobPatchRefusal({ homeGroupId: "x" }, true)?.includes("home group"), true);
  assertEquals(usedJobPatchRefusal({ isPart: true }, true)?.includes("form type"), true);
  assertEquals(usedJobPatchRefusal({ name: "x" }, true), null);
});

Deno.test("relation refusal messages", () => {
  assertEquals(relationRefusal("a", "a", false, false), "A job cannot link to itself.");
  assertEquals(relationRefusal("a", "b", true, false), "That link already exists.");
  assertEquals(relationRefusal("a", "b", false, true), "Both jobs must be active.");
});

Deno.test("code clash pattern uses numeric suffix", () => {
  const base = slugCode("Fuel Pressure Test");
  assertEquals(`${base}_2`, "fuel_pressure_test_2");
  const op = `${opCodePrefixForSystem("sys_engine")}${shortOpSuffix("Fuel Pressure Test")}-2`;
  assertEquals(op, "ENG-FPT-2");
});
