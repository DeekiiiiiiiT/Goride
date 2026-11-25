import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runFuelPhotoReader, type PhotoReaderDeps } from "./fuel_photo_reader.ts";

// Made-up ids; numbers from a real 5179KZ cash fill (J$4,000.00 · 18.70 L).
const CAPTURE = "0b8f6d2a-3c41-4e7a-9a11-5d2c7e9f0a01";

function fill(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    category: "Fuel",
    type: "Expense",
    status: "Pending",
    driverId: "zz-driver-1",
    receiptUrl: `https://example.test/${id}-pump.jpg`,
    metadata: { captureId: CAPTURE, photoReadStatus: "waiting", odometerProofUrl: `https://example.test/${id}-odo.jpg` },
    ...extra,
  };
}

function harness(store: Record<string, Record<string, unknown>>, opts: {
  attempts?: number;
  pump?: (url: string) => { amount: number | null; liters: number | null; odometer: number | null };
  openFails?: boolean;
} = {}) {
  const finished: Array<[string, string | null, string | null]> = [];
  const deps: PhotoReaderDeps = {
    claim: () => Promise.resolve(Object.keys(store).map((id) => ({ transaction_id: id, organization_id: "zz-org", attempts: opts.attempts ?? 1 }))),
    finish: (id, outcome, _err, retryAt) => {
      finished.push([id, outcome, retryAt]);
      return Promise.resolve();
    },
    loadFill: (id) => Promise.resolve(store[id] ?? null),
    saveFill: (f) => {
      store[String(f.id)] = f;
      return Promise.resolve();
    },
    openPhoto: (url) => (opts.openFails ? Promise.reject(new Error("404")) : Promise.resolve(`data:image/jpeg;base64,${url}`)),
    readPump: (dataUrl) => Promise.resolve(opts.pump ? opts.pump(dataUrl) : { amount: 4000, liters: 18.7, odometer: null }),
    readOdometer: () => Promise.resolve(200412),
    now: () => new Date("2026-11-25T12:20:00Z"),
  };
  return { deps, finished };
}

Deno.test("reader: readable photos -> fill ready for review, queue marked read", async () => {
  const store: Record<string, Record<string, unknown>> = { a: fill("a") };
  const { deps, finished } = harness(store);
  const run = await runFuelPhotoReader(deps);
  assertEquals(run, { claimed: 1, read: 1, needsLook: 0, retry: 0, gone: 0 });
  assertEquals(store.a.amount, -4000);
  assertEquals(store.a.odometer, 200412);
  assertEquals((store.a.metadata as Record<string, unknown>).photoReadStatus, "read");
  assertEquals(finished, [["a", "read", null]]);
});

Deno.test("reader: unreadable pump -> Needs a look", async () => {
  const store: Record<string, Record<string, unknown>> = { a: fill("a", { odometer: 200412 }) };
  const { deps, finished } = harness(store, { pump: () => ({ amount: null, liters: null, odometer: null }) });
  const run = await runFuelPhotoReader(deps);
  assertEquals(run.needsLook, 1);
  assertEquals((store.a.metadata as Record<string, unknown>).needsLookReason, "Pump photo not readable — total and litres not read");
  assertEquals(finished, [["a", "needs_look", null]]);
});

Deno.test("reader: photo won't open -> try again later, then Needs a look", async () => {
  const store: Record<string, Record<string, unknown>> = { a: fill("a") };
  const first = harness(store, { openFails: true, attempts: 1 });
  assertEquals((await runFuelPhotoReader(first.deps)).retry, 1);
  assertEquals(first.finished[0][1], null);
  assertEquals(first.finished[0][2], "2026-11-25T12:30:00.000Z");
  assertEquals((store.a.metadata as Record<string, unknown>).photoReadStatus, "waiting");

  const last = harness(store, { openFails: true, attempts: 3 });
  assertEquals((await runFuelPhotoReader(last.deps)).needsLook, 1);
  assertEquals((store.a.metadata as Record<string, unknown>).photoReadStatus, "needs_look");
});

Deno.test("reader: fill already finished or deleted -> left alone", async () => {
  const done = fill("b", { metadata: { captureId: CAPTURE, photoReadStatus: "read" } });
  const store: Record<string, Record<string, unknown>> = { b: done };
  const { deps, finished } = harness(store);
  const run = await runFuelPhotoReader({ ...deps, claim: () => Promise.resolve([
    { transaction_id: "b", organization_id: "zz-org", attempts: 1 },
    { transaction_id: "missing", organization_id: "zz-org", attempts: 1 },
  ]) });
  assertEquals(run.gone, 2);
  assertEquals(store.b, done);
  assertEquals(finished.map((f) => f[1]), ["gone", "gone"]);
});

Deno.test("reader: no pump photo -> Needs a look straight away", async () => {
  const store: Record<string, Record<string, unknown>> = { a: fill("a", { receiptUrl: "" }) };
  const { deps } = harness(store);
  assertEquals((await runFuelPhotoReader(deps)).needsLook, 1);
  assertEquals((store.a.metadata as Record<string, unknown>).needsLookReason, "No pump photo on this fill");
});
