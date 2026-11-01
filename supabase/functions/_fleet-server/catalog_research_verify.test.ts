/**
 * deno test --no-check supabase/functions/_fleet-server/catalog_research_verify.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { verifySourcePage } from "./catalog_research_verify.ts";

const chassisHtml = `
<html><body>
Toyota Roomy 2017 chassis M900A engine 1KR-FE part 04465-B1234 front axle
</body></html>`;

Deno.test("B5: number and chassis pass", () => {
  const r = verifySourcePage({
    html: chassisHtml,
    partNumber: "04465-B1234",
    chassisCode: "M900A",
    model: "Roomy",
    engineCode: "1KR-FE",
    needsAxle: true,
    axle: "front",
  });
  assertEquals(r.passed, true);
});

Deno.test("B5: number only fails car check", () => {
  const r = verifySourcePage({
    html: "<html>04465-B1234 generic listing</html>",
    partNumber: "04465-B1234",
    chassisCode: "M900A",
    model: "Roomy",
    engineCode: "1KR-FE",
  });
  assertEquals(r.numberFound, true);
  assertEquals(r.carFound, false);
  assertEquals(r.passed, false);
});
