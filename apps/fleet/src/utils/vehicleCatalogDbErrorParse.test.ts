import { describe, it, expect } from "vitest";
import {
  mergeCatalogTrimIntoTrimSeriesInPlace,
  parseMissingColumnFromVehicleCatalogDbError,
} from "../supabase/functions/server/vehicle_catalog_schema_fallback.ts";

describe("parseMissingColumnFromVehicleCatalogDbError", () => {
  it("parses PostgreSQL undefined_column message", () => {
    expect(
      parseMissingColumnFromVehicleCatalogDbError({
        message: 'column "full_model_code" of relation "vehicle_catalog" does not exist',
      }),
    ).toBe("full_model_code");
  });

  it("parses PostgREST schema-cache phrasing", () => {
    expect(
      parseMissingColumnFromVehicleCatalogDbError({
        message: "Could not find the 'trim_suffix_code' column of 'vehicle_catalog' in the schema cache",
      }),
    ).toBe("trim_suffix_code");
  });
});

describe("mergeCatalogTrimIntoTrimSeriesInPlace", () => {
  it("joins trim into series before catalog_trim is dropped", () => {
    const row: Record<string, unknown> = { trim_series: "Pre-Facelift", catalog_trim: "Custom G" };
    mergeCatalogTrimIntoTrimSeriesInPlace(row);
    expect(row.trim_series).toBe("Pre-Facelift · Custom G");
  });
});
