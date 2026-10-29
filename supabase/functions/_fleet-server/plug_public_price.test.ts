/**
 * A fleet fill records an intake row. The database publishes the public price.
 */
import { assertEquals } from "jsr:@std/assert";
import { submitFleetPriceReport } from "./plug_public_price.ts";

Deno.test("submitFleetPriceReport writes the intake table only", async () => {
  const tables: string[] = [];
  const inserted: Record<string, unknown>[] = [];
  const client = {
    schema: () => ({
      from: (table: string) => {
        tables.push(table);
        return {
          insert: async (row: Record<string, unknown>) => {
            inserted.push(row);
            return { error: null };
          },
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: { message: "skip" } }),
            }),
          }),
        };
      },
    }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  };

  await submitFleetPriceReport({
    id: "fill-1",
    liters: 40,
    amount: 9168,
    matchedStationId: "station-1",
    organizationId: "org-1",
    driverId: "driver-1",
    fuelType: "Gasoline_87",
    metadata: { stationResolutionState: "verified", jaaFuelType: "ADO" },
  }, client as never);

  assertEquals(tables.includes("fleet_price_report"), true);
  assertEquals(tables.includes("price_observation"), false);
  assertEquals(tables.includes("price_current"), false);
  assertEquals(tables.includes("public_place"), false);
  assertEquals(inserted[0]?.grade, "e10_87");
  assertEquals(inserted[0]?.grade_source, "fill");
});
