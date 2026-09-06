import { describe, expect, it } from "vitest";
import { CSV_UTF8_BOM, csvRow, csvSafeCell } from "./csvSafeExport";

describe("csvSafeExport (S1-12)", () => {
  it("quotes every field", () => {
    expect(csvSafeCell("abc")).toBe('"abc"');
    expect(csvSafeCell(123)).toBe('"123"');
  });

  it("neutralises formula injection prefixes", () => {
    expect(csvSafeCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvSafeCell("+cmd")).toBe(`"'+cmd"`);
    expect(csvSafeCell("-1+1")).toBe(`"'-1+1"`);
    expect(csvSafeCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
  });

  it("escapes embedded quotes", () => {
    expect(csvSafeCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("builds a full row with quoted driver id", () => {
    const row = csvRow(["id,with,comma", "=cmd", "Kenny"]);
    expect(row).toBe(`"id,with,comma","'=cmd","Kenny"`);
  });

  it("exposes UTF-8 BOM for Excel", () => {
    expect(CSV_UTF8_BOM).toBe("\uFEFF");
  });
});
