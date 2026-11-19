import { describe, expect, it } from "vitest";
import { askNeedText, carNameOf, findQueryFor, makerTile, PARTS_FIT_COPY, partsFromFindBody, shortDate } from "./partsThatFit";

describe("partsFromFindBody", () => {
  it("flattens sections in order, one card per part, keeps the fit label", () => {
    const out = partsFromFindBody({
      linked: true,
      car: { make: "Toyota", model: "Roomy", year: 2019 },
      plainSections: [
        { tier: 1, items: [{ partId: "p1", name: "Front oxygen sensor", brand: "Toyota (genuine)", number: "89467-B1040", fitLabel: "made_for_car", status: "verified", tier: 1 }] },
        {
          tier: 2,
          items: [
            { partId: "p2", name: "Front oxygen sensor", brand: "Denso", number: "234-9119", fitLabel: "also_fits", status: "verified", tier: 2 },
            { partId: "p1", name: "dup", brand: "x", number: "y", tier: 2 },
            { partId: "", name: "universal", brand: "", number: "" },
          ],
        },
        { tier: 3, items: [{ partId: "p3", name: "Front oxygen sensor", brand: "NGK", number: "24341", status: "needs_checking", tier: 3 }] },
      ],
      ask: { state: "none", askedAt: null, byYou: false },
    });
    expect(out.carName).toBe("Toyota Roomy");
    expect(out.parts.map((p) => [p.partId, p.fitLabel])).toEqual([
      ["p1", "made_for_car"],
      ["p2", "also_fits"],
      ["p3", "check_before_buying"],
    ]);
    expect(out.parts[2].verified).toBe(false);
    expect(out.ask).toEqual({ state: "none", askedAt: null, byYou: false });
  });

  it("a car not linked to Dominion has no parts and no ask", () => {
    const out = partsFromFindBody({ linked: false, make: "Toyota", model: "Roomy" });
    expect(out.linked).toBe(false);
    expect(out.parts).toEqual([]);
    expect(out.ask).toBeNull();
    expect(out.carName).toBe("Toyota Roomy");
  });

  it("reads the looking state", () => {
    const out = partsFromFindBody({ plainSections: [], ask: { state: "looking", askedAt: "2026-11-18T10:00:00Z", byYou: true } });
    expect(out.ask?.state).toBe("looking");
    expect(out.ask?.askedAt).toBe("2026-11-18T10:00:00Z");
  });

  it("survives junk", () => {
    expect(partsFromFindBody(null).parts).toEqual([]);
    expect(carNameOf(null)).toBeNull();
  });
});

describe("helpers", () => {
  it("findQueryFor sends places as picked, Not sure included", () => {
    expect(findQueryFor("car", "job", ["after_cat"])).toEqual({ vehicleId: "car", componentId: "job", places: "after_cat" });
    expect(findQueryFor("car", "job", ["unknown"])).toEqual({ vehicleId: "car", componentId: "job", places: "unknown" });
    expect(findQueryFor("car", "job", [])).toEqual({ vehicleId: "car", componentId: "job" });
  });

  it("ask text is the job and place in words, never a number", () => {
    expect(askNeedText("Oxygen sensor", ["Rear (after converter)"])).toBe("Oxygen sensor · Rear (after converter)");
    expect(askNeedText("Exhaust clip", [])).toBe("Exhaust clip");
  });

  it("copy", () => {
    expect(PARTS_FIT_COPY.title("Toyota Roomy")).toBe("Parts that fit your Toyota Roomy");
    expect(PARTS_FIT_COPY.using("Toyota (genuine)", "Front oxygen sensor")).toBe("Using Toyota (genuine) front oxygen sensor");
    expect(shortDate("2026-11-18")).toBe("18 Nov 2026");
    expect(shortDate("")).toBe("");
    expect(makerTile("Denso").text).toBe("DENSO");
    expect(makerTile("Toyota (genuine)").text).toBe("TOYOTA");
  });
});
