import { describe, expect, it } from "vitest";
import { formatJmd, formatRefNo } from "./inventoryFormat";

describe("inventoryFormat", () => {
  it("formats JMD with J$ style locale", () => {
    expect(formatJmd(5400)).toMatch(/5,400/);
  });

  it("formatRefNo returns dash for empty", () => {
    expect(formatRefNo("")).toBe("—");
    expect(formatRefNo("RCV-8821")).toBe("RCV-8821");
  });
});
