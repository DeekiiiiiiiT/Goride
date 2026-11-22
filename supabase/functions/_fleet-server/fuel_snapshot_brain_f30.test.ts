/**
 * F-30 done-test 20: brain policies are stamped on snapshot provenance at compute time.
 */
import { assertEquals } from "jsr:@std/assert@1.0.13";

const here = new URL(".", import.meta.url);
const compute = Deno.readTextFileSync(new URL("fuel_week_compute.ts", here));

Deno.test("F-30: fuel_week_compute stamps brainPolicies on snapshot provenance", () => {
  assertEquals(compute.includes("fuel_brain_policies"), true);
  assertEquals(compute.includes("brainPolicies"), true);
  assertEquals(compute.includes("provenance:"), true);
});