/**
 * deno test --no-check supabase/functions/_fleet-server/catalog_research_number_shape.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { checkPartNumberShape, normalizePartNumberNorm } from "./catalog_research_number_shape.ts";
import { verifySourcePage, isTrustedDomain } from "./catalog_research_verify.ts";
import { routeProposals } from "./catalog_research_route.ts";
import { DAILY_LIMIT_MESSAGE, DAILY_REQUEST_LIMIT } from "./catalog_research_intake.ts";

Deno.test("normalizePartNumberNorm strips dashes", () => {
  assertEquals(normalizePartNumberNorm("04465-B1190"), "04465B1190");
});

Deno.test("Toyota number shape", () => {
  assertEquals(checkPartNumberShape("Toyota", "04465-B1190"), "ok");
  assertEquals(checkPartNumberShape("Toyota", "BAD"), "review");
});

Deno.test("grounding fixtures", () => {
  const withBoth = verifySourcePage({
    html: "<p>04465-B1190 for M900A chassis</p>",
    partNumber: "04465-B1190",
    chassisCode: "M900A",
  });
  assertEquals(withBoth.passed, true);

  const numberOnly = verifySourcePage({
    html: "<p>04465-B1190 only</p>",
    partNumber: "04465-B1190",
    chassisCode: "M900A",
  });
  assertEquals(numberOnly.passed, false);

  assertEquals(isTrustedDomain("evil.example", new Set(["partsouq.com"])), false);
});

Deno.test("routing shadow and domains", () => {
  const base = {
    slotKey: "oem",
    matchType: "OEM",
    partNumberNorm: "04465B1190",
    shape: "ok" as const,
  };
  const shadow = routeProposals({
    shadowMode: true,
    proposals: [{ id: "a", ...base, passedDomains: ["partsouq.com", "amayama.com"] }],
  });
  assertEquals(shadow[0].route, "review");
  assertEquals(shadow[0].shadowWouldAuto, true);

  const auto = routeProposals({
    shadowMode: false,
    proposals: [{ id: "b", ...base, passedDomains: ["partsouq.com", "amayama.com"] }],
  });
  assertEquals(auto[0].route, "auto");

  const one = routeProposals({
    shadowMode: false,
    proposals: [{ id: "c", ...base, passedDomains: ["partsouq.com"] }],
  });
  assertEquals(one[0].route, "review");
});

Deno.test("intake constants", () => {
  assertEquals(DAILY_REQUEST_LIMIT, 30);
  assertEquals(DAILY_LIMIT_MESSAGE.includes("30"), true);
});
