/**
 * Explorer place photos on Cloudflare R2 (docs/cloudflare-r2-storage-migration-audit.md §0, slice 8).
 * deno test --no-config --no-lock --no-check --allow-env --allow-read <this file>
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { keyFromFileLink } from "../_shared/objectStorage/fileLink.ts";
import {
  buildExplorerPhotoKey,
  EXPLORER_PHOTO_BUCKET,
  EXPLORER_PHOTO_CONTENT_TYPE,
  EXPLORER_PHOTO_LINK_SECONDS,
  explorerPhotoAddress,
  isExplorerPhotoOnR2,
  isR2ExplorerPhotosEnabled,
  legacyExplorerPhotoPath,
  putExplorerPhoto,
  R2_PRIVATE_BUCKET_ID,
  removeExplorerPhotos,
  signExplorerPhotoUrl,
} from "./explorer_photo_storage.ts";

const SHARED_ON: Record<string, string> = {
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  FILE_LINK_SECRET: "link-secret",
  SUPABASE_URL: "https://x.supabase.co",
};
const envOf = (vars: Record<string, string | undefined>) => (n: string) => vars[n];

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

Deno.test("explorer photos: switch is the shared R2 switch (no scan key needed)", () => {
  assert(isR2ExplorerPhotosEnabled(envOf(SHARED_ON)));
  for (const missing of Object.keys(SHARED_ON)) {
    assertEquals(isR2ExplorerPhotosEnabled(envOf({ ...SHARED_ON, [missing]: "" })), false, missing);
  }
  assertEquals(EXPLORER_PHOTO_CONTENT_TYPE, "image/jpeg");
  assertEquals(EXPLORER_PHOTO_LINK_SECONDS, 600);
});

Deno.test("explorer photos: keys are scoped to the uploader; the old path is unchanged", () => {
  const key = buildExplorerPhotoKey("user-1");
  assert(/^explorer\/user-1\/[0-9a-f-]{36}\.jpg$/.test(key), key);
  assert(buildExplorerPhotoKey("user-2").startsWith("explorer/user-2/"));
  assert(buildExplorerPhotoKey("../../x").startsWith("explorer/x/"));
  assert(buildExplorerPhotoKey(null).startsWith("explorer/no-user/"));

  const id = "2f6b1c1e-0000-4000-8000-000000000001";
  assertEquals(legacyExplorerPhotoPath("place-1", "jpg", id), `place-1/${id}.jpg`);
});

Deno.test("explorer photos: new keys and old paths are told apart", () => {
  assertEquals(isExplorerPhotoOnR2("explorer/user-1/x.jpg"), true);
  assertEquals(isExplorerPhotoOnR2("place-1/2f6b1c1e.jpg"), false);
  assertEquals(isExplorerPhotoOnR2(null), false);
});

Deno.test("explorer photos: writing is private, and the queue link is 10 minutes", async () => {
  const puts: Array<{ bucket: string; key: string; type: string; cache: string }> = [];
  await putExplorerPhoto("explorer/user-1/x.jpg", new Uint8Array([1]), "image/jpeg", async (bucket, key, _b, type, cache) => {
    puts.push({ bucket, key, type, cache });
  });
  assertEquals(puts, [{ bucket: "private", key: "explorer/user-1/x.jpg", type: "image/jpeg", cache: "private, no-store" }]);

  const calls: Array<{ key: string; seconds: number }> = [];
  const url = await signExplorerPhotoUrl("explorer/user-1/x.jpg", undefined, (key, seconds) => {
    calls.push({ key, seconds });
    return Promise.resolve(`https://r2.test/${key}?sig=1`);
  });
  assertEquals(url, "https://r2.test/explorer/user-1/x.jpg?sig=1");
  assertEquals(calls, [{ key: "explorer/user-1/x.jpg", seconds: 600 }]);
});

Deno.test("explorer photos: the stored address is a signed file-link", async () => {
  const address = await explorerPhotoAddress("explorer/user-1/x.jpg", envOf(SHARED_ON));
  assert(address.includes("/functions/v1/file-link?b=private&"), address);
  assertEquals(keyFromFileLink(address), "explorer/user-1/x.jpg");
});

Deno.test("explorer photos: delete routes new keys to R2 and old paths to the bucket", async () => {
  const r2Calls: Array<{ keys: string[]; bucket?: string }> = [];
  const supabase = fakeSupabase();
  const res = await removeExplorerPhotos(supabase, ["explorer/user-1/x.jpg", "place-1/y.jpg"], (keys, bucket) => {
    r2Calls.push({ keys, bucket });
    return Promise.resolve();
  });
  assertEquals(res, { removed: 2, errors: [] });
  assertEquals(r2Calls, [{ keys: ["explorer/user-1/x.jpg"], bucket: "private" }]);
  assertEquals(supabase.calls, [{ bucket: EXPLORER_PHOTO_BUCKET, paths: ["place-1/y.jpg"] }]);
});

Deno.test("explorer photos: a failed delete is reported, never thrown", async () => {
  const res = await removeExplorerPhotos(fakeSupabase(), ["explorer/user-1/x.jpg"], () =>
    Promise.reject(new Error("R2 DELETE 500")));
  assertEquals(res, { removed: 0, errors: ["R2 DELETE 500"] });
  assertEquals(R2_PRIVATE_BUCKET_ID, "r2:private");
});
