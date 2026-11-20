import { describe, expect, it } from "vitest";
import {
  askNeedText,
  brandNumbersFromLookup,
  carNameOf,
  copyCarOf,
  findQueryFor,
  makerTile,
  nameWithMakerName,
  PARTS_FIT_COPY,
  partCopyText,
  partsFromFindBody,
  carSizeLine,
  shortDate,
} from "./partsThatFit";

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

  it("reads the car's own size (owner 20 Nov: car maker's answer first)", () => {
    const out = partsFromFindBody({
      car: { make: "Toyota", model: "Roomy" },
      plainSections: [],
      carSizes: [{ specKey: "battery_jis", label: "Battery size", value: "M-42", unit: null, type: "EFB", fromCarMaker: true }, { specKey: "x" }],
    });
    expect(out.carMake).toBe("Toyota");
    expect(out.carSizes).toEqual([{ specKey: "battery_jis", label: "Battery size", value: "M-42", unit: null, type: "EFB", fromCarMaker: true }]);
    expect(carSizeLine(out.carSizes[0])).toBe("Battery size: M-42 · EFB");
    expect(PARTS_FIT_COPY.carSizeTitle("Toyota", true)).toBe("Toyota lists for your car");
    expect(PARTS_FIT_COPY.carSizeTitle("Toyota", false)).toBe("Your car takes");
  });

  it("survives junk", () => {
    expect(partsFromFindBody(null).parts).toEqual([]);
    expect(partsFromFindBody(null).carSizes).toEqual([]);
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
    expect(askNeedText("Oxygen sensor", ["Rear (Oxygen sensor No.2)"])).toBe("Oxygen sensor · Rear (Oxygen sensor No.2)");
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

describe("Copy part info (same block as Find parts)", () => {
  const body = {
    linked: true,
    car: { make: "Toyota", model: "Roomy", year: 2019 },
    pickedVariantId: "var-1",
    picked: { id: "var-1", chassis_code: "M900A", engine_code: "1KR-FE", drivetrain: "2WD" },
    plainSections: [],
  };

  it("reads the car line and chassis / engine / drive from the find answer", () => {
    expect(copyCarOf(body)).toEqual({ line: "Toyota Roomy 2019", chassis: "M900A", engine: "1KR-FE", drive: "2WD", variantId: "var-1" });
  });

  it("car, details, part, whose number, other brands — like Find parts' Copy part info", () => {
    const text = partCopyText(
      copyCarOf(body),
      { name: "Front oxygen sensor", brand: "Toyota", number: "89467-B1040" },
      brandNumbersFromLookup({ reference: { brand: "Toyota", number: "89467-B1040" }, brandNumbers: [{ brand: "Denso", number: "234-9119" }] }),
    );
    expect(text).toBe(
      [
        "Toyota Roomy 2019",
        "Chassis: M900A · Engine: 1KR-FE · Drive: 2WD",
        "Front oxygen sensor",
        "Toyota number: 89467-B1040",
        "Also sold as: Denso 234-9119",
      ].join("\n"),
    );
  });

  it("missing facts are left out, never guessed", () => {
    expect(partCopyText(null, { name: "Rear oxygen sensor", brand: "", number: "89465-B1120" })).toBe(
      "Rear oxygen sensor\nPart number: 89465-B1120",
    );
  });
});

describe("nameWithMakerName (Toyota's own name in brackets)", () => {
  it("adds the maker's name from the one place picked", () => {
    expect(nameWithMakerName("Front oxygen sensor", ["Front (Air fuel ratio sensor)"])).toBe("Front oxygen sensor (Air fuel ratio sensor)");
    expect(nameWithMakerName("Rear oxygen sensor", ["Rear (Oxygen sensor No.2)"])).toBe("Rear oxygen sensor (Oxygen sensor No.2)");
  });
  it("leaves the name alone for several places, no bracket, or when it already says it", () => {
    expect(nameWithMakerName("Oxygen sensor", ["Front (Air fuel ratio sensor)", "Rear (Oxygen sensor No.2)"])).toBe("Oxygen sensor");
    expect(nameWithMakerName("Front brake pad set", ["Front"])).toBe("Front brake pad set");
    expect(nameWithMakerName("Air fuel ratio sensor", ["Front (Air fuel ratio sensor)"])).toBe("Air fuel ratio sensor");
    expect(nameWithMakerName("Front oxygen sensor")).toBe("Front oxygen sensor");
  });
});

describe("Fits by size (owner 20 Nov)", () => {
  it("a part matched on the car's size spec (tier 5) reads Fits by size", () => {
    const out = partsFromFindBody({
      plainSections: [{ items: [{ partId: "bat", name: "Battery", brand: "GS Yuasa", number: "ER-M-55/55B20L", tier: 5, status: "verified" }] }],
    });
    expect(out.parts[0].fitLabel).toBe("fits_by_size");
    expect(PARTS_FIT_COPY.badge.fits_by_size).toBe("Fits by size");
  });
});
