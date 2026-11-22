import { assertEquals } from "jsr:@std/assert@1.0.13";
import {
  filterFuelScenariosForOrg,
  fuelScenarioOrgId,
} from "./fuel_scenario_scope.ts";

Deno.test("F-18 done-test 12: org B cannot see org A scenario in filtered list", () => {
  const orgA = "org-a";
  const orgB = "org-b";
  const scenarioA = { id: "s-a", organizationId: orgA, name: "A", versions: [] };
  const scenarioB = { id: "s-b", organizationId: orgB, name: "B", versions: [] };
  const all = [scenarioA, scenarioB];
  assertEquals(fuelScenarioOrgId(scenarioA), orgA);
  const forB = filterFuelScenariosForOrg(all, orgB);
  assertEquals(forB.map((s) => s.id), ["s-b"]);
  const forA = filterFuelScenariosForOrg(all, orgA);
  assertEquals(forA.map((s) => s.id), ["s-a"]);
});