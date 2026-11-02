import { describe, expect, it } from "vitest";
import {
  buildImportColumnRows,
  DEFAULT_IMPORT_TEMPLATE_COLUMNS,
  headerAlignmentSummary,
  parseImportCsvHeaders,
} from "./importCsvHeader";

const brakesHeader = `vehicle,part_type,brand,part_number,match_type,year_from,year_to,source_url,position
Toyota Roomy,BRK-PADS,Toyota,04465-02230,oem,2019,2019,https://example.com,Front`;

describe("importCsvHeader", () => {
  it("parses brakes fixture headers", () => {
    const { mapped, headerErrors } = parseImportCsvHeaders(brakesHeader);
    expect(headerErrors).toEqual([]);
    expect(mapped).toContain("position");
    expect(mapped).not.toContain("part_name");
  });

  it("builds column rows with optional gaps and color statuses", () => {
    const { headers, mapped } = parseImportCsvHeaders(brakesHeader);
    const rows = buildImportColumnRows(DEFAULT_IMPORT_TEMPLATE_COLUMNS, mapped, headers, true);
    const inFile = rows.filter((r) => r.status === "in_file");
    const missingOptional = rows.filter((r) => r.status === "missing_optional");
    expect(inFile.map((r) => r.name)).toEqual(
      expect.arrayContaining(["vehicle", "part_type", "brand", "part_number", "match_type", "year_from", "year_to", "source_url", "position"]),
    );
    expect(missingOptional.map((r) => r.name)).toEqual(
      expect.arrayContaining(["part_name", "replaces_oem_number", "side", "note"]),
    );
    expect(headerAlignmentSummary(rows).ok).toBe(true);
  });
});
