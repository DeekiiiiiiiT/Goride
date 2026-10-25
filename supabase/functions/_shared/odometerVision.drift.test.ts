/**
 * Fail if Plug or Fleet stop using the shared odometer prompt.
 */
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";

Deno.test("odometer vision stays one shared prompt", async () => {
  const here = dirname(fromFileUrl(import.meta.url));
  const shared = await Deno.readTextFile(join(here, "odometerVision.ts"));
  const explorer = await Deno.readTextFile(join(here, "../explorer/index.ts"));
  const fleet = await Deno.readTextFile(join(here, "../_fleet-server/register_residual_monolith_routes.tsx"));
  assertStringIncludes(shared, "export const ODOMETER_VISION_PROMPT");
  assertStringIncludes(explorer, 'from "../_shared/odometerVision.ts"');
  assertStringIncludes(fleet, 'from "../_shared/odometerVision.ts"');
  assertEquals(explorer.includes("Ignore trip meters"), false);
  assertEquals(fleet.includes("Ignore trip meters"), false);
});
