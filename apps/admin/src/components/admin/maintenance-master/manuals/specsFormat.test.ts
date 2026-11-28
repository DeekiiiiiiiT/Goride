import { describe, expect, it } from "vitest";
import { nowText, pageListText, specLabel, specValueText } from "./specsFormat";
import { pageChips, parsePrintedPages } from "./UploadManualDialog";

describe("pages are shown as the numbers printed in the book (DOC-03/04)", () => {
  it("the Roomy owner's manual: printed = PDF − 4, front memo page has no printed number", () => {
    // PDF 3 (front memo), 406–411, 416–417, 524–530
    const pdf = [3, 406, 407, 408, 409, 410, 411, 416, 417, 524, 525, 526, 527, 528, 529, 530];
    expect(pageChips(pdf, 4).map((c) => c.label)).toEqual(["Front page 3", "402–407", "412–413", "520–526"]);
  });

  it("typing printed pages adds the right PDF pages, inside the PDF only", () => {
    expect(parsePrintedPages("402–404, 413", 4, 568)).toEqual([406, 407, 408, 417]);
    expect(parsePrintedPages("600", 4, 568)).toEqual([]);
  });

  it("a sheet with no offset is one chip", () => {
    expect(pageChips([5], 0).map((c) => c.label)).toEqual(["5"]);
  });

  it("compact list text", () => {
    expect(pageListText([402, 403, 404, 412, 413, 520])).toBe("402–404, 412–413, 520");
  });
});

describe("specs in plain words (DOC-06)", () => {
  it("oil capacity with the filter figure and an allowed grade", () => {
    expect(specValueText({ kind: "fluid", value: { value: "2.9", unit: "L", with_filter: 3.1 } })).toBe("2.9 L · 3.1 L with filter");
    expect(specValueText({ kind: "fluid", value: { value: "0W-20", also: ["5W-30"] } })).toBe("0W-20 (also 5W-30)");
    expect(specLabel({ kind: "fluid", key: "engine_oil_capacity_l" })).toBe("Engine oil capacity");
  });

  it("tyres and bulbs", () => {
    expect(
      specValueText({ kind: "tyre", value: { size: "175/55R15", load_speed_index: "77V", wheel_size: "15×5J", pressure_kpa: 250, is_optional: true } }),
    ).toBe("175/55R15 77V · 15×5J · 250 kPa · optional");
    expect(specValueText({ kind: "bulb", value: { bulb_ref: "H4", wattage_w: "60/55" } })).toBe("H4 · 60/55 W");
    expect(specValueText({ kind: "bulb", value: { bulb_ref: "LED", is_led: true } })).toBe("LED");
    expect(specValueText({ kind: "bulb", value: { bulb_ref: "Unknown" } })).toBe("Not printed — check the page");
  });

  it("Now shows only the ticked versions' values", () => {
    const now = [
      { vehicle_catalog_id: "a", value: "36 L" },
      { vehicle_catalog_id: "b", value: "36 L" },
    ];
    expect(nowText({ now, version_ids: ["b"] })).toBe("36 L");
    expect(nowText({ now, version_ids: [] })).toBe("—");
  });
});
