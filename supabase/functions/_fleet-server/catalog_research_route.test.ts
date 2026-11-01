/**
 * deno test --no-check supabase/functions/_fleet-server/catalog_research_route.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { routeProposals } from "./catalog_research_route.ts";

Deno.test("R7: two domains auto when shape ok and not shadow", () => {
  const routes = routeProposals({
    shadowMode: false,
    proposals: [{
      id: "a",
      slotKey: "oem",
      matchType: "OEM",
      partNumberNorm: "ABC123",
      passedDomains: ["partsouq.com", "amayama.com"],
      shape: "ok",
    }],
  });
  assertEquals(routes[0]?.route, "auto");
});

Deno.test("R7: one domain review", () => {
  const routes = routeProposals({
    shadowMode: false,
    proposals: [{
      id: "a",
      slotKey: "oem",
      matchType: "OEM",
      partNumberNorm: "ABC123",
      passedDomains: ["partsouq.com"],
      shape: "ok",
    }],
  });
  assertEquals(routes[0]?.route, "review");
});

Deno.test("R7: bad shape review", () => {
  const routes = routeProposals({
    shadowMode: false,
    proposals: [{
      id: "a",
      slotKey: "oem",
      matchType: "OEM",
      partNumberNorm: "ABC123",
      passedDomains: ["partsouq.com", "amayama.com"],
      shape: "invalid",
    }],
  });
  assertEquals(routes[0]?.route, "review");
});

Deno.test("R7: conflict same match different numbers", () => {
  const routes = routeProposals({
    shadowMode: false,
    proposals: [
      {
        id: "a",
        slotKey: "oem",
        matchType: "OEM",
        partNumberNorm: "111",
        passedDomains: ["partsouq.com", "amayama.com"],
        shape: "ok",
      },
      {
        id: "b",
        slotKey: "oem",
        matchType: "OEM",
        partNumberNorm: "222",
        passedDomains: ["partsouq.com", "7zap.com"],
        shape: "ok",
      },
    ],
  });
  assertEquals(routes.every((r) => r.route === "review"), true);
});

Deno.test("R7: shadowWouldAuto when shadow on", () => {
  const routes = routeProposals({
    shadowMode: true,
    proposals: [{
      id: "a",
      slotKey: "oem",
      matchType: "OEM",
      partNumberNorm: "ABC123",
      passedDomains: ["partsouq.com", "amayama.com"],
      shape: "ok",
    }],
  });
  assertEquals(routes[0]?.route, "review");
  assertEquals(routes[0]?.shadowWouldAuto, true);
});
