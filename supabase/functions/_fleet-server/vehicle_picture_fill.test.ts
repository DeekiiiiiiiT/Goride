/**
 * deno test --no-check --allow-env --allow-read vehicle_picture_fill.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import { runVehiclePictureFill } from "./vehicle_picture_fill.ts";
import { type PictureLookupDeps } from "./vehicle_picture_lookup.ts";
import {
  createMemoryVehiclePictureDb,
  createSettingsStore,
  defaultSettings,
  defaultTestCatalog,
} from "./vehicle_picture_test_harness.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { VehiclePicturesSettingsKv } from "./vehicle_pictures_settings.ts";

const ORG = "org-f";
const CAT = "cat-1";

function lookupDeps(mem: ReturnType<typeof createMemoryVehiclePictureDb>): PictureLookupDeps {
  return {
    now: () => new Date(),
    loadSettings: async () => defaultSettings(),
    db: mem.db,
    kickWorker: async () => {},
    geminiBudgetBlocked: async () => false,
  };
}

function stubSupabase(opts: {
  workerKicks: number[];
  fillKicks: string[];
  settings: VehiclePicturesSettingsKv;
}): SupabaseClient {
  return {
    rpc: async (name: string, args?: Record<string, unknown>) => {
      if (name === "kick_vehicle_picture_worker") {
        opts.workerKicks.push(1);
        return { data: null, error: null };
      }
      if (name === "kick_vehicle_picture_fill") {
        opts.fillKicks.push(String(args?.p_after_id ?? ""));
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;
}

Deno.test("T34: second fill skips when lease held", async () => {
  const mem = createMemoryVehiclePictureDb();
  mem.catalogs.set(CAT, defaultTestCatalog());
  mem.fleetVehicles.set("V1", { id: "V1", organization_id: ORG, vehicle_catalog_id: CAT, color_standard: "white", picture_id: null });
  await mem.db.tryAcquireWorkerLease("other", new Date(Date.now() + 60_000).toISOString());
  const workerKicks: number[] = [];
  const r = await runVehiclePictureFill(
    {
      now: () => new Date(),
      lookupDeps: lookupDeps(mem),
      db: mem.db,
      loadSettings: async () => defaultSettings(),
      saveFillCursor: async () => {},
      supabase: stubSupabase({ workerKicks, fillKicks: [], settings: defaultSettings() }),
    },
    {},
  );
  assertEquals(r.skipped, true);
  assertEquals(workerKicks.length, 0);
});

Deno.test("T33: short batch kicks worker once at end", async () => {
  const mem = createMemoryVehiclePictureDb();
  mem.catalogs.set(CAT, defaultTestCatalog());
  for (let i = 0; i < 5; i++) {
    const id = `V${i}`;
    mem.fleetVehicles.set(id, { id, organization_id: ORG, vehicle_catalog_id: CAT, color_standard: "white", picture_id: null });
  }
  const settings = createSettingsStore();
  const workerKicks: number[] = [];
  const fillKicks: string[] = [];
  await runVehiclePictureFill(
    {
      now: () => new Date(),
      lookupDeps: lookupDeps(mem),
      db: mem.db,
      loadSettings: () => settings.load(),
      saveSettings: (p) => settings.save(p),
      saveFillCursor: async () => {},
      supabase: stubSupabase({ workerKicks, fillKicks, settings: defaultSettings() }),
    },
    {},
  );
  assertEquals(workerKicks.length, 1);
  assertEquals(fillKicks.length, 0);
  assertEquals([...mem.pictures.values()].length, 1);
});