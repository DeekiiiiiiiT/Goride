/**
 * R2 upload / finish / download rules (M2 of docs/cloudflare-r2-storage-migration-audit.md).
 * deno test --allow-env supabase/functions/_shared/objectStorage/
 */
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  deleteStoredFile,
  downloadLink,
  finishUpload,
  type ObjectStore,
  PRIVATE_CACHE,
  PUBLIC_CACHE,
  startUpload,
  StorageFlowError,
} from "./uploadFlow.ts";
import type { R2BucketKind } from "./r2Client.ts";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1]);
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n");

type Obj = { bytes: Uint8Array; contentType: string; cacheControl?: string };

function fakeStore() {
  const objects = new Map<string, Obj>();
  const id = (b: R2BucketKind, k: string) => `${b}:${k}`;
  const calls: string[] = [];
  const store: ObjectStore = {
    presignUpload: (b, k, ct) => Promise.resolve(`https://r2.test/${b}/${k}?put&ct=${ct}`),
    presignDownload: (b, k, s) => Promise.resolve(`https://r2.test/${b}/${k}?get&exp=${s}`),
    publicUrl: (k) => `https://media.test/${k}`,
    head: (b, k) => {
      const o = objects.get(id(b, k));
      return Promise.resolve(o ? { size: o.bytes.length, contentType: o.contentType } : null);
    },
    readStart: (b, k, n = 4096) => Promise.resolve(objects.get(id(b, k))!.bytes.subarray(0, n)),
    read: (b, k) => {
      calls.push(`read:${k}`);
      return Promise.resolve(objects.get(id(b, k))!.bytes);
    },
    copy: (from, to, meta) => {
      const o = objects.get(id(from.bucket, from.key))!;
      objects.set(id(to.bucket, to.key), { bytes: o.bytes, contentType: meta.contentType, cacheControl: meta.cacheControl });
      return Promise.resolve();
    },
    remove: (b, keys) => {
      keys.forEach((k) => objects.delete(id(b, k)));
      return Promise.resolve();
    },
    put: (b, k, bytes, contentType, cacheControl) => {
      objects.set(id(b, k), { bytes, contentType, cacheControl });
      return Promise.resolve();
    },
  };
  /** Simulates the app's PUT to the presigned link. */
  const put = (pendingKey: string, bytes: Uint8Array, contentType: string) =>
    objects.set(id("private", pendingKey), { bytes, contentType });
  return { store, objects, put, calls };
}

function deps(store: ObjectStore, extra: Partial<Parameters<typeof startUpload>[1]> = {}) {
  let n = 0;
  return {
    store,
    ticketSecret: "test-secret",
    uuid: () => `aaaaaaaa-0000-4000-8000-00000000000${n++}`,
    scan: () => Promise.resolve({ clean: true }),
    ...extra,
  };
}

function pendingKeyOf(uploadUrl: string): string {
  return new URL(uploadUrl).pathname.replace(/^\/private\//, "");
}

Deno.test("evidence photo: start → put → finish lands in the org folder as private", async () => {
  const f = fakeStore();
  const d = deps(f.store);
  const s = await startUpload({ purpose: "evidence", scopeId: ORG_A, userId: USER, contentType: "image/jpeg", size: JPEG.length }, d);
  assertEquals(s.headers["content-type"], "image/jpeg");
  const pending = pendingKeyOf(s.uploadUrl);
  assert(pending.startsWith("pending/"));
  f.put(pending, JPEG, "image/jpeg");

  const done = await finishUpload({ ticket: s.ticket, userId: USER }, d);
  assertEquals(done.bucket, "private");
  assert(done.key.startsWith(`evidence/${ORG_A}/`) && done.key.endsWith(".jpg"));
  assertEquals(done.publicUrl, null);
  assertEquals(f.objects.get(`private:${done.key}`)?.cacheControl, PRIVATE_CACHE);
  assertEquals(f.objects.has(`private:${pending}`), false, "pending copy removed");
});

Deno.test("catalogue image is public, cached for a year, and gets a media address", async () => {
  const f = fakeStore();
  const d = deps(f.store);
  const s = await startUpload({ purpose: "catalogue-images", scopeId: "platform", userId: USER, contentType: "image/jpeg", size: 14 }, d);
  f.put(pendingKeyOf(s.uploadUrl), JPEG, "image/jpeg");
  const done = await finishUpload({ ticket: s.ticket, userId: USER }, d);
  assertEquals(done.bucket, "public");
  assertEquals(done.publicUrl, `https://media.test/${done.key}`);
  assertEquals(f.objects.get(`public:${done.key}`)?.cacheControl, PUBLIC_CACHE);
});

Deno.test("profile photos are public: permanent media address, never a link that expires", async () => {
  for (const purpose of ["driver-photos", "courier-profile"]) {
    const f = fakeStore();
    const d = deps(f.store);
    const s = await startUpload({ purpose, scopeId: USER, userId: USER, contentType: "image/jpeg", size: 14 }, d);
    f.put(pendingKeyOf(s.uploadUrl), JPEG, "image/jpeg");
    const done = await finishUpload({ ticket: s.ticket, userId: USER }, d);

    assertEquals(done.bucket, "public", purpose);
    assert(done.key.startsWith(`${purpose}/${USER}/`), done.key);
    // A plain media address: no query string, no signature, no expiry.
    assertEquals(done.publicUrl, `https://media.test/${done.key}`);
    assert(!String(done.publicUrl).includes("?"), String(done.publicUrl));
    // Kept in roam-public with the one-year immutable cache header.
    assertEquals(f.objects.get(`public:${done.key}`)?.cacheControl, PUBLIC_CACHE);
    assertEquals(f.objects.has(`private:${done.key}`), false);
  }
});

Deno.test("delivery proofs stay private: no public address for courier photos", async () => {
  const f = fakeStore();
  const d = deps(f.store);
  const s = await startUpload({ purpose: "courier-photos", scopeId: USER, userId: USER, contentType: "image/jpeg", size: 14 }, d);
  f.put(pendingKeyOf(s.uploadUrl), JPEG, "image/jpeg");
  const done = await finishUpload({ ticket: s.ticket, userId: USER }, d);
  assertEquals(done.bucket, "private");
  assertEquals(done.publicUrl, null);
  assertEquals(f.objects.get(`private:${done.key}`)?.cacheControl, PRIVATE_CACHE);
});

Deno.test("start refuses unknown purpose, wrong type, oversize and bad scope", async () => {
  const d = deps(fakeStore().store);
  const base = { purpose: "evidence", scopeId: ORG_A, userId: USER, contentType: "image/jpeg", size: 100 };
  const status = async (input: typeof base) => {
    try {
      await startUpload(input, d);
      return 200;
    } catch (e) {
      return (e as StorageFlowError).status;
    }
  };
  assertEquals(await status({ ...base, purpose: "nope" }), 400);
  assertEquals(await status({ ...base, contentType: "text/html" }), 415);
  assertEquals(await status({ ...base, size: 6 * 1024 * 1024 }), 413);
  assertEquals(await status({ ...base, scopeId: "../other" }), 400);
  assertEquals(await status({ ...base, purpose: "catalogue-images", scopeId: ORG_A }), 400, "platform purposes need scope 'platform'");
});

Deno.test("finish deletes a file whose bytes are not what the app declared", async () => {
  const f = fakeStore();
  const d = deps(f.store);
  const s = await startUpload({ purpose: "evidence", scopeId: ORG_A, userId: USER, contentType: "image/jpeg", size: 50 }, d);
  const pending = pendingKeyOf(s.uploadUrl);
  f.put(pending, new TextEncoder().encode("<html><script>alert(1)</script></html>"), "image/jpeg");
  const err = await assertRejects(() => finishUpload({ ticket: s.ticket, userId: USER }, d), StorageFlowError);
  assertEquals(err.status, 415);
  assertEquals(f.objects.size, 0, "rejected upload removed");
});

Deno.test("finish deletes a file that grew past the limit after start", async () => {
  const f = fakeStore();
  const d = deps(f.store);
  const s = await startUpload({ purpose: "customer-avatars", scopeId: USER, userId: USER, contentType: "image/jpeg", size: 100 }, d);
  const big = new Uint8Array(2 * 1024 * 1024 + 1);
  big.set(JPEG);
  f.put(pendingKeyOf(s.uploadUrl), big, "image/jpeg");
  const err = await assertRejects(() => finishUpload({ ticket: s.ticket, userId: USER }, d), StorageFlowError);
  assertEquals(err.status, 413);
  assertEquals(f.objects.size, 0);
});

Deno.test("KYC upload runs the virus check and is removed when it fails", async () => {
  const f = fakeStore();
  const d = deps(f.store, { scan: () => Promise.resolve({ clean: false, reason: "scanner not configured" }) });
  const s = await startUpload({ purpose: "merchant-kyc", scopeId: ORG_A, userId: USER, contentType: "application/pdf", size: PDF.length }, d);
  f.put(pendingKeyOf(s.uploadUrl), PDF, "application/pdf");
  const err = await assertRejects(() => finishUpload({ ticket: s.ticket, userId: USER }, d), StorageFlowError);
  assertEquals(err.status, 422);
  assertEquals(f.objects.size, 0);
});

Deno.test("KYC upload passes when the scan is clean", async () => {
  const f = fakeStore();
  const d = deps(f.store);
  const s = await startUpload({ purpose: "driver-docs", scopeId: USER, userId: USER, contentType: "application/pdf", size: PDF.length }, d);
  f.put(pendingKeyOf(s.uploadUrl), PDF, "application/pdf");
  const done = await finishUpload({ ticket: s.ticket, userId: USER }, d);
  assert(done.key.startsWith(`driver-docs/${USER}/`));
  assert(f.calls.some((c) => c.startsWith("read:pending/")), "full file read for the scan");
});

Deno.test("ticket: tampered, expired, or another user's ticket is refused", async () => {
  const f = fakeStore();
  let now = Date.UTC(2026, 10, 16, 12);
  const d = deps(f.store, { now: () => now });
  const s = await startUpload({ purpose: "evidence", scopeId: ORG_A, userId: USER, contentType: "image/jpeg", size: 14 }, d);
  f.put(pendingKeyOf(s.uploadUrl), JPEG, "image/jpeg");

  const [body, sig] = s.ticket.split(".");
  const forged = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
  forged.scopeId = ORG_B;
  const forgedBody = btoa(JSON.stringify(forged)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assertEquals((await assertRejects(() => finishUpload({ ticket: `${forgedBody}.${sig}`, userId: USER }, d), StorageFlowError)).status, 400);
  assertEquals((await assertRejects(() => finishUpload({ ticket: s.ticket, userId: ORG_B }, d), StorageFlowError)).status, 403);
  assertEquals((await assertRejects(() => finishUpload({ ticket: s.ticket, userId: USER }, { ...d, ticketSecret: "other" }), StorageFlowError)).status, 400);
  now += 16 * 60 * 1000;
  assertEquals((await assertRejects(() => finishUpload({ ticket: s.ticket, userId: USER }, d), StorageFlowError)).status, 400);
});

Deno.test("finish twice returns the same file (retry-safe)", async () => {
  const f = fakeStore();
  const d = deps(f.store);
  const s = await startUpload({ purpose: "evidence", scopeId: ORG_A, userId: USER, contentType: "image/jpeg", size: 14 }, d);
  f.put(pendingKeyOf(s.uploadUrl), JPEG, "image/jpeg");
  const a = await finishUpload({ ticket: s.ticket, userId: USER }, d);
  const b = await finishUpload({ ticket: s.ticket, userId: USER }, d);
  assertEquals(a.key, b.key);
});

Deno.test("finish before the file was sent says so", async () => {
  const d = deps(fakeStore().store);
  const s = await startUpload({ purpose: "evidence", scopeId: ORG_A, userId: USER, contentType: "image/jpeg", size: 14 }, d);
  assertEquals((await assertRejects(() => finishUpload({ ticket: s.ticket, userId: USER }, d), StorageFlowError)).status, 404);
});

Deno.test("download: 10-minute link inside your folder, refused outside it", async () => {
  const { store } = fakeStore();
  const key = `evidence/${ORG_A}/x.jpg`;
  const ok = await downloadLink({ purpose: "evidence", scopeId: ORG_A, key }, { store });
  assertEquals(ok.expiresInSeconds, 600);
  assert(ok.url.includes("exp=600"));
  assertEquals((await assertRejects(() => downloadLink({ purpose: "evidence", scopeId: ORG_B, key }, { store }), StorageFlowError)).status, 403);
  assertEquals(
    (await assertRejects(() => downloadLink({ purpose: "fleet-docs", scopeId: ORG_A, key }, { store }), StorageFlowError)).status,
    403,
    "another purpose's folder",
  );
  const pub = await downloadLink({ purpose: "merchant-assets", scopeId: ORG_A, key: `merchant/${ORG_A}/m.webp` }, { store });
  assertEquals(pub, { url: `https://media.test/merchant/${ORG_A}/m.webp`, expiresInSeconds: null });
});

Deno.test("delete is limited to your folder", async () => {
  const f = fakeStore();
  f.objects.set(`private:evidence/${ORG_A}/x.jpg`, { bytes: JPEG, contentType: "image/jpeg" });
  await assertRejects(() => deleteStoredFile({ purpose: "evidence", scopeId: ORG_B, key: `evidence/${ORG_A}/x.jpg` }, { store: f.store }));
  await deleteStoredFile({ purpose: "evidence", scopeId: ORG_A, key: `evidence/${ORG_A}/x.jpg` }, { store: f.store });
  assertEquals(f.objects.size, 0);
});
