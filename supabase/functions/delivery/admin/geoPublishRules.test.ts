import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decideMerchantMove,
  overlayZonesForCompile,
  shouldDeletePendingGrid,
} from "./geoPublishRules.ts";

Deno.test("a live merchant is not moved onto an inactive market", () => {
  assertEquals(
    decideMerchantMove({
      currentMarketId: "spanish-town",
      currentLive: true,
      suggestedMarketId: "constant-spring",
      suggestedLive: false,
    }),
    null,
  );
});

Deno.test("a merchant already on the suggested market is not listed", () => {
  assertEquals(
    decideMerchantMove({
      currentMarketId: "spanish-town",
      currentLive: true,
      suggestedMarketId: "spanish-town",
      suggestedLive: true,
    }),
    null,
  );
});

Deno.test("a pin outside every zone stays put", () => {
  assertEquals(
    decideMerchantMove({
      currentMarketId: "spanish-town",
      currentLive: true,
      suggestedMarketId: null,
      suggestedLive: false,
    }),
    null,
  );
});

Deno.test("a move onto another live market is kept", () => {
  assertEquals(
    decideMerchantMove({
      currentMarketId: "spanish-town",
      currentLive: true,
      suggestedMarketId: "portmore",
      suggestedLive: true,
    }),
    "portmore",
  );
});

Deno.test("town compile uses the new shape only on the linked include zone", () => {
  const zones = overlayZonesForCompile(
    [
      { kind: "include", boundary_pcode: "JM-TOWN", polygon: [{ lat: 1, lng: 1 }] },
      { kind: "exclude", boundary_pcode: "JM-TOWN-hole-1", polygon: [{ lat: 2, lng: 2 }] },
      { kind: "include", boundary_pcode: "OTHER", polygon: [{ lat: 3, lng: 3 }] },
    ],
    "JM-TOWN",
    [{ outer: [{ lat: 18, lng: -77 }] }],
    false,
  );
  assertEquals(zones[0].polygon as unknown, [{ outer: [{ lat: 18, lng: -77 }] }]);
  assertEquals(zones[1].polygon as unknown, [{ lat: 2, lng: 2 }]);
  assertEquals(zones[2].polygon as unknown, [{ lat: 3, lng: 3 }]);
});

Deno.test("parish-border compile uses the new parish shape and keeps no-go zones", () => {
  const zones = overlayZonesForCompile(
    [
      { kind: "include", boundary_pcode: "OLD", polygon: [{ lat: 1, lng: 1 }] },
      { kind: "exclude", polygon: [{ lat: 9, lng: 9 }] },
    ],
    "JM-PARISH",
    [{ outer: [{ lat: 18, lng: -76 }] }],
    true,
  );
  assertEquals(zones.length, 2);
  assertEquals(zones[0].kind, "include");
  assertEquals(zones[0].boundary_pcode, "JM-PARISH");
  assertEquals(zones[1].kind, "exclude");
});

Deno.test("a failed save drops the unpublished grid and a successful save keeps it", () => {
  assertEquals(shouldDeletePendingGrid(false), true);
  assertEquals(shouldDeletePendingGrid(true), false);
});
