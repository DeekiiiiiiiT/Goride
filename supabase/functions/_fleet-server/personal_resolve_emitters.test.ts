/**
 * §1.3 — Personal resolve must keep writing both charge + P&L offset.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

Deno.test("Personal resolve still calls emitDriverTollCharge and emitTollChargeOffset", async () => {
  const src = await Deno.readTextFile(new URL("./toll_controller.tsx", import.meta.url));
  const personalBlock = src.slice(
    src.indexOf('if (resolution === "Personal")'),
    src.indexOf("} else {", src.indexOf('if (resolution === "Personal")')) + 20,
  );
  assertEquals(personalBlock.includes("emitDriverTollCharge"), true);
  assertEquals(personalBlock.includes("emitTollChargeOffset"), true);
  assertEquals(personalBlock.includes('reason: "personal"'), true);
});
