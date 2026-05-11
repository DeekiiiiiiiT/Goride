import { describe, it, expect } from "vitest";
import { extractChassisPrefix } from "./chassisPrefix";

describe("extractChassisPrefix", () => {
  it("strips a >=5 digit unit serial from a single-token chassis", () => {
    expect(extractChassisPrefix("M900A0344862")).toBe("M900A");
  });

  it("returns the middle segment of a dash-separated full model code", () => {
    expect(extractChassisPrefix("DBA-M900A-GBME")).toBe("M900A");
  });

  it("strips the unit serial from a 17-char VIN", () => {
    expect(extractChassisPrefix("JTDBR32E430123456")).toBe("JTDBR32E43");
  });

  it("uppercases and trims whitespace", () => {
    expect(extractChassisPrefix("  m900a0344862  ")).toBe("M900A");
  });

  it("collapses internal whitespace inside the chassis token", () => {
    expect(extractChassisPrefix("M900A 0344862")).toBe("M900A");
  });

  it("returns the input when no trailing digit run is present", () => {
    expect(extractChassisPrefix("M900A")).toBe("M900A");
  });

  it("falls back to the only segment when dash-split yields one token", () => {
    expect(extractChassisPrefix("-M900A-")).toBe("M900A");
  });

  it("returns empty string for null input", () => {
    expect(extractChassisPrefix(null)).toBe("");
  });

  it("returns empty string for undefined input", () => {
    expect(extractChassisPrefix(undefined)).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(extractChassisPrefix("   ")).toBe("");
  });
});
