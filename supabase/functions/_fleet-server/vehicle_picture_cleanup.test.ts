/**
 * deno test --no-check --allow-env --allow-read vehicle_picture_cleanup.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import { buildLook } from "../_shared/vehiclePictures/lookKey.ts";
import { runVehiclePictureCleanup } from "./vehicle_picture_cleanup.ts";
import {
  createMemoryVehiclePictureDb,
  createSettingsStore,
  defaultTestCatalog,
  fakeR2WithCopy,
} from "./vehicle_picture_test_harness.ts";

const ORG = "org-w";

Deno.test("T25b: cleanup one candidate query per run", async () => {
  const mem = createMemoryVehiclePictureDb();
  let candidateCalls = 0;
  const wrappedDb = new Proxy(mem.db, {
    get(target, prop, receiver) {
      if (prop === "listCleanupDeleteCandidates") {
        return async (...args: Parameters<typeof target.listCleanupDeleteCandidates>) => {
          candidateCalls += 1;
          return Reflect.apply(target.listCleanupDeleteCandidates, target, args);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  const { r2 } = fakeR2WithCopy();
  for (const color of ["white", "black", "silver"] as const) {
    const look = buildLook(defaultTestCatalog(), color);
    if ("error" in look) throw new Error("bad look");
    const row = await wrappedDb.insertQueuedPicture(look, ORG, "cat-1");
    if (!row) throw new Error("no row");
    const key = `catalogue/images/${row.id}/v1.png`;
    await wrappedDb.becomeReady({
      pictureId: row.id,
      version: 1,
      r2Key: key,
      costUsd: 0.04,
      provider: "gemini",
      aiModel: "m",
      promptVersion: 1,
      prompt: "p",
      source: "ai",
    });
    await (r2 as { put: (b: string, k: string, bytes: Uint8Array) => Promise<void> }).put(
      "public",
      key,
      new Uint8Array([1]),
    );
  }

  const now = new Date("2020-02-01T00:00:00Z");
  const settings = createSettingsStore();
  await runVehiclePictureCleanup({
    db: wrappedDb,
    r2: r2 as never,
    retentionDays: 30,
    now,
    loadSettings: () => settings.load(),
    saveSettings: (p) => settings.save(p),
  });
  assertEquals(candidateCalls, 1);
});

Deno.test("T25c: cleanup skipped when last run under 10 minutes ago", async () => {
  const mem = createMemoryVehiclePictureDb();
  let candidateCalls = 0;
  const wrappedDb = new Proxy(mem.db, {
    get(target, prop, receiver) {
      if (prop === "listCleanupDeleteCandidates") {
        return async (...args: Parameters<typeof target.listCleanupDeleteCandidates>) => {
          candidateCalls += 1;
          return Reflect.apply(target.listCleanupDeleteCandidates, target, args);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  const { r2 } = fakeR2WithCopy();
  const settings = createSettingsStore({
    vehicle_picture_cleanup_last_run_at: "2026-11-16T12:00:00.000Z",
  });
  const now = new Date("2026-11-16T12:05:00.000Z");
  await runVehiclePictureCleanup({
    db: wrappedDb,
    r2: r2 as never,
    retentionDays: 30,
    now,
    loadSettings: () => settings.load(),
    saveSettings: (p) => settings.save(p),
  });
  assertEquals(candidateCalls, 0);
});