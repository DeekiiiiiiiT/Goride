/**
 * RE-74 (27 Nov): a held saved-page row never opens a browser check when the car already has a Confirmed number for
 * that part type on that axle.
 * deno test --no-check supabase/functions/_fleet-server/saved_page_on_file.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type OnFile, placeOnFile } from "./saved_page_on_file.ts";

const drum = { id: "drum", scheme: "axle" };
const thermostat = { id: "therm", scheme: "none" };
const roomyDrum: OnFile = { componentId: "drum", number: "42431-B1021", position: "rear", side: null, from: null, to: null };

Deno.test("RE-74: the Roomy's confirmed rear drum covers a rear drum row, not a front one", () => {
  assertEquals(placeOnFile([roomyDrum], drum, "rear"), true);
  assertEquals(placeOnFile([roomyDrum], drum, "front"), false);
});

Deno.test("RE-74: another part type on file never counts", () => {
  assertEquals(placeOnFile([roomyDrum], { id: "shoes", scheme: "axle" }, "rear"), false);
  assertEquals(placeOnFile([], drum, "rear"), false);
});

Deno.test("RE-74: a part with no axle is on file wherever it is listed", () => {
  const onFile: OnFile = { componentId: "therm", number: "90916-03150", position: null, side: null, from: null, to: null };
  assertEquals(placeOnFile([onFile], thermostat, null), true);
});
