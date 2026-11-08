import { describe, expect, it } from "vitest";
import { parseFrameCodesFromUrl } from "./linkFrameCodes";

describe("D3 parseFrameCodesFromUrl", () => {
  it("reads M900A from Partsouq-style link", () => {
    const url =
      "https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M900A-AGBGE/category/2/diagram/4601/illustration/461556B";
    expect(parseFrameCodesFromUrl(url)).toContain("M900A");
  });

  it("returns empty for non-url", () => {
    expect(parseFrameCodesFromUrl("not a link")).toEqual([]);
  });
});
