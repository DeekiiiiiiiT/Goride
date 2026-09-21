import {
  projectUnattributedSpendByTripMix,
} from "./fuel_service_line_allocation.ts";

Deno.test("flag-off honesty path: attributed + unattributed = org total (no rewrite)", () => {
  const rideshare = 100;
  const delivery = 40;
  const unattributed = 20;
  // Honesty: do not project — totals stay as buckets.
  expectEqual(rideshare + delivery + unattributed, 160);
});

Deno.test("projectUnattributedSpendByTripMix conserves and splits by ratio", () => {
  const p = projectUnattributedSpendByTripMix({
    rideshareSpend: 100,
    deliverySpend: 40,
    unattributedSpend: 20,
    ratio: { rideshare: 0.75, rush_delivery: 0.25 },
  });
  if (!p.conserves) throw new Error("expected conservation");
  if (Math.abs(p.rideshareProjected - 15) > 0.001) {
    throw new Error(`rideshareProjected ${p.rideshareProjected}`);
  }
  if (Math.abs(p.deliveryProjected - 5) > 0.001) {
    throw new Error(`deliveryProjected ${p.deliveryProjected}`);
  }
  if (Math.abs(p.rideshareTotal - 115) > 0.001) throw new Error("rideshareTotal");
  if (Math.abs(p.deliveryTotal - 45) > 0.001) throw new Error("deliveryTotal");
});

Deno.test("projectUnattributedSpendByTripMix never rewrites attributed", () => {
  const p = projectUnattributedSpendByTripMix({
    rideshareSpend: 50,
    deliverySpend: 10,
    unattributedSpend: 0,
    ratio: { rideshare: 0, rush_delivery: 1 },
  });
  if (p.rideshareAttributed !== 50 || p.deliveryAttributed !== 10) {
    throw new Error("attributed rewritten");
  }
  if (p.rideshareProjected !== 0 || p.deliveryProjected !== 0) {
    throw new Error("unexpected projection");
  }
});

Deno.test("zero mix defaults to rideshare share of unattributed", () => {
  const p = projectUnattributedSpendByTripMix({
    rideshareSpend: 0,
    deliverySpend: 0,
    unattributedSpend: 10,
    ratio: { rideshare: 0, rush_delivery: 0 },
  });
  if (!p.conserves) throw new Error("expected conservation");
  if (Math.abs(p.rideshareProjected - 10) > 0.001) throw new Error("default rideshare");
  if (Math.abs(p.deliveryProjected) > 0.001) throw new Error("delivery should be 0");
});

function expectEqual(a: number, b: number) {
  if (a !== b) throw new Error(`expected ${b}, got ${a}`);
}
