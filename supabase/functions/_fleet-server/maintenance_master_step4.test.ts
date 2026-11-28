// Maintenance rebuild step 4: plain save errors and the model family of a platform.
import { assertEquals } from "jsr:@std/assert@1";
import { plainRuleSaveError } from "./maintenance_master_routes.ts";
import { familyIdOf } from "./maintenance_family_names.ts";

Deno.test("a schedule saved without its model says so in plain words", () => {
  assertEquals(
    plainRuleSaveError('new row for relation "maintenance_task_templates" violates check constraint "maintenance_task_templates_scope_check"'),
    "Pick the model, engine or car version this schedule is for.",
  );
});

Deno.test("a car maker number without its manual and page says so", () => {
  assertEquals(
    plainRuleSaveError('violates check constraint "maintenance_task_templates_maker_manual_evidence_check"'),
    "A car maker number needs its manual and the page it is on.",
  );
});

Deno.test("one figure plus harder-driving numbers says so", () => {
  assertEquals(
    plainRuleSaveError('violates check constraint "maintenance_task_templates_severe_same_as_normal_check"'),
    "Leave the harder-driving numbers empty when the manual gives one figure.",
  );
});

Deno.test("any other error keeps its own words", () => {
  assertEquals(plainRuleSaveError("connection reset"), "connection reset");
});

Deno.test("a platform under a family belongs to the family; a top platform is its own family", () => {
  assertEquals(familyIdOf({ id: "m900a", parent_id: "m900-family" }), "m900-family");
  assertEquals(familyIdOf({ id: "gp5", parent_id: null }), "gp5");
});
