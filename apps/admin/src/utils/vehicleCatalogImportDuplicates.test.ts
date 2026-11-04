import { describe, expect, it } from "vitest";
import {
  catalogImportNonBlankPatch,
  classifyCatalogImportRows,
  vehicleCatalogIdentityKey,
  type ParsedCatalogImportRow,
} from "./vehicleCatalogCsvImport";

const row = (rowIndex: number, p: Record<string, unknown>, catalogId?: string): ParsedCatalogImportRow =>
  ({ rowIndex, payload: p as ParsedCatalogImportRow["payload"], ...(catalogId ? { catalogId } : {}) });

const roomy = { make: "Toyota", model: "Roomy", chassis_code: "M900A", engine_code: "1KR-FE", production_start_year: 2016 };

describe("vehicle catalog import duplicates", () => {
  it("same car ignores case, spacing and non-identity specs", () => {
    expect(vehicleCatalogIdentityKey(roomy)).toBe(
      vehicleCatalogIdentityKey({ ...roomy, make: " toyota ", model: "ROOMY", tire_size: "175/55R15" } as never),
    );
    expect(vehicleCatalogIdentityKey(roomy)).not.toBe(vehicleCatalogIdentityKey({ ...roomy, engine_code: "1KR-VET" }));
    // Different trim on the same chassis + engine is a different car (BMW 320i vs 330i, both G20 / B48).
    const g20 = { make: "BMW", model: "3 Series", chassis_code: "G20", engine_code: "B48", production_start_year: 2019 };
    expect(vehicleCatalogIdentityKey({ ...g20, catalog_trim: "320i" })).not.toBe(
      vehicleCatalogIdentityKey({ ...g20, catalog_trim: "330i" }),
    );
  });

  it("classifies new, existing, in-file duplicate, with-id and invalid rows", () => {
    const rows: ParsedCatalogImportRow[] = [
      row(2, roomy),
      row(3, { ...roomy, model: "Tank" }),
      row(4, { ...roomy, tire_size: "different" }),
      row(5, { ...roomy, model: "Thor", make: "Daihatsu" }, "11111111-1111-4111-8111-111111111111"),
      { rowIndex: 6, parseError: "bad" },
    ];
    const c = classifyCatalogImportRows(rows, [{ id: "existing-roomy", ...roomy }]);
    expect(c.get(2)).toEqual({ kind: "existing", existingId: "existing-roomy" });
    expect(c.get(3)).toEqual({ kind: "new" });
    expect(c.get(4)).toEqual({ kind: "duplicate_in_file", duplicateOfRow: 2 });
    expect(c.get(5)).toEqual({ kind: "has_id" });
    expect(c.get(6)).toEqual({ kind: "invalid" });
  });

  it("blank cells never overwrite stored values on update", () => {
    expect(catalogImportNonBlankPatch({ make: "Toyota", width_mm: null, trim: "", note: "  ", length_mm: 0 })).toEqual({
      make: "Toyota",
      length_mm: 0,
    });
  });
});
