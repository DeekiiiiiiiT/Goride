// Stitch: dominion-redesign/15a24b12ad9e4893a6b13d7da4709860
import { describe, expect, it } from "vitest";
import { EMPTY_NEEDS, orderNeeds, wholePercent, type NeedKey } from "./placesHomeFormat";

const zero: Record<NeedKey, number> = {
  new_places: 0,
  learnt: 0,
  suggestions: 0,
  evidence: 0,
  pin_unchecked: 0,
  verified_pin_unchecked: 0,
  no_brand: 0,
  area_parish_only: 0,
};

describe("needs you", () => {
  it("puts review lanes first, then the data rows in screen order, and hides zeros", () => {
    expect(orderNeeds({
      ...zero,
      new_places: 148,
      pin_unchecked: 217,
      verified_pin_unchecked: 69,
      no_brand: 65,
      area_parish_only: 217,
    })).toEqual([
      "new_places",
      "pin_unchecked",
      "verified_pin_unchecked",
      "no_brand",
      "area_parish_only",
    ]);
  });

  it("is empty when every count is zero", () => {
    expect(orderNeeds(zero)).toEqual([]);
    expect(EMPTY_NEEDS).toBe("Nothing waiting. Places and the map are up to date.");
  });
});

describe("percentages", () => {
  it("rounds a share and keeps a missing score blank", () => {
    expect(wholePercent(32.4)).toBe("32%");
    expect(wholePercent(null)).toBe("—");
  });
});
