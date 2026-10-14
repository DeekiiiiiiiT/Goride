import { describe, expect, it } from "vitest";
import { parsePartsCatalogCsv } from "@roam/types/partsCatalogCsvImport";

describe("parts catalog csv", () => {
  it("reads a powertrain row and rejects a body part on an engine rule", () => {
    const parsed = parsePartsCatalogCsv([
      "interchange_code,manufacturer,part_number,part_name,part_kind,fit_scope,target_kind,target_code,component_op_code,category_slug",
      "IC-OIL,Toyota,90915-YZZD2,Oil filter,oem,powertrain,engine_family,1NZ-FE,ENG-OIL,filters",
      "IC-BUMP,Toyota,123,Bumper,oem,body,engine_family,1NZ-FE,BRK-PADS,bumpers",
    ].join("\n"));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.targetCode).toBe("1NZ-FE");
    expect(parsed.errors).toHaveLength(1);
  });
});
