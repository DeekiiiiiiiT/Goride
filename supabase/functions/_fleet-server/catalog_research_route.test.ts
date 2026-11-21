/**
 * deno test --no-check supabase/functions/_fleet-server/catalog_research_route.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { routeBySourceRule, routeProposals, type RuleProposal, type SourcePass } from "./catalog_research_route.ts";

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

// ---------------------------------------------------------------------------
// RE-19: routing by the source rule
// ---------------------------------------------------------------------------

const pass = (domain: string, kind: SourcePass["kind"], makerNorm: string, path: SourcePass["path"] = "direct"): SourcePass => ({
  domain, kind, makerNorm, path, readId: `read-${domain}-${path}`,
});
const prop = (id: string, over: Partial<RuleProposal>): RuleProposal => ({
  id,
  slotKey: "roomy:pads:front",
  partNumberNorm: "04465B1190",
  brandNorm: "toyota",
  carMakerNorm: "toyota",
  shape: "ok",
  passes: [],
  ...over,
});

Deno.test("RE-19: masuma + rockauto is Needs checking and goes to review", () => {
  const [r] = routeBySourceRule({
    shadowMode: false,
    proposals: [prop("p1", { brandNorm: "jtekt", passes: [pass("masuma.parts", "part_maker", "masuma"), pass("rockauto.com", "reference", "all")] })],
  });
  assertEquals([r.trust, r.trustRoute, r.route], ["needs_checking", null, "review"]);
});

Deno.test("RE-19 (c): two different part makers on the same number auto-add with both reads", () => {
  const [r] = routeBySourceRule({
    shadowMode: false,
    proposals: [prop("p1", { passes: [pass("sbparts.jp", "part_maker", "sb nagamochi"), pass("jnbk-brakes.com", "part_maker", "nibk")] })],
  });
  assertEquals([r.trust, r.trustRoute, r.route], ["confirmed", "c", "auto"]);
  assertEquals(r.evidenceReadIds, ["read-sbparts.jp-direct", "read-jnbk-brakes.com-direct"]);
});

Deno.test("RE-19 (b): a part maker's own part auto-adds; shadow mode only marks it", () => {
  const p = prop("p1", { brandNorm: "nibk", passes: [pass("jnbk-brakes.com", "part_maker", "nibk")] });
  assertEquals(routeBySourceRule({ shadowMode: false, proposals: [p] })[0].route, "auto");
  const shadow = routeBySourceRule({ shadowMode: true, proposals: [p] })[0];
  assertEquals([shadow.route, shadow.shadowWouldAuto, shadow.trustRoute], ["review", true, "b"]);
});

Deno.test("RE-19 (a): the car maker's catalogue confirms but never auto-adds; a browser check is owner_browser", () => {
  const direct = routeBySourceRule({ shadowMode: false, proposals: [prop("p1", { passes: [pass("amayama.com", "car_maker", "toyota")] })] })[0];
  assertEquals([direct.trust, direct.trustRoute, direct.route], ["confirmed", "a", "review"]);
  const browser = routeBySourceRule({
    shadowMode: false,
    proposals: [prop("p1", { passes: [pass("amayama.com", "car_maker", "toyota", "owner_browser")] })],
  })[0];
  assertEquals([browser.trustRoute, browser.route], ["owner_browser", "review"]);
});

Deno.test("RE-19: a car-maker site trusted for another maker does not confirm", () => {
  const [r] = routeBySourceRule({
    shadowMode: false,
    proposals: [prop("p1", { carMakerNorm: "honda", passes: [pass("amayama.com", "car_maker", "toyota")] })],
  });
  assertEquals(r.trust, "needs_checking");
});

Deno.test("RE-19: two confirmed numbers for one slot conflict and both go to review", () => {
  const out = routeBySourceRule({
    shadowMode: false,
    proposals: [
      prop("p1", { partNumberNorm: "A0001", brandNorm: "sb nagamochi", passes: [pass("sbparts.jp", "part_maker", "sb nagamochi")] }),
      prop("p2", { partNumberNorm: "B0002", brandNorm: "nibk", passes: [pass("jnbk-brakes.com", "part_maker", "nibk")] }),
    ],
  });
  assertEquals(out.map((r) => [r.conflict, r.route]), [[true, "review"], [true, "review"]]);
});

Deno.test("RE-19: different numbers in one interchange group are not a conflict", () => {
  const out = routeBySourceRule({
    shadowMode: false,
    proposals: [
      prop("p1", { partNumberNorm: "A0001", groupId: "g1", brandNorm: "sb nagamochi", passes: [pass("sbparts.jp", "part_maker", "sb nagamochi")] }),
      prop("p2", { partNumberNorm: "B0002", groupId: "g1", brandNorm: "nibk", passes: [pass("jnbk-brakes.com", "part_maker", "nibk")] }),
    ],
  });
  assertEquals(out.map((r) => r.conflict), [false, false]);
});

Deno.test("RE-19: an odd number shape never auto-adds", () => {
  const [r] = routeBySourceRule({
    shadowMode: false,
    proposals: [prop("p1", { shape: "review", brandNorm: "nibk", passes: [pass("jnbk-brakes.com", "part_maker", "nibk")] })],
  });
  assertEquals([r.trust, r.route], ["confirmed", "review"]);
});
