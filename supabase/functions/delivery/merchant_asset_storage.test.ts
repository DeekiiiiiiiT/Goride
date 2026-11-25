/**
 * Merchant assets on Cloudflare R2 (docs/cloudflare-r2-storage-migration-audit.md §0, slice 3).
 * deno test --no-config --no-lock --no-check --allow-env --allow-read <this file>
 */
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  buildMerchantAssetKey,
  isR2PublicAssetsEnabled,
  MERCHANT_ASSET_BUCKET,
  MERCHANT_ASSET_CACHE,
  MERCHANT_ASSET_MAX_BYTES,
  MERCHANT_ASSET_MIMES,
  merchantAssetAddress,
  merchantAssetFolder,
  merchantAssetPrefix,
  merchantAssetScope,
  parseMerchantAssetAddress,
  putMerchantAsset,
  R2_PUBLIC_BUCKET_ID,
  removeMerchantAssets,
} from "./merchant_asset_storage.ts";

const BASE = "https://media.test";
const MEDIA = "https://media.roamfleet.co/merchant/m-1/logo/2f6b1c1e2f6b1c1e.png";
const OLD_URL =
  "https://x.supabase.co/storage/v1/object/public/merchant-assets/user-1/logo/abc.jpg";

const bytesOf = (text: string) => new TextEncoder().encode(text);

function fakeSupabase() {
  const calls: { op: string; bucket: string; arg: string }[] = [];
  return {
    calls,
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          calls.push({ op: "remove", bucket, arg: paths.join(",") });
          return { error: null };
        },
      }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

Deno.test("merchant assets: switch is the evidence switch plus the media base address", () => {
  const full: Record<string, string> = {
    R2_ACCOUNT_ID: "a",
    R2_ACCESS_KEY_ID: "b",
    R2_SECRET_ACCESS_KEY: "c",
    FILE_LINK_SECRET: "d",
    SUPABASE_URL: "https://x.supabase.co",
    R2_PUBLIC_BASE_URL: "https://media.roamfleet.co",
  };
  assert(isR2PublicAssetsEnabled((n) => full[n]));
  for (const missing of Object.keys(full)) {
    assertEquals(isR2PublicAssetsEnabled((n) => (n === missing ? "" : full[n])), false, missing);
  }
  // Without a media address a public file has nowhere to be read from: stay on Supabase.
  const noBase = { ...full };
  delete noBase.R2_PUBLIC_BASE_URL;
  assertEquals(isR2PublicAssetsEnabled((n) => noBase[n]), false);
});

Deno.test("merchant assets: limits are the old bucket's (5 MB, jpeg/png/webp)", () => {
  assertEquals(MERCHANT_ASSET_MAX_BYTES, 5 * 1024 * 1024);
  assertEquals([...MERCHANT_ASSET_MIMES].sort(), ["image/jpeg", "image/png", "image/webp"]);
  assertEquals(MERCHANT_ASSET_CACHE, "public, max-age=31536000, immutable");
});

Deno.test("merchant assets: scope is the merchant, falling back to the signed-in user", () => {
  assertEquals(merchantAssetScope("m-1", "user-1"), "m-1");
  assertEquals(merchantAssetScope(null, "user-1"), "user-1");
  assertEquals(merchantAssetScope("", "user-1"), "user-1");
  assertEquals(merchantAssetScope("  ", "  "), "unknown");
  // Nothing can escape its folder.
  assertEquals(merchantAssetScope("../../x", "user-1"), "x");
  assertEquals(merchantAssetFolder("logo"), "logo");
  assertEquals(merchantAssetFolder(null), "images");
  assertEquals(merchantAssetFolder("../etc"), "etc");
  assertEquals(merchantAssetFolder("x".repeat(40)).length, 32);
  assertEquals(merchantAssetPrefix("m-1", "logo"), "merchant/m-1/logo/");
});

Deno.test("merchant assets: the key carries a content hash, so a changed image gets a new address", async () => {
  const a = await buildMerchantAssetKey({ scopeId: "m-1", folder: "logo", contentType: "image/png", bytes: bytesOf("one") });
  const b = await buildMerchantAssetKey({ scopeId: "m-1", folder: "logo", contentType: "image/png", bytes: bytesOf("two") });
  const again = await buildMerchantAssetKey({ scopeId: "m-1", folder: "logo", contentType: "image/png", bytes: bytesOf("one") });

  assert(/^merchant\/m-1\/logo\/[0-9a-f]{16}\.png$/.test(a), a);
  assert(/^merchant\/m-1\/logo\/[0-9a-f]{16}\.png$/.test(b), b);
  assertEquals(a, again); // same picture → same key, no duplicate copy
  assert(a !== b); // changed picture → new key and address

  const jpg = await buildMerchantAssetKey({ scopeId: "m-1", folder: "cover", contentType: "image/jpeg", bytes: bytesOf("x") });
  assert(jpg.endsWith(".jpg"), jpg);
  // Another merchant never shares a folder.
  const other = await buildMerchantAssetKey({ scopeId: "m-2", folder: "logo", contentType: "image/png", bytes: bytesOf("one") });
  assertEquals(other.startsWith("merchant/m-2/logo/"), true);
});

Deno.test("merchant assets: the answer is the media.roamfleet.co address", async () => {
  const key = await buildMerchantAssetKey({ scopeId: "m-1", folder: "logo", contentType: "image/png", bytes: bytesOf("one") });
  assertEquals(
    merchantAssetAddress(key, (n) => (n === "R2_PUBLIC_BASE_URL" ? "https://media.test" : undefined)),
    `${BASE}/${key}`,
  );
  assertThrows(
    () => merchantAssetAddress(key, () => undefined),
    Error,
    "R2_PUBLIC_BASE_URL not set",
  );
});

Deno.test("merchant assets: writing goes to roam-public with the immutable cache header", async () => {
  const puts: Array<{ bucket: string; key: string; type: string; cache: string }> = [];
  await putMerchantAsset("merchant/m-1/logo/h.png", bytesOf("one"), "image/png", async (bucket, k, _data, type, cache) => {
    puts.push({ bucket, key: k, type, cache });
  });
  assertEquals(puts, [{
    bucket: "public",
    key: "merchant/m-1/logo/h.png",
    type: "image/png",
    cache: MERCHANT_ASSET_CACHE,
  }]);
});

Deno.test("merchant assets: old Supabase addresses and new media addresses both parse", () => {
  const key = "merchant/m-1/logo/2f6b1c1e2f6b1c1e.png";
  assertEquals(parseMerchantAssetAddress(`${BASE}/${key}`, BASE), {
    storage: "r2",
    bucket: R2_PUBLIC_BUCKET_ID,
    path: key,
  });
  // The live base in a stored address, read with the live base configured.
  assertEquals(parseMerchantAssetAddress(MEDIA, "https://media.roamfleet.co"), {
    storage: "r2",
    bucket: R2_PUBLIC_BUCKET_ID,
    path: "merchant/m-1/logo/2f6b1c1e2f6b1c1e.png",
  });

  // Old rows keep the full Supabase public URL — the Rush apps still show them.
  assertEquals(parseMerchantAssetAddress(OLD_URL), {
    storage: "supabase",
    bucket: MERCHANT_ASSET_BUCKET,
    path: "user-1/logo/abc.jpg",
  });
  // …and the bare path the old route returned in `path`.
  assertEquals(parseMerchantAssetAddress("user-1/logo/abc.jpg"), {
    storage: "supabase",
    bucket: MERCHANT_ASSET_BUCKET,
    path: "user-1/logo/abc.jpg",
  });

  assertEquals(parseMerchantAssetAddress(""), null);
  assertEquals(parseMerchantAssetAddress(null), null);
  assertEquals(parseMerchantAssetAddress("https://example.com/x.png"), null);
  assertEquals(parseMerchantAssetAddress(`${BASE}/merchant/../x.png`, BASE), null);
});

Deno.test("merchant assets: delete routes media addresses to R2 and old ones to Supabase", async () => {
  const r2Calls: Array<{ keys: string[]; bucket?: string }> = [];
  const supabase = fakeSupabase();
  const key = "merchant/m-1/logo/2f6b1c1e2f6b1c1e.png";

  const res = await removeMerchantAssets(supabase, [`${BASE}/${key}`, OLD_URL, "user-1/logo/old.jpg"], {
    publicBase: BASE,
    r2Remove: (keys, bucket) => {
      r2Calls.push({ keys, bucket });
      return Promise.resolve();
    },
  });

  assertEquals(res, { removed: 3, errors: [], skipped: 0 });
  assertEquals(r2Calls, [{ keys: [key], bucket: "public" }]);
  assertEquals(supabase.calls, [{ op: "remove", bucket: MERCHANT_ASSET_BUCKET, arg: "user-1/logo/abc.jpg,user-1/logo/old.jpg" }]);
});

Deno.test("merchant assets: unknown addresses are skipped and failures reported, never thrown", async () => {
  const supabase = fakeSupabase();
  const res = await removeMerchantAssets(supabase, ["", "https://example.com/x.png"], { publicBase: BASE });
  assertEquals(res, { removed: 0, errors: [], skipped: 2 });
  assertEquals(supabase.calls, []);

  const failed = await removeMerchantAssets(supabase, [`${BASE}/merchant/m-1/logo/x.png`], {
    publicBase: BASE,
    r2Remove: () => Promise.reject(new Error("R2 DELETE 500")),
  });
  assertEquals(failed.removed, 0);
  assertEquals(failed.errors, ["R2 DELETE 500"]);
});
