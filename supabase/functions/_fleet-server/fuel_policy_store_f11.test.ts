/**
 * F-11: rules are read and written only through fuel.policy_scenarios (never the KV store),
 * and fuel lines carry the rule version that priced the week.
 */
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { policyVersionIdOf } from "./fuel_week_lines.ts";

const read = (f: string) => Deno.readTextFileSync(new URL(`./${f}`, import.meta.url));

Deno.test("F-11: no server code reads or writes the old fuel_scenario: KV rows", () => {
  for (const f of [
    "register_fuel_scenario_routes.ts",
    "fuel_week_compute.ts",
    "fuel_week_prepare.ts",
  ]) {
    const src = read(f);
    assert(!/kv\.(get|getByPrefix|set|del)\([^)]*fuel_scenario/.test(src), `${f} touches fuel_scenario KV`);
    assert(!src.includes('PREFIX}${'), `${f} writes a KV rule key`);
  }
  assert(read("fuel_week_compute.ts").includes("listFuelPoliciesForOrg(orgId)"));
  assert(read("fuel_week_prepare.ts").includes("listFuelPoliciesForOrg(orgId)"));
  const routes = read("register_fuel_scenario_routes.ts");
  assert(routes.includes("await listFuelPoliciesForOrg(orgId)"), "routes read from the table");
  assert(routes.includes("saveFuelPolicy(orgId, stamped"), "routes save to the table");
  assert(routes.includes("FuelPolicyNotFoundError"), "another company's rule id answers 404");
  assert(!routes.includes("backfill-tenancy"), "the one-off KV tenancy backfill is gone");
});

Deno.test("F-11: lines take the rule version id only when it is a real version window", () => {
  const v = "24299961-554f-45a0-bba9-f4ac52f1a701";
  assertEquals(policyVersionIdOf({ metadata: { fuelPolicyVersion: { versionId: v } } }), v);
  assertEquals(policyVersionIdOf({ metadata: { fuelPolicyVersion: { versionId: "template-std" } } }), null);
  assertEquals(policyVersionIdOf({ metadata: {} }), null);
  assertEquals(policyVersionIdOf({} as never), null);
});
