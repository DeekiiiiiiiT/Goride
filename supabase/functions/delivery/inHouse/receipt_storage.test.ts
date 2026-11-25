/**
 * In-house receipts on Cloudflare R2 (docs/cloudflare-r2-storage-migration-audit.md §0, slice 4).
 * deno test --no-config --no-lock --no-check --allow-env --allow-read <this file>
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { R2_PRIVATE_BUCKET_ID } from "../../_shared/objectStorage/fileLink.ts";
import {
  buildInHouseReceiptR2Key,
  IN_HOUSE_RECEIPT_BUCKET,
  IN_HOUSE_RECEIPT_CACHE,
  IN_HOUSE_RECEIPT_MAX_BYTES,
  IN_HOUSE_RECEIPT_MIMES,
  legacyInHouseReceiptPath,
  parseInHouseReceiptAddress,
  putInHouseReceipt,
  removeInHouseReceipts,
  signInHouseReceiptAddress,
} from "./receipt_storage.ts";

const ENV: Record<string, string> = {
  FILE_LINK_SECRET: "secret-1",
  SUPABASE_URL: "https://x.supabase.co",
};
const env = (n: string) => ENV[n];

function fakeSupabase() {
  const calls: { bucket: string; paths: string[] }[] = [];
  return {
    calls,
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          calls.push({ bucket, paths });
          return { error: null };
        },
      }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

Deno.test("in-house receipts: limits are the route's (5 MB, photo or PDF)", () => {
  assertEquals(IN_HOUSE_RECEIPT_MAX_BYTES, 5 * 1024 * 1024);
  assertEquals([...IN_HOUSE_RECEIPT_MIMES].sort(), ["application/pdf", "image/jpeg", "image/png", "image/webp"]);
  assertEquals(IN_HOUSE_RECEIPT_CACHE, "private, no-store");
});

Deno.test("in-house receipts: keys are scoped by merchant and task, old path unchanged", () => {
  const key = buildInHouseReceiptR2Key("m-1", "task-1", "jpg");
  assert(/^in-house-receipts\/m-1\/task-1-[0-9a-f-]{36}\.jpg$/.test(key), key);

  // Nothing can escape the folder.
  assertEquals(buildInHouseReceiptR2Key("../../evil", "task/../1", "png").startsWith("in-house-receipts/evil/"), true);
  assert(buildInHouseReceiptR2Key(null, "task-1", "pdf").startsWith("in-house-receipts/no-merchant/"), true);
  assertEquals(buildInHouseReceiptR2Key("m-1", "task-1", ".PDF").endsWith(".pdf"), true);

  const id = "2f6b1c1e-0000-4000-8000-000000000001";
  assertEquals(legacyInHouseReceiptPath("task-1", "webp", id), `task-1/${id}.webp`);
  assertEquals(legacyInHouseReceiptPath("task-1", ".JPG", id), `task-1/${id}.jpg`);
});

Deno.test("in-house receipts: the stored address is a signed file-link that resolves to the key", async () => {
  const key = buildInHouseReceiptR2Key("m-1", "task-1", "pdf");
  const address = await signInHouseReceiptAddress(key, env);
  assert(address.includes("/functions/v1/file-link?b=private&"), address);
  assert(address.includes(encodeURIComponent(key)) || address.includes(key), address);
  assertEquals(parseInHouseReceiptAddress(address, env), {
    storage: "r2",
    bucket: R2_PRIVATE_BUCKET_ID,
    path: key,
  });
  // Parsing is not verification: the file-link function checks the signature on request.
  // An unsafe key is refused outright.
  assertEquals(
    parseInHouseReceiptAddress("https://x.supabase.co/functions/v1/file-link?b=private&k=../evil.pdf&e=1&s=00", env),
    null,
  );
});

Deno.test("in-house receipts: old receipts still parse (bare path and old Supabase URL)", () => {
  assertEquals(parseInHouseReceiptAddress("task-1/2f6b1c1e-0000-4000-8000-000000000001.jpg"), {
    storage: "supabase",
    bucket: IN_HOUSE_RECEIPT_BUCKET,
    path: "task-1/2f6b1c1e-0000-4000-8000-000000000001.jpg",
  });
  assertEquals(
    parseInHouseReceiptAddress("https://x.supabase.co/storage/v1/object/sign/in-house-receipts/task-1/a.pdf?token=t"),
    { storage: "supabase", bucket: IN_HOUSE_RECEIPT_BUCKET, path: "task-1/a.pdf" },
  );
  assertEquals(parseInHouseReceiptAddress(""), null);
  assertEquals(parseInHouseReceiptAddress(null), null);
  assertEquals(parseInHouseReceiptAddress("https://example.com/whatever.pdf"), null);
});

Deno.test("in-house receipts: writing goes to roam-private with a private cache header", async () => {
  const puts: Array<{ bucket: string; key: string; type: string; cache: string }> = [];
  await putInHouseReceipt("in-house-receipts/m-1/task-1-x.pdf", new Uint8Array([1, 2, 3]), "application/pdf", async (bucket, k, _b, type, cache) => {
    puts.push({ bucket, key: k, type, cache });
  });
  assertEquals(puts, [{
    bucket: "private",
    key: "in-house-receipts/m-1/task-1-x.pdf",
    type: "application/pdf",
    cache: IN_HOUSE_RECEIPT_CACHE,
  }]);
});

Deno.test("in-house receipts: delete routes R2 copies to R2 and old receipts to Supabase", async () => {
  const r2Calls: Array<{ keys: string[]; bucket?: string }> = [];
  const supabase = fakeSupabase();
  const key = buildInHouseReceiptR2Key("m-1", "task-1", "jpg");
  const address = await signInHouseReceiptAddress(key, env);
  const oldPath = "task-1/2f6b1c1e-0000-4000-8000-000000000001.jpg";

  const res = await removeInHouseReceipts(supabase, [address, oldPath, ""], {
    env,
    r2Remove: (keys, bucket) => {
      r2Calls.push({ keys, bucket });
      return Promise.resolve();
    },
  });

  assertEquals(res, { removed: 2, errors: [], skipped: 1 });
  assertEquals(r2Calls, [{ keys: [key], bucket: "private" }]);
  assertEquals(supabase.calls, [{ bucket: IN_HOUSE_RECEIPT_BUCKET, paths: [oldPath] }]);
});

Deno.test("in-house receipts: a failed delete is reported, never thrown", async () => {
  const key = buildInHouseReceiptR2Key("m-1", "task-1", "jpg");
  const address = await signInHouseReceiptAddress(key, env);
  const res = await removeInHouseReceipts(fakeSupabase(), [address], {
    env,
    r2Remove: () => Promise.reject(new Error("R2 DELETE 500")),
  });
  assertEquals(res.removed, 0);
  assertEquals(res.errors, ["R2 DELETE 500"]);

  const badSupabase = {
    storage: { from: () => ({ remove: async () => ({ error: { message: "storage says no" } }) }) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const oldRes = await removeInHouseReceipts(badSupabase, ["task-1/a.jpg"], { env });
  assertEquals(oldRes.errors, ["storage says no"]);
});
