import { describe, it, expect } from "vitest";
import { parseMissingColumnFromVehicleCatalogDbError } from "../supabase/functions/server/vehicle_catalog_schema_fallback.ts";

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
