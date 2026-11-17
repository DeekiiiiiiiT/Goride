/**
 * deno test --no-check --allow-env --allow-read vehicle_picture_worker.test.ts
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildLook } from "../_shared/vehiclePictures/lookKey.ts";
import { buildPicturePrompt as buildPrompt } from "../_shared/vehiclePictures/prompt.ts";
import { runVehiclePictureWorker } from "./vehicle_picture_worker.ts";
import { stubImagenCaller, stubImagenFail } from "./vehicle_picture_imagen.ts";
import { ProviderBlockedError } from "./api_usage_logger.ts";
import {
  createMemoryVehiclePictureDb,
  createSettingsStore,
  defaultSettings,
  defaultTestCatalog,
  fakeR2WithCopy,
} from "./vehicle_picture_test_harness.ts";

const ORG = "org-w";

function workerDeps(
  mem: ReturnType<typeof createMemoryVehiclePictureDb>,
  opts: {
    imagen?: ReturnType<typeof stubImagenCaller>;
    now?: () => Date;
    settings?: ReturnType<typeof createSettingsStore>;
    checkGuards?: () => Promise<void>;
  } = {},
) {
  const settings = opts.settings ?? createSettingsStore();
  const { r2, map } = fakeR2WithCopy();
  return {
    mem,
    settings,
    r2,
    map,
    deps: {
      now: opts.now ?? (() => new Date()),
      loadSettings: () => settings.load(),
      saveSettings: (p) => settings.save(p),
      db: mem.db,
      imagen: opts.imagen ?? stubImagenCaller(0),
      r2: r2 as never,
      randomJitterSec: () => 0,
      checkGuards: opts.checkGuards ?? (async () => {}),
    },
  };
}

Deno.test("T7: worker makes ready row v1", async () => {
  const mem = createMemoryVehiclePictureDb();
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  const row = await mem.db.insertQueuedPicture(look, ORG, "cat-1");
  if (!row) throw new Error("no row");
  const { deps, map, mem: m } = workerDeps(mem);
  const result = await runVehiclePictureWorker(deps);
  assertEquals(result.skipped, false);
  const updated = m.pictures.get(row.id)!;
  assertEquals(updated.status, "ready");
  assert(updated.r2_key?.endsWith("/v1.png"));
  assertEquals(updated.cost_usd, 0.04);
  const prompt = buildPrompt(look);
  assert(prompt.includes("toyota"));
  assert(prompt.includes("right-hand-drive"));
  assertEquals(/\bno floor reflection\b/i.test(prompt), true);
  assertEquals(map.size, 1);
  assertEquals((m.versions.get(row.id) ?? []).length, 1);
});

Deno.test("T7c: provider blocked → skip claims", async () => {
  const mem = createMemoryVehiclePictureDb();
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  const row = await mem.db.insertQueuedPicture(look, ORG, "cat-1");
  if (!row) throw new Error("no row");
  const { deps } = workerDeps(mem, {
    checkGuards: async () => {
      throw new ProviderBlockedError("gemini", "killswitch", "blocked");
    },
  });
  const result = await runVehiclePictureWorker(deps);
  assertEquals(result.skipped, false);
  assertEquals(mem.pictures.get(row.id)?.attempts, 0);
  assertEquals(mem.pictures.get(row.id)?.status, "queued");
});

Deno.test("T7c: bad key three runs stays queued", async () => {
  const mem = createMemoryVehiclePictureDb();
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  const row = await mem.db.insertQueuedPicture(look, ORG, "cat-1");
  if (!row) throw new Error("no row");
  let t = Date.parse("2026-11-16T12:00:00Z");
  const settings = createSettingsStore();
  const { deps } = workerDeps(mem, {
    imagen: stubImagenFail({ kind: "key", status: 401 }),
    now: () => new Date(t),
    settings,
  });
  for (let i = 0; i < 3; i++) {
    await runVehiclePictureWorker(deps);
    t += 60 * 60 * 1000;
    const snap = settings.snapshot();
    const until = snap.vehicle_pictures_paused_until;
    if (until) assert(Date.parse(until) > t - 60 * 60 * 1000);
  }
  const p = mem.pictures.get(row.id)!;
  assertEquals(p.status, "queued");
  assertEquals(p.attempts, 0);
});

Deno.test("T7b: lease excludes concurrent workers", async () => {
  const mem = createMemoryVehiclePictureDb();
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  await mem.db.insertQueuedPicture(look, ORG, "cat-1");
  const { deps } = workerDeps(mem);
  const runs = await Promise.all(Array.from({ length: 5 }, () => runVehiclePictureWorker(deps)));
  const started = runs.filter((r) => !r.skipped).length;
  assertEquals(started, 1);
});

Deno.test("T8: sweep requeues expired generating row", async () => {
  const mem = createMemoryVehiclePictureDb();
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  const row = await mem.db.insertQueuedPicture(look, ORG, "cat-1");
  if (!row) throw new Error("no row");
  mem.pictures.set(row.id, {
    ...row,
    status: "generating",
    attempts: 2,
    lease_until: new Date(Date.now() - 60_000).toISOString(),
  });
  const settings = createSettingsStore({ ai_vehicle_pictures: false });
  const { deps } = workerDeps(mem, { settings });
  await runVehiclePictureWorker(deps);
  const p = mem.pictures.get(row.id)!;
  assertEquals(p.status, "queued");
  assertEquals(p.attempts, 2);
});

Deno.test("T9a: content failure fails one row only, no pause", async () => {
  const mem = createMemoryVehiclePictureDb();
  const look1 = buildLook(defaultTestCatalog(), "white");
  const look2 = buildLook(defaultTestCatalog(), "black");
  if ("error" in look1 || "error" in look2) throw new Error("bad look");
  const r1 = await mem.db.insertQueuedPicture(look1, ORG, "cat-1");
  const r2 = await mem.db.insertQueuedPicture(look2, ORG, "cat-1");
  if (!r1 || !r2) throw new Error("no rows");
  const imagen = async ({ look }: { look: { color: string } }) => {
    if (look.color === "white") throw new Error("Imagen returned no image");
    return stubImagenCaller(0)({ model: "m", look: look2, timeoutMs: 50_000 });
  };
  const settings = createSettingsStore();
  const { deps } = workerDeps(mem, { imagen: imagen as never, settings });
  await runVehiclePictureWorker(deps);
  assertEquals(mem.pictures.get(r1.id)?.status, "failed");
  assertEquals(mem.pictures.get(r2.id)?.status, "ready");
  assertEquals(settings.snapshot().vehicle_pictures_paused_until, null);
});

Deno.test("T9b: five outages trip 30m pause", async () => {
  const mem = createMemoryVehiclePictureDb();
  const settings = createSettingsStore();
  const looks = ["white", "black", "silver", "grey", "blue"] as const;
  for (const color of looks) {
    const look = buildLook(defaultTestCatalog(), color);
    if ("error" in look) throw new Error("bad look");
    await mem.db.insertQueuedPicture(look, ORG, "cat-1");
  }
  const { deps } = workerDeps(mem, {
    imagen: stubImagenFail({ kind: "outage", status: 503 }),
    settings,
  });
  await runVehiclePictureWorker(deps);
  const snap = settings.snapshot();
  assertEquals(snap.vehicle_pictures_pause_reason, "outage");
  assert(snap.vehicle_pictures_paused_until);
});

Deno.test("T7d: row pre-check ProviderBlocked does not subtract attempt", async () => {
  const mem = createMemoryVehiclePictureDb();
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  const row = await mem.db.insertQueuedPicture(look, ORG, "cat-1");
  if (!row) throw new Error("no row");
  let guardCalls = 0;
  const settings = createSettingsStore();
  const { deps } = workerDeps(mem, {
    settings,
    checkGuards: async () => {
      guardCalls += 1;
      if (guardCalls >= 2) {
        throw new ProviderBlockedError("gemini", "budget_daily", "blocked");
      }
    },
  });
  await runVehiclePictureWorker(deps);
  const p = mem.pictures.get(row.id)!;
  assertEquals(p.status, "queued");
  assertEquals(p.attempts, 0);
  assertEquals(settings.snapshot().vehicle_picture_outage_streak, undefined);
});

Deno.test("T7e: ProviderBlocked inside imagen gives attempt back, no outage streak", async () => {
  const mem = createMemoryVehiclePictureDb();
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  const row = await mem.db.insertQueuedPicture(look, ORG, "cat-1");
  if (!row) throw new Error("no row");
  const settings = createSettingsStore();
  const { deps } = workerDeps(mem, {
    settings,
    imagen: async () => {
      throw new ProviderBlockedError("gemini", "budget_monthly", "blocked");
    },
  });
  const before = Date.now();
  await runVehiclePictureWorker(deps);
  const p = mem.pictures.get(row.id)!;
  assertEquals(p.status, "queued");
  assertEquals(p.attempts, 0);
  assert(p.next_attempt_at && Date.parse(p.next_attempt_at) >= before + 59 * 60 * 1000);
  assertEquals(settings.snapshot().vehicle_picture_outage_streak, undefined);
});

Deno.test("T9c: 401 pauses key, gives attempt back, skips second row", async () => {
  const mem = createMemoryVehiclePictureDb();
  const look1 = buildLook(defaultTestCatalog(), "white");
  const look2 = buildLook(defaultTestCatalog(), "black");
  if ("error" in look1 || "error" in look2) throw new Error("bad look");
  const r1 = await mem.db.insertQueuedPicture(look1, ORG, "cat-1");
  const r2 = await mem.db.insertQueuedPicture(look2, ORG, "cat-1");
  if (!r1 || !r2) throw new Error("no rows");
  const settings = createSettingsStore();
  const { deps } = workerDeps(mem, {
    imagen: stubImagenFail({ kind: "key", status: 401 }),
    settings,
  });
  await runVehiclePictureWorker(deps);
  assertEquals(mem.pictures.get(r1.id)?.status, "queued");
  assertEquals(mem.pictures.get(r1.id)?.attempts, 0);
  assertEquals(mem.pictures.get(r2.id)?.status, "queued");
  assertEquals(settings.snapshot().vehicle_pictures_pause_reason, "key");
});