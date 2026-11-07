/**
 * RB-13 brakes overview helpers.
 * deno test --no-check supabase/functions/_fleet-server/read_brakes_overview.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { setupWord } from "./read_brakes_overview.ts";

Deno.test("setupWord maps disc and drum labels", () => {
  assertEquals(setupWord("Disc", "Drum"), { front: "Disc setup", rear: "Drum setup" });
  assertEquals(setupWord("", ""), { front: "Disc setup", rear: "Drum setup" });
});
