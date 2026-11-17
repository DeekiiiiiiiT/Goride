/**
 * deno test --no-check --allow-env --allow-read vehicle_picture_stale.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import { buildLook } from "../_shared/vehiclePictures/lookKey.ts";
import type { CatalogRow } from "../_shared/vehiclePictures/lookKey.ts";
import { runVehiclePictureStaleRefresh } from "./vehicle_picture_stale.ts";
import {
  createMemoryVehiclePictureDb,
  createSettingsStore,
  seedReadyLook,
} from "./vehicle_picture_test_harness.ts";

function catalog(id: string, model: string): CatalogRow {
  return {
    make: "toyota",
    model,
    generation: "1st gen",
    body_type: "hatchback",
    trim_series: null,
    start_year: 2018,
    end_year: 2022,
  };
}

Deno.test("stale refresh: 3 catalogue rows, 5 pictures, exactly 2 stale", async () => {
  const mem = createMemoryVehiclePictureDb();
  mem.catalogs.set("c1", catalog("c1", "roomy"));
  mem.catalogs.set("c2", catalog("c2", "axio"));
  mem.catalogs.set("c3", catalog("c3", "prius"));

  const staleCatalogA: CatalogRow = {
    make: "honda",
    model: "civic",
    generation: "10th gen",
    body_type: "sedan",
    trim_series: null,
    start_year: 2016,
    end_year: 2021,
  };
  const staleCatalogB: CatalogRow = {
    make: "toyota",
    model: "corolla",
    generation: "2nd gen",
    body_type: "sedan",
    trim_series: null,
    start_year: 1970,
    end_year: 1974,
  };
  const activeLooks = [
    buildLook(mem.catalogs.get("c1")!, "white"),
    buildLook(mem.catalogs.get("c2")!, "black"),
    buildLook(mem.catalogs.get("c3")!, "red"),
    buildLook(staleCatalogA, "blue"),
    buildLook(staleCatalogB, "silver"),
  ];
  for (const look of activeLooks) {
    if ("error" in look) throw new Error("bad look");
    seedReadyLook(mem.pictures, look, "org-stale");
  }

  const settings = createSettingsStore();
  const now = new Date("2026-11-16T15:00:00.000Z");
  const n = await runVehiclePictureStaleRefresh({
    db: mem.db,
    now,
    loadSettings: () => settings.load(),
    saveSettings: (p) => settings.save(p),
    force: true,
  });
  assertEquals(n, 2);

  let staleCount = 0;
  for (const p of mem.pictures.values()) {
    if (p.stale) staleCount += 1;
  }
  assertEquals(staleCount, 2);
});

Deno.test("stale refresh skipped when last run under 10 minutes ago", async () => {
  const mem = createMemoryVehiclePictureDb();
  mem.catalogs.set("c1", catalog("c1", "roomy"));
  const look = buildLook(mem.catalogs.get("c1")!, "white");
  if ("error" in look) throw new Error("bad look");
  seedReadyLook(mem.pictures, look, "org-stale");

  let catalogReads = 0;
  const wrappedDb = new Proxy(mem.db, {
    get(target, prop, receiver) {
      if (prop === "listCatalogRowsForStaleLooks") {
        return async () => {
          catalogReads += 1;
          return Reflect.apply(target.listCatalogRowsForStaleLooks, target, []);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  const settings = createSettingsStore({
    vehicle_picture_stale_last_run_at: "2026-11-16T12:00:00.000Z",
  });
  const now = new Date("2026-11-16T12:05:00.000Z");
  const n = await runVehiclePictureStaleRefresh({
    db: wrappedDb,
    now,
    loadSettings: () => settings.load(),
    saveSettings: (p) => settings.save(p),
  });
  assertEquals(n, 0);
  assertEquals(catalogReads, 0);
});