/**
 * §3.3 the part-picture worker: ready path, retries, budget block giving the attempt back, two runs never taking
 * the same row, the daily max, the switch, a group switched off, a lost diagram, and cleanup.
 * Fake Gemini and fake R2; no real API call, no real object store.
 * deno test --no-check supabase/functions/_fleet-server/part_picture_worker.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ProviderBlockedError } from "./api_usage_logger.ts";
import type {
  PartPictureBecomeReadyArgs,
  PartPictureCleanupCandidate,
  PartPictureDb,
  PartPictureDiagramRow,
  PartPictureRow,
  PartTemplateRow,
} from "./part_picture_db.ts";
import type { PartPictureCaller } from "./part_picture_imagen.ts";
import { stubPartPictureCaller, stubPartPictureFail } from "./part_picture_imagen.ts";
import { runPartPictureCleanup } from "./part_picture_cleanup.ts";
import { mergePartPicturesSettings, type PartPicturesSettings } from "./part_pictures_settings.ts";
import { contentTypeForKey, runPartPictureWorker, type PartObjectStore } from "./part_picture_worker.ts";

const NOW = Date.parse("2026-11-26T12:00:00Z");
const GROUP = "group-11111-A1001";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);

function pictureRow(patch: Partial<PartPictureRow> = {}): PartPictureRow {
  return {
    id: "pic-1",
    interchange_group_id: GROUP,
    manufacturer: "Testmake",
    part_number: "11111-A1001",
    part_name: "Shock absorber",
    catalog_group_id: "group-sus",
    component_id: "shock",
    status: "queued",
    label: "47777",
    r2_key: null,
    version: 1,
    template_version: null,
    prompt: null,
    ai_model: null,
    cost_usd: null,
    attempts: 0,
    next_attempt_at: null,
    lease_until: null,
    last_error: null,
    made_at: null,
    hidden_at: null,
    hidden_by: null,
    source_saved_page_id: null,
    created_at: new Date(NOW).toISOString(),
    updated_at: new Date(NOW).toISOString(),
    ...patch,
  };
}

function diagramRow(patch: Partial<PartPictureDiagramRow> = {}): PartPictureDiagramRow {
  return {
    id: "diag-1",
    picture_id: "pic-1",
    saved_page_id: "page-1",
    r2_key: "part-diagrams/pic-1/one.png",
    map_box: { x1: 1, y1: 2, x2: 3, y2: 4 },
    delete_after: new Date(NOW + 30 * 86400000).toISOString(),
    deleted_at: null,
    created_at: new Date(NOW).toISOString(),
    ...patch,
  };
}

class FakeDb implements PartPictureDb {
  rows: PartPictureRow[] = [];
  diagrams: PartPictureDiagramRow[] = [];
  templates: Record<string, PartTemplateRow> = {};
  candidates: PartPictureCleanupCandidate[] = [];
  madeToday = 0;
  now = NOW;
  calls: string[] = [];
  readyCalls: PartPictureBecomeReadyArgs[] = [];
  markedVersions: string[] = [];
  markedDiagrams: string[] = [];
  leaseHolder: string | null = null;
  leaseUntil = 0;

  async tryAcquireWorkerLease(holderId: string, heldUntilIso: string): Promise<boolean> {
    this.calls.push("lease");
    if (this.leaseHolder && this.leaseUntil > this.now) return false;
    this.leaseHolder = holderId;
    this.leaseUntil = Date.parse(heldUntilIso);
    return true;
  }
  async releaseWorkerLease(holderId: string): Promise<void> {
    if (this.leaseHolder === holderId) this.leaseUntil = 0;
  }
  async claimRows(limit: number, leaseSeconds: number): Promise<PartPictureRow[]> {
    this.calls.push("claim");
    const due = this.rows
      .filter((r) =>
        r.status === "queued" &&
        (!r.next_attempt_at || Date.parse(r.next_attempt_at) <= this.now) &&
        (!r.lease_until || Date.parse(r.lease_until) < this.now)
      )
      .slice(0, limit);
    for (const row of due) {
      row.status = "making";
      row.lease_until = new Date(this.now + leaseSeconds * 1000).toISOString();
    }
    return due.map((r) => ({ ...r }));
  }
  async sweepStuck(): Promise<number> {
    return 0;
  }
  async incrementAttempts(id: string): Promise<number> {
    this.calls.push("increment");
    const row = this.rows.find((r) => r.id === id)!;
    row.attempts += 1;
    return row.attempts;
  }
  async requeue(id: string, nextAttemptIso: string): Promise<void> {
    const row = this.rows.find((r) => r.id === id)!;
    row.status = "queued";
    row.next_attempt_at = nextAttemptIso;
    row.lease_until = null;
  }
  async requeueGiveBackAttempt(id: string, nextAttemptIso: string): Promise<void> {
    this.calls.push("giveBack");
    const row = this.rows.find((r) => r.id === id)!;
    row.status = "queued";
    row.attempts = Math.max(0, row.attempts - 1);
    row.next_attempt_at = nextAttemptIso;
    row.lease_until = null;
  }
  async fail(id: string, reason: string): Promise<void> {
    const row = this.rows.find((r) => r.id === id)!;
    row.status = "failed";
    row.last_error = reason;
    row.lease_until = null;
  }
  async becomeReady(args: PartPictureBecomeReadyArgs): Promise<void> {
    this.readyCalls.push(args);
    const row = this.rows.find((r) => r.id === args.pictureId)!;
    row.status = "ready";
    row.r2_key = args.r2Key;
    row.version = args.version;
    row.template_version = args.templateVersion;
    row.prompt = args.prompt;
    row.ai_model = args.aiModel;
    row.cost_usd = args.costUsd;
    row.made_at = new Date(this.now).toISOString();
    row.lease_until = null;
  }
  async listDiagrams(pictureId: string): Promise<PartPictureDiagramRow[]> {
    return this.diagrams.filter((d) => d.picture_id === pictureId && !d.deleted_at);
  }
  async loadTemplate(catalogGroupId: string): Promise<PartTemplateRow | null> {
    return this.templates[catalogGroupId] ?? null;
  }
  async countMadeOn(_day: string): Promise<number> {
    return this.madeToday;
  }
  async cleanupCandidates(): Promise<PartPictureCleanupCandidate[]> {
    return this.candidates;
  }
  async markVersionFileDeleted(refId: string): Promise<void> {
    this.markedVersions.push(refId);
  }
  async markDiagramDeleted(refId: string): Promise<void> {
    this.markedDiagrams.push(refId);
  }
}

class FakeStore implements PartObjectStore {
  objects = new Map<string, Uint8Array>();
  puts: Array<{ bucket: string; key: string; contentType: string; cacheControl: string }> = [];
  removes: Array<{ bucket: string; key: string }> = [];
  failRead = false;
  constructor() {
    this.objects.set("private:part-diagrams/pic-1/one.png", PNG);
  }
  async read(bucket: "public" | "private", key: string): Promise<Uint8Array> {
    if (this.failRead) throw new Error("R2 GET 500");
    const bytes = this.objects.get(`${bucket}:${key}`);
    if (!bytes) throw new Error(`missing ${key}`);
    return bytes;
  }
  async put(bucket: "public" | "private", key: string, bytes: Uint8Array, contentType: string, cacheControl: string): Promise<void> {
    if (bucket === "public" && !key.startsWith("catalogue/parts/")) throw new Error(`bad picture key ${key}`);
    this.puts.push({ bucket, key, contentType, cacheControl });
    this.objects.set(`${bucket}:${key}`, bytes);
  }
  async remove(bucket: "public" | "private", keys: string[]): Promise<void> {
    for (const key of keys) {
      this.removes.push({ bucket, key });
      this.objects.delete(`${bucket}:${key}`);
    }
  }
}

function settings(patch: Record<string, unknown> = {}): PartPicturesSettings {
  return mergePartPicturesSettings({ ai_part_pictures: true, ...patch });
}

function deps(db: FakeDb, store: FakeStore | null, overrides: {
  imagen?: PartPictureCaller;
  settings?: PartPicturesSettings;
  checkGuards?: () => Promise<void>;
  saveSettings?: (patch: Record<string, unknown>) => Promise<void>;
} = {}) {
  return {
    now: () => new Date(db.now),
    loadSettings: async () => overrides.settings ?? settings(),
    ...(overrides.saveSettings ? { saveSettings: overrides.saveSettings as never } : {}),
    db,
    imagen: overrides.imagen ?? stubPartPictureCaller(),
    r2: store,
    // Never the real budget lookup in a test: it reads the live KV row.
    checkGuards: overrides.checkGuards ?? (async () => {}),
  };
}

Deno.test("§3.3 ready path: one call, picture stored publicly, becomes ready with the template version", async () => {
  const db = new FakeDb();
  db.rows.push(pictureRow());
  db.diagrams.push(diagramRow());
  db.templates["group-sus"] = { catalog_group_id: "group-sus", materials: "Painted shock absorbers with chrome rods.", enabled: true, version: 4 };
  const store = new FakeStore();
  let prompt = "";
  const result = await runPartPictureWorker(deps(db, store, {
    imagen: stubPartPictureCaller({ bytes: PNG }),
  }));
  // capture the prompt the fake saw
  const ready = db.readyCalls[0];
  prompt = ready.prompt;

  assertEquals(result, { skipped: false, processed: 1, stopped: null });
  assertEquals(store.puts.length, 1);
  const put = store.puts[0];
  assertEquals(put.bucket, "public");
  assertEquals(put.key, "catalogue/parts/pic-1/v1.png");
  assertEquals(put.contentType, "image/png");
  assertEquals(put.cacheControl, "public, max-age=31536000, immutable");
  assertEquals(ready.r2Key, "catalogue/parts/pic-1/v1.png");
  assertEquals(ready.costUsd, 0.04);
  assertEquals(ready.aiModel, "gemini-3.1-flash-image");
  assertEquals(ready.templateVersion, 4);
  assert(prompt.includes("Painted shock absorbers with chrome rods."), prompt);
  assert(prompt.includes("Find the part labelled 47777 — Shock absorber."), prompt);
  assertEquals(db.rows[0].status, "ready");
  assertEquals(db.rows[0].r2_key, "catalogue/parts/pic-1/v1.png");
});

Deno.test("§3.3 max_attempts counts the total calls: retry after 2 min, then 4, then failed", async () => {
  const db = new FakeDb();
  db.rows.push(pictureRow());
  db.diagrams.push(diagramRow());
  const store = new FakeStore();
  let calls = 0;
  const fail: PartPictureCaller = async () => {
    calls += 1;
    throw new Error("Imagen HTTP 503: upstream error");
  };

  const waits: number[] = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    await runPartPictureWorker(deps(db, store, { imagen: fail }));
    const row = db.rows[0];
    if (row.status === "queued") {
      waits.push(Math.round((Date.parse(row.next_attempt_at!) - db.now) / 60000));
      db.now = Date.parse(row.next_attempt_at!);
    }
  }

  // Three Gemini calls in all: two retries, then failed.
  assertEquals(calls, 3);
  assertEquals(waits, [2, 4]);
  assertEquals(db.rows[0].status, "failed");
  assertEquals(db.rows[0].attempts, 3);
  // A plain reason, never the provider's raw text.
  assert(db.rows[0].last_error && db.rows[0].last_error.length < 300, db.rows[0].last_error ?? "");
  assertEquals(store.puts.length, 0);
});

Deno.test("§3.3 a row is not started with less than 60 s of the run budget left; it waits without an attempt", async () => {
  const db = new FakeDb();
  db.rows.push(pictureRow({ id: "pic-1" }));
  db.rows.push(pictureRow({ id: "pic-2", interchange_group_id: "group-second" }));
  db.diagrams.push(diagramRow({ id: "diag-1", picture_id: "pic-1" }));
  db.diagrams.push(diagramRow({ id: "diag-2", picture_id: "pic-2", r2_key: "part-diagrams/pic-2/two.png" }));
  const store = new FakeStore();
  store.objects.set("private:part-diagrams/pic-2/two.png", PNG);

  let calls = 0;
  const slow: PartPictureCaller = async (opts) => {
    calls += 1;
    db.now += 35_000; // this call took 35 s: only 55 s of the 90 s budget would be left
    return await stubPartPictureCaller()(opts);
  };

  const result = await runPartPictureWorker(deps(db, store, { imagen: slow }));

  assertEquals(calls, 1);
  assertEquals(result.processed, 1);
  assertEquals(result.stopped, "time");
  assertEquals(db.rows.find((r) => r.id === "pic-1")!.status, "ready");
  const second = db.rows.find((r) => r.id === "pic-2")!;
  assertEquals([second.status, second.attempts], ["queued", 0]);
  assert(second.next_attempt_at, "the row that was not started must be put back in the queue");
});

Deno.test("§3.3 a budget block at row level gives the attempt back and stops the run", async () => {
  const db = new FakeDb();
  db.rows.push(pictureRow());
  db.diagrams.push(diagramRow());
  const store = new FakeStore();
  let calls = 0;
  const result = await runPartPictureWorker(deps(db, store, {
    checkGuards: async () => {
      calls += 1;
      if (calls > 1) throw new ProviderBlockedError("gemini", "budget_daily", "Daily budget reached");
    },
  }));

  assertEquals(result.processed, 0);
  assertEquals(result.stopped, "budget");
  assertEquals(db.rows[0].status, "queued");
  assertEquals(db.rows[0].attempts, 0);
  assertEquals(db.calls.includes("giveBack"), true);
  assertEquals(db.calls.includes("increment"), false);
});

Deno.test("§3.3 a budget block inside the Gemini call also gives the attempt back", async () => {
  const db = new FakeDb();
  db.rows.push(pictureRow());
  db.diagrams.push(diagramRow());
  const store = new FakeStore();
  const blocked: PartPictureCaller = async () => {
    throw new ProviderBlockedError("gemini", "budget_monthly", "Monthly budget reached");
  };
  const result = await runPartPictureWorker(deps(db, store, { imagen: blocked }));

  assertEquals(result.stopped, "budget");
  assertEquals(db.rows[0].attempts, 0);
  assertEquals(db.rows[0].status, "queued");
  assert((db.rows[0].next_attempt_at ?? "") > new Date(db.now).toISOString());
});

Deno.test("§3.3 a refused key pauses the feature and gives the attempt back", async () => {
  const db = new FakeDb();
  db.rows.push(pictureRow());
  db.diagrams.push(diagramRow());
  const store = new FakeStore();
  const saved: Array<Record<string, unknown>> = [];
  const result = await runPartPictureWorker(deps(db, store, {
    imagen: stubPartPictureFail({ kind: "key", status: 401 }),
    saveSettings: async (patch) => {
      saved.push(patch);
    },
  }));

  assertEquals(result.stopped, "key");
  assertEquals(db.rows[0].attempts, 0);
  const pause = saved.filter((patch) => patch.part_pictures_pause_reason === "key");
  assertEquals(pause.length, 1);
  assert(typeof pause[0].part_pictures_paused_until === "string");
});

Deno.test("§3.3 a content refusal fails that part only, without using more attempts", async () => {
  const db = new FakeDb();
  db.rows.push(pictureRow());
  db.diagrams.push(diagramRow());
  const store = new FakeStore();
  await runPartPictureWorker(deps(db, store, { imagen: stubPartPictureFail({ kind: "content" }) }));

  assertEquals(db.rows[0].status, "failed");
  assertEquals(db.rows[0].last_error, "The picture service refused this part");
  assertEquals(db.rows[0].attempts, 1);
});

Deno.test("§3.3 two runs never take the same row: the second finds nothing and spends nothing", async () => {
  const db = new FakeDb();
  db.rows.push(pictureRow());
  db.diagrams.push(diagramRow());
  const store = new FakeStore();
  let geminiCalls = 0;
  const caller: PartPictureCaller = async (opts) => {
    geminiCalls += 1;
    return await stubPartPictureCaller()(opts);
  };

  const first = await runPartPictureWorker(deps(db, store, { imagen: caller }));
  const second = await runPartPictureWorker(deps(db, store, { imagen: caller }));

  assertEquals(first.processed, 1);
  assertEquals(second.processed, 0);
  assertEquals(geminiCalls, 1);
  assertEquals(store.puts.length, 1);
});

Deno.test("§3.3 the switch off: no claim, no spend", async () => {
  const db = new FakeDb();
  db.rows.push(pictureRow());
  db.diagrams.push(diagramRow());
  const result = await runPartPictureWorker(deps(db, new FakeStore(), {
    settings: settings({ ai_part_pictures: false }),
  }));
  assertEquals(result, { skipped: false, processed: 0, stopped: "off" });
  assertEquals(db.calls.includes("claim"), false);
  assertEquals(db.rows[0].status, "queued");
});

Deno.test("§3.3 the daily max stops the run before claiming", async () => {
  const db = new FakeDb();
  db.rows.push(pictureRow());
  db.diagrams.push(diagramRow());
  db.madeToday = 50;
  const result = await runPartPictureWorker(deps(db, new FakeStore(), { settings: settings({ daily_max: 50 }) }));
  assertEquals(result.processed, 0);
  assertEquals(result.stopped, "daily_max");
  assertEquals(db.calls.includes("claim"), false);
});

Deno.test("§3.3 a group switched off after queueing waits an hour, without spending or using an attempt", async () => {
  const db = new FakeDb();
  db.rows.push(pictureRow());
  db.diagrams.push(diagramRow());
  db.templates["group-sus"] = { catalog_group_id: "group-sus", materials: "x", enabled: false, version: 1 };
  const result = await runPartPictureWorker(deps(db, new FakeStore()));
  assertEquals(result.processed, 0);
  assertEquals(db.rows[0].attempts, 0);
  assertEquals(db.rows[0].status, "queued");
  assertEquals(Math.round((Date.parse(db.rows[0].next_attempt_at!) - db.now) / 60000), 60);
});

Deno.test("§3.3 a lost diagram fails the row with a plain reason, never a retry loop", async () => {
  const db = new FakeDb();
  db.rows.push(pictureRow());
  const result = await runPartPictureWorker(deps(db, new FakeStore()));
  assertEquals(result.processed, 0);
  assertEquals(db.rows[0].status, "failed");
  assertEquals(db.rows[0].last_error, "The diagram is gone. Upload the page again as a single file.");
});

Deno.test("§3.3 an R2 read failure gives the attempt back and keeps the row queued", async () => {
  const db = new FakeDb();
  db.rows.push(pictureRow());
  db.diagrams.push(diagramRow());
  const store = new FakeStore();
  store.failRead = true;
  await runPartPictureWorker(deps(db, store));
  assertEquals(db.rows[0].attempts, 0);
  assertEquals(db.rows[0].status, "queued");
});

Deno.test("§3.3 no R2 configured leaves the row queued, never burning an attempt", async () => {
  const db = new FakeDb();
  db.rows.push(pictureRow());
  db.diagrams.push(diagramRow());
  await runPartPictureWorker(deps(db, null));
  assertEquals(db.rows[0].attempts, 0);
  assertEquals(db.rows[0].status, "queued");
});

Deno.test("§3.3 cleanup deletes old version files from the public bucket and stale diagrams from the private one", async () => {
  const db = new FakeDb();
  db.candidates = [
    { kind: "version", refId: "ver-1", pictureId: "pic-1", version: 1, r2Key: "catalogue/parts/pic-1/v1.png" },
    { kind: "diagram", refId: "diag-1", pictureId: "pic-1", version: null, r2Key: "part-diagrams/pic-1/one.png" },
  ];
  const store = new FakeStore();
  const out = await runPartPictureCleanup({ db, r2: store, retentionDays: 30, now: new Date(NOW) });

  assertEquals(out, { versions: 1, diagrams: 1 });
  assertEquals(store.removes, [
    { bucket: "public", key: "catalogue/parts/pic-1/v1.png" },
    { bucket: "private", key: "part-diagrams/pic-1/one.png" },
  ]);
  assertEquals(db.markedVersions, ["ver-1"]);
  assertEquals(db.markedDiagrams, ["diag-1"]);
});

Deno.test("§3.3 cleanup runs at most every 10 minutes, and only marks a file after R2 confirms", async () => {
  const db = new FakeDb();
  db.candidates = [{ kind: "diagram", refId: "diag-1", pictureId: "pic-1", version: null, r2Key: "part-diagrams/pic-1/one.png" }];
  const store = new FakeStore();
  const saved: Array<Record<string, unknown>> = [];
  const recent = new Date(NOW - 60_000).toISOString();
  const out = await runPartPictureCleanup({
    db,
    r2: store,
    retentionDays: 30,
    now: new Date(NOW),
    loadSettings: async () => ({ part_picture_cleanup_last_run_at: recent }),
    saveSettings: async (patch) => {
      saved.push(patch);
    },
  });
  assertEquals(out, { versions: 0, diagrams: 0 });
  assertEquals(store.removes.length, 0);

  // A delete that throws leaves the row unmarked so the next run retries.
  db.candidates = [{ kind: "version", refId: "ver-1", pictureId: "pic-1", version: 1, r2Key: "catalogue/parts/pic-1/v1.png" }];
  const failing: PartObjectStore = {
    read: store.read.bind(store),
    put: store.put.bind(store),
    remove: async () => {
      throw new Error("R2 DELETE 500");
    },
  };
  const failingOut = await runPartPictureCleanup({ db, r2: failing, retentionDays: 30, now: new Date(NOW) });
  assertEquals(failingOut, { versions: 0, diagrams: 0 });
  assertEquals(db.markedVersions, []);
});

Deno.test("§3.3 contentTypeForKey reads the stored picture type from the key", () => {
  assertEquals(contentTypeForKey("catalogue/parts/pic-1/v1.png"), "image/png");
  assertEquals(contentTypeForKey("part-diagrams/pic-1/one.jpg"), "image/jpeg");
  assertEquals(contentTypeForKey("part-diagrams/pic-1/one.webp"), "image/webp");
  assertEquals(contentTypeForKey("part-diagrams/pic-1/one.bin"), "application/octet-stream");
});
