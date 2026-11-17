/**
 * deno test --no-check --allow-env --allow-read vehicle_picture_versions.test.ts
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildLook } from "../_shared/vehiclePictures/lookKey.ts";
import { runVehiclePictureWorker } from "./vehicle_picture_worker.ts";
import { stubImagenCaller } from "./vehicle_picture_imagen.ts";
import { runVehiclePictureCleanup } from "./vehicle_picture_cleanup.ts";
import {
  createMemoryVehiclePictureDb,
  createSettingsStore,
  defaultTestCatalog,
  fakeR2WithCopy,
} from "./vehicle_picture_test_harness.ts";
import {
  PictureInUseError,
  removePictureOnDb,
  replacePicture,
  restorePrevious,
} from "./vehicle_picture_versions.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const ORG = "org-w";

async function makeReadyV1(mem: ReturnType<typeof createMemoryVehiclePictureDb>, r2: ReturnType<typeof fakeR2WithCopy>["r2"]) {
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  const row = await mem.db.insertQueuedPicture(look, ORG, "cat-1");
  if (!row) throw new Error("no row");
  const settings = createSettingsStore();
  await runVehiclePictureWorker({
    now: () => new Date(),
    loadSettings: () => settings.load(),
    saveSettings: (p) => settings.save(p),
    db: mem.db,
    imagen: stubImagenCaller(0),
    r2: r2 as never,
    randomJitterSec: () => 0,
    checkGuards: async () => {},
  });
  return row.id;
}

function workerRun(
  mem: ReturnType<typeof createMemoryVehiclePictureDb>,
  r2: ReturnType<typeof fakeR2WithCopy>["r2"],
  settings = createSettingsStore(),
) {
  return runVehiclePictureWorker({
    now: () => new Date(),
    loadSettings: () => settings.load(),
    saveSettings: (p) => settings.save(p),
    db: mem.db,
    imagen: stubImagenCaller(0),
    r2: r2 as never,
    randomJitterSec: () => 0,
    checkGuards: async () => {},
  });
}

Deno.test("T10: v1 worker, regenerate v2, restore v3", async () => {
  const mem = createMemoryVehiclePictureDb();
  const { r2, map } = fakeR2WithCopy();
  const id = await makeReadyV1(mem, r2);
  const v1Key = `catalogue/images/${id}/v1.png`;

  await mem.db.queueRegenerate(id, new Date().toISOString());
  const settings = createSettingsStore();
  await workerRun(mem, r2, settings);

  const pic2 = mem.pictures.get(id)!;
  assertEquals(pic2.version, 2);
  const v2Key = pic2.r2_key!;
  assert(map.has(v2Key));
  assert(map.has(v1Key));

  await restorePrevious(
    { supabase: {} as SupabaseClient, r2: r2 as never, now: () => new Date(), db: mem.db },
    id,
    "staff-1",
  );

  const pic3 = mem.pictures.get(id)!;
  assertEquals(pic3.version, 3);
  assertEquals(pic3.source, "restore");
  const vers = mem.versions.get(id) ?? [];
  const v3row = vers.find((v) => v.version === 3);
  assertEquals(v3row?.source, "restore");
  assert(vers.find((v) => v.version === 2)?.retired_at);
  assertEquals(new Set([...map.keys()]).size, 3);
  assert(![...map.keys()].some((k, i, arr) => arr.indexOf(k) !== i));
});

Deno.test("T24b: resurrect ready retires old version", async () => {
  const mem = createMemoryVehiclePictureDb();
  const { r2 } = fakeR2WithCopy();
  const id = await makeReadyV1(mem, r2);
  const deletedAt = new Date().toISOString();
  await mem.db.softRemovePicture(id, deletedAt);
  await mem.db.resurrectPicture(id);
  const settings = createSettingsStore();
  await workerRun(mem, r2, settings);
  const v1 = (mem.versions.get(id) ?? []).find((v) => v.version === 1);
  assert(v1?.retired_at);
});

Deno.test("T25: cleanup keeps current and previous file", async () => {
  const mem = createMemoryVehiclePictureDb();
  const { r2, map, failDeleteOnce } = fakeR2WithCopy();
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  const id = await makeReadyV1(mem, r2);

  for (let i = 0; i < 3; i++) {
    await mem.db.queueRegenerate(id, new Date().toISOString());
    await workerRun(mem, r2);
  }
  assertEquals(mem.pictures.get(id)?.version, 4);

  const old = (mem.versions.get(id) ?? []).filter((v) => v.version <= 2);
  for (const v of old) {
    if (v.retired_at) {
      const retiredAt = new Date("2020-01-01T00:00:00Z").toISOString();
      mem.versions.set(
        id,
        (mem.versions.get(id) ?? []).map((x) =>
          x.version === v.version ? { ...x, retired_at: retiredAt } : x
        ),
      );
    }
  }

  const now = new Date("2020-02-01T00:00:00Z");
  const k1 = `catalogue/images/${id}/v1.png`;
  failDeleteOnce.add(k1);
  await runVehiclePictureCleanup({
    db: mem.db,
    r2: r2 as never,
    retentionDays: 30,
    now,
  });
  let v1 = (mem.versions.get(id) ?? []).find((v) => v.version === 1);
  assertEquals(v1?.file_deleted_at, null);
  assert(map.has(k1));

  await runVehiclePictureCleanup({
    db: mem.db,
    r2: r2 as never,
    retentionDays: 30,
    now,
  });
  v1 = (mem.versions.get(id) ?? []).find((v) => v.version === 1);
  assert(v1?.file_deleted_at);
  assert(!map.has(k1));
  assert(map.has(`catalogue/images/${id}/v4.png`));
  assert(map.has(`catalogue/images/${id}/v3.png`));
});

Deno.test("T35: restore and replace set source", async () => {
  const mem = createMemoryVehiclePictureDb();
  const { r2, map } = fakeR2WithCopy();
  const id = await makeReadyV1(mem, r2);
  const uploadKey = "uploads/tmp/staff.png";
  map.set(uploadKey, new Uint8Array([9, 9, 9]));

  await replacePicture(
    { supabase: {} as SupabaseClient, r2: r2 as never, now: () => new Date(), db: mem.db },
    id,
    uploadKey,
    "staff-1",
  );

  const pic = mem.pictures.get(id)!;
  assertEquals(pic.source, "staff_upload");
  const v2 = (mem.versions.get(id) ?? []).find((v) => v.version === 2);
  assertEquals(v2?.source, "staff_upload");
  assertEquals(v2?.cost_usd, 0.04);
  const v1 = (mem.versions.get(id) ?? []).find((v) => v.version === 1);
  assertEquals(v1?.cost_usd, 0.04);
  assertEquals(pic.made_by, "staff-1");
});

Deno.test("T35b: JPEG replace uses jpg key and content type", async () => {
  const mem = createMemoryVehiclePictureDb();
  const { r2, map, setContentType } = fakeR2WithCopy();
  const id = await makeReadyV1(mem, r2);
  const uploadKey = "uploads/tmp/staff.jpg";
  map.set(uploadKey, new Uint8Array([0xff, 0xd8, 0xff]));
  setContentType(uploadKey, "image/jpeg");

  await replacePicture(
    { supabase: {} as SupabaseClient, r2: r2 as never, now: () => new Date(), db: mem.db },
    id,
    uploadKey,
    "staff-jpeg",
  );

  const pic = mem.pictures.get(id)!;
  assertEquals(pic.version, 2);
  assert(pic.r2_key?.endsWith("/v2.jpg"));
  assert(map.has(`catalogue/images/${id}/v2.jpg`));
});

Deno.test("T10b: restore sets made_by", async () => {
  const mem = createMemoryVehiclePictureDb();
  const { r2 } = fakeR2WithCopy();
  const id = await makeReadyV1(mem, r2);
  await mem.db.queueRegenerate(id, new Date().toISOString());
  await workerRun(mem, r2);
  await restorePrevious(
    { supabase: {} as SupabaseClient, r2: r2 as never, now: () => new Date(), db: mem.db },
    id,
    "staff-restore",
  );
  assertEquals(mem.pictures.get(id)?.made_by, "staff-restore");
});

Deno.test("T11: remove picture in use", async () => {
  const mem = createMemoryVehiclePictureDb();
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
    example_catalog_id: "cat-1",
    status: "ready",
    lane: "live",
    r2_key: `catalogue/images/${id}/v1.png`,
    version: 1,
    source: "ai",
    provider: null,
    ai_model: null,
    prompt: null,
    prompt_version: null,
    cost_usd: 0.04,
    attempts: 0,
    next_attempt_at: null,
    lease_until: null,
    last_error: null,
    staff_rating: null,
    made_at: new Date().toISOString(),
    made_by: null,
    deleted_at: null,
    queued_by_org: ORG,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  mem.fleetVehicles.set("veh-1", {
    id: "veh-1",
    organization_id: ORG,
    vehicle_catalog_id: "cat-1",
    color_standard: "white",
    picture_id: id,
  });

  let threw = false;
  try {
    await removePictureOnDb(mem.db, id, new Date().toISOString());
  } catch (e) {
    threw = e instanceof PictureInUseError;
  }
  assert(threw);

  mem.fleetVehicles.set("veh-1", { ...mem.fleetVehicles.get("veh-1")!, picture_id: null });
  await removePictureOnDb(mem.db, id, new Date().toISOString());
  assert(mem.pictures.get(id)?.deleted_at);
});