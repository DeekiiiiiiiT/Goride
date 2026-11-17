/**
 * deno test --no-check --allow-env --allow-read vehicle_picture_lookup.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import { buildLook } from "../_shared/vehiclePictures/lookKey.ts";
import { jamaicaPictureDay } from "./vehicle_picture_status.ts";
import { runPictureLookup, readPictureForVehicle, type PictureLookupDeps } from "./vehicle_picture_lookup.ts";
import {
  createMemoryVehiclePictureDb,
  defaultSettings,
  defaultTestCatalog,
  seedReadyLook,
} from "./vehicle_picture_test_harness.ts";

const ORG = "org-t";
const CAT = "cat-1";

function deps(mem: ReturnType<typeof createMemoryVehiclePictureDb>, extras?: Partial<PictureLookupDeps>): PictureLookupDeps {
  let kicks = 0;
  return {
    now: () => new Date("2026-11-16T15:00:00.000Z"),
    loadSettings: async () => defaultSettings(),
    db: mem.db,
    kickWorker: async () => {
      kicks += 1;
    },
    geminiBudgetBlocked: async () => false,
    ...extras,
  };
}

Deno.test("T3: ready look links without kick", async () => {
  const mem = createMemoryVehiclePictureDb();
  mem.catalogs.set(CAT, defaultTestCatalog());
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  const ready = seedReadyLook(mem.pictures, look, ORG);
  mem.fleetVehicles.set("V1", {
    id: "V1",
    organization_id: ORG,
    vehicle_catalog_id: CAT,
    color_standard: "white",
    picture_id: null,
  });
  let kicks = 0;
  const r = await runPictureLookup(deps(mem, { kickWorker: async () => { kicks += 1; } }), {
    vehicleId: "V1",
    organizationId: ORG,
    vehicleCatalogId: CAT,
    colorStandard: "white",
  });
  assertEquals(r.status, "ready");
  assertEquals(kicks, 0);
  assertEquals(mem.fleetVehicles.get("V1")?.picture_id, ready.id);
});

Deno.test("T4: concurrent insert one row one kick", async () => {
  const mem = createMemoryVehiclePictureDb();
  mem.catalogs.set(CAT, defaultTestCatalog());
  mem.fleetVehicles.set("V1", { id: "V1", organization_id: ORG, vehicle_catalog_id: CAT, color_standard: "white", picture_id: null });
  mem.fleetVehicles.set("V2", { id: "V2", organization_id: ORG, vehicle_catalog_id: CAT, color_standard: "white", picture_id: null });
  let kicks = 0;
  const d = deps(mem, { kickWorker: async () => { kicks += 1; } });
  const [a, b] = await Promise.all([
    runPictureLookup(d, { vehicleId: "V1", organizationId: ORG, vehicleCatalogId: CAT, colorStandard: "white" }),
    runPictureLookup(d, { vehicleId: "V2", organizationId: ORG, vehicleCatalogId: CAT, colorStandard: "white" }),
  ]);
  assertEquals([...mem.pictures.values()].filter((p) => !p.deleted_at).length, 1);
  assertEquals(kicks, 1);
  assertEquals(a.status, "queued");
  assertEquals(b.status, "queued");
});

Deno.test("T5: parked / null colour → none", async () => {
  const mem = createMemoryVehiclePictureDb();
  const d = deps(mem);
  const none = await runPictureLookup(d, {
    vehicleId: "V1",
    organizationId: ORG,
    vehicleCatalogId: null,
    colorStandard: "white",
    catalogStatus: "pending_catalog",
  });
  assertEquals(none.status, "none");
  const none2 = await runPictureLookup(d, {
    vehicleId: "V1",
    organizationId: ORG,
    vehicleCatalogId: CAT,
    colorStandard: null,
  });
  assertEquals(none2.status, "none");
});

Deno.test("T24: resurrect removed row", async () => {
  const mem = createMemoryVehiclePictureDb();
  mem.catalogs.set(CAT, defaultTestCatalog());
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  const id = crypto.randomUUID();
  mem.pictures.set(id, {
    id,
    look_key: look.key,
    make: look.make,
    model: look.model,
    generation: look.generation,
    body_type: look.bodyType,
    facelift_stage: look.faceliftStage,
    start_year: look.startYear,
    end_year: look.endYear,
    color: look.color,
    example_catalog_id: CAT,
    status: "failed",
    lane: "live",
    r2_key: null,
    version: 2,
    source: "ai",
    provider: null,
    ai_model: null,
    prompt: null,
    prompt_version: null,
    cost_usd: null,
    attempts: 1,
    next_attempt_at: null,
    lease_until: null,
    last_error: null,
    staff_rating: null,
    made_at: null,
    made_by: null,
    deleted_at: new Date().toISOString(),
    queued_by_org: ORG,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  let kicks = 0;
  const r = await runPictureLookup(deps(mem, { kickWorker: async () => { kicks += 1; } }), {
    vehicleId: "V1",
    organizationId: ORG,
    vehicleCatalogId: CAT,
    colorStandard: "white",
  });
  assertEquals(r.status, "queued");
  assertEquals(kicks, 1);
  assertEquals(mem.pictures.get(id)?.deleted_at, null);
  assertEquals(mem.pictures.get(id)?.version, 3);
});

Deno.test("T28: org daily limit → limited", async () => {
  const mem = createMemoryVehiclePictureDb();
  mem.catalogs.set(CAT, defaultTestCatalog());
  for (let i = 0; i < 50; i++) {
    const cat = { ...defaultTestCatalog(), model: `roomy-${i}` };
    const lk = buildLook(cat, "white");
    if ("error" in lk) throw new Error("bad look");
    await mem.db.insertQueuedPicture(lk, ORG, CAT);
  }
  const r = await runPictureLookup(deps(mem), {
    vehicleId: "V-LIM",
    organizationId: ORG,
    vehicleCatalogId: CAT,
    colorStandard: "orange",
  });
  assertEquals(r.status, "limited");
});

Deno.test("T28b BN2: read without link shows live queued", async () => {
  const mem = createMemoryVehiclePictureDb();
  mem.catalogs.set(CAT, defaultTestCatalog());
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  await mem.db.insertQueuedPicture(look, ORG, CAT);
  const r = await readPictureForVehicle(deps(mem), {
    vehicleId: "V1",
    organizationId: ORG,
    vehicleCatalogId: CAT,
    colorStandard: "white",
    pictureId: null,
  });
  assertEquals(r.status, "queued");
});

Deno.test("T28 BN5: Jamaica day boundary", () => {
  const d1 = jamaicaPictureDay(new Date("2026-11-16T23:59:00-05:00"));
  const d2 = jamaicaPictureDay(new Date("2026-11-17T00:01:00-05:00"));
  assertEquals(d1, "2026-11-16");
  assertEquals(d2, "2026-11-17");
});