import { describe, expect, it } from "vitest";
import {
  dominionCategoryBadge,
  dominionMatchRowIcon,
  formatFleetWhyLine,
  formatMatchWhyLine,
} from "./partMatchReason";

describe("formatMatchWhyLine", () => {
  it("kept fit_source overrides listed_direct reason code", () => {
    expect(formatMatchWhyLine("listed_direct", { part_listing_id: "x" }, "kept")).toBe(
      "You kept this automatic match",
    );
  });

  it("universal_spec lists every spec from jsonb array params", () => {
    expect(
      formatMatchWhyLine("universal_spec", [
        { spec_key: "pad_length_mm", value: "114.5", unit: "mm" },
        { spec_key: "pad_height_mm", value: "48.0", unit: "mm" },
        { spec_key: "pad_thickness_mm", value: "15.5", unit: "mm" },
      ], "universal"),
    ).toBe(
      "Universal spec · pad length 114.5 mm · pad height 48.0 mm · pad thickness 15.5 mm",
    );
  });
});

describe("formatFleetWhyLine", () => {
  const roomy = { carShortName: "Roomy" };

  it("kept fit_source", () => {
    expect(formatFleetWhyLine("listed_direct", {}, "kept", roomy)).toBe("You kept this automatic match");
  });

  it("oe_number_superseded", () => {
    expect(
      formatFleetWhyLine(
        "oe_number_superseded",
        { from: "04465-B1190", to: "04465-B1191", oe_number: "04465-B1190" },
        "derived",
        roomy,
      ),
    ).toBe("Factory number for your Roomy (04465-B1190, now 04465-B1191)");
  });

  it("via_sister", () => {
    expect(
      formatFleetWhyLine(
        "via_sister",
        { platform_code: "DAI-M900", source_vehicle_id: "daihatsu-thor-variant" },
        "derived",
        { ...roomy, sisterModelName: "Daihatsu Thor" },
      ),
    ).toBe("Same part as the Daihatsu Thor, the sister of your Roomy");
  });

  it("via_platform_link with brake pad position", () => {
    expect(
      formatFleetWhyLine(
        "via_platform_link",
        { platform_code: "MAZ-DE", source_tier: 1 },
        "derived",
        { ...roomy, linkComponentName: "brake pad", positionLabel: "Front" },
      ),
    ).toBe("Shares front brake pads with a related car family");
  });

  it("via_engine", () => {
    expect(formatFleetWhyLine("via_engine", { engine_code: "1KR-FE" }, "derived", roomy)).toBe(
      "Fits your engine family (1KR-FE)",
    );
  });

  it("oe_number aftermarket replacement", () => {
    expect(
      formatFleetWhyLine("oe_number", { oe_number: "04465-B1191", oe_brand: "Toyota" }, "derived", roomy),
    ).toBe("Replaces your factory number 04465-B1191");
  });

  it("index_badge WVA cross", () => {
    expect(
      formatFleetWhyLine(
        "index_badge",
        { index_type: "wva", value: "24551" },
        "derived",
        { ...roomy, indexEquivalentLabel: "MK Kashiyama D0051M-01-J" },
      ),
    ).toBe("Same size as MK Kashiyama D0051M-01-J (WVA 24551)");
  });

  it("universal_spec pad dimensions", () => {
    expect(
      formatFleetWhyLine(
        "universal_spec",
        [
          { spec_key: "pad_length_mm", value: "116.0", unit: "mm" },
          { spec_key: "pad_height_mm", value: "44.5", unit: "mm" },
          { spec_key: "pad_thickness_mm", value: "15.0", unit: "mm" },
        ],
        "universal",
        roomy,
      ),
    ).toBe("Matches your factory pad width (116.0 mm), height (44.5 mm) and calliper clips");
  });

  it("listed_direct", () => {
    expect(formatFleetWhyLine("listed_direct", { part_listing_id: "x" }, "listed", roomy)).toBe(
      "Hand-entered listing for this car",
    );
  });

  it("unknown reason code", () => {
    expect(formatFleetWhyLine("custom_code", {}, "derived", roomy)).toBe("Matched");
  });
});

describe("dominionCategoryBadge", () => {
  it("OEM Direct for listed tier-1 factory line", () => {
    expect(dominionCategoryBadge({
      via: "direct",
      reasonCode: "listed_direct",
      partKind: "oem",
      tier: 1,
      fitSource: "listed",
    })).toBe("OEM Direct");
  });

  it("OEM Supersession", () => {
    expect(dominionCategoryBadge({
      via: "direct",
      reasonCode: "oe_number_superseded",
      partKind: "oem",
      tier: 1,
      fitSource: "kept",
    })).toBe("OEM Supersession");
  });

  it("Platform Sister vs Badge Clone by fit_source", () => {
    expect(dominionCategoryBadge({
      via: "sister",
      reasonCode: "via_sister",
      partKind: "oem",
      tier: 2,
      fitSource: "derived",
    })).toBe("Platform Sister");
    expect(dominionCategoryBadge({
      via: "sister",
      reasonCode: "listed_direct",
      partKind: "oem",
      tier: 2,
      fitSource: "listed",
    })).toBe("Badge Clone");
  });

  it("Shared Caliper Fit from link component name", () => {
    expect(dominionCategoryBadge({
      via: "platform_link",
      reasonCode: "via_platform_link",
      partKind: "oem",
      tier: 3,
      fitSource: "derived",
      linkComponentName: "caliper",
    })).toBe("Shared Caliper Fit");
  });

  it("Carrier Match for engine via", () => {
    expect(dominionCategoryBadge({
      via: "engine",
      reasonCode: "listed_direct",
      partKind: "oem",
      tier: 3,
      fitSource: "kept",
    })).toBe("Carrier Match");
  });

  it("Tier-1 Aftermarket and Direct Supplier OE", () => {
    expect(dominionCategoryBadge({
      via: "direct",
      reasonCode: "listed_direct",
      partKind: "aftermarket",
      tier: 4,
      fitSource: "listed",
    })).toBe("Tier-1 Aftermarket");
    expect(dominionCategoryBadge({
      via: "direct",
      reasonCode: "listed_direct",
      partKind: "oe_supplier",
      tier: 4,
      fitSource: "kept",
    })).toBe("Direct Supplier OE");
  });

  it("Universal Spec vs Dimension Match from match_reason_params", () => {
    expect(dominionCategoryBadge({
      via: "universal",
      reasonCode: "universal_spec",
      partKind: "universal",
      tier: 5,
      fitSource: "universal",
      matchReasonParams: [{ spec_key: "engine_oil_grade", value: "0W-20", unit: null }],
    })).toBe("Universal Spec");
    expect(dominionCategoryBadge({
      via: "universal",
      reasonCode: "universal_spec",
      partKind: "universal",
      tier: 5,
      fitSource: "universal",
      matchReasonParams: [
        { spec_key: "pad_length_mm", value: "114.5", unit: "mm" },
        { spec_key: "pad_height_mm", value: "48.0", unit: "mm" },
        { spec_key: "pad_thickness_mm", value: "15.5", unit: "mm" },
      ],
    })).toBe("Dimension Match");
  });
});

describe("dominionMatchRowIcon", () => {
  it("maps row kinds to Stitch icons", () => {
    expect(dominionMatchRowIcon({ via: "direct", reasonCode: "listed_direct", tier: 1 })).toBe("link");
    expect(dominionMatchRowIcon({ via: "direct", reasonCode: "oe_number_superseded", tier: 1 })).toBe("swap_horiz");
    expect(dominionMatchRowIcon({ via: "sister", tier: 2 })).toBe("device_hub");
    expect(dominionMatchRowIcon({ via: "platform_link", matchStatus: "needs_checking", tier: 3 })).toBe("report_problem");
    expect(dominionMatchRowIcon({ via: "engine", tier: 3 })).toBe("check");
    expect(dominionMatchRowIcon({ via: "direct", partKind: "aftermarket", tier: 4 })).toBe("alt_route");
    expect(dominionMatchRowIcon({ via: "universal", tier: 5 })).toBe("square_foot");
  });
});
