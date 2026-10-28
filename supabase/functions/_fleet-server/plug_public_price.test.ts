/**
 * A published fleet price writes price_current only.
 * The database trigger refreshes the public card.
 */
import { assertEquals } from "jsr:@std/assert";
import { noteFleetPrice } from "./plug_public_price.ts";

Deno.test("noteFleetPrice writes price tables and never the public station view", async () => {
  const tables: string[] = [];
  const client = {
    schema: () => ({
      rpc: async () => ({ data: 250, error: null }),
      from: (table: string) => {
        tables.push(table);
        return {
          insert: async () => ({ error: null }),
          upsert: async () => ({ error: null }),
        };
      },
    }),
  };

  await noteFleetPrice({
    liters: 10,
    amount: 2500,
    matchedStationId: "station-1",
    metadata: { stationResolutionState: "verified" },
  }, client as never);

  assertEquals(tables.includes("price_observation"), true);
  assertEquals(tables.includes("price_current"), true);
  assertEquals(tables.includes("public_station"), false);
  assertEquals(tables.includes("public_place"), false);
});
