/**
 * Parts request photos on Cloudflare R2 (docs/cloudflare-r2-storage-migration-audit.md §0, slice 1).
 * deno test --no-config --no-lock --no-check --allow-env --allow-read <this file>
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { isR2PrivateLinksEnabled, R2_PRIVATE_BUCKET_ID, signFileLink } from "../_shared/objectStorage/fileLink.ts";
import {
  buildLegacyPartsPhotoPath,
  buildPartsPhotoR2Key,
  isPartsPhotoAddressForOrg,
  isPartsPhotoKeyForOrg,
  PARTS_PHOTO_BUCKET,
  PARTS_PHOTO_MAX_BYTES,
  PARTS_PHOTO_MIMES,
  parsePartsPhotoAddress,
  removePartsRequestPhotos,
  safeOrgFolder,
} from "./parts_request_photo_storage.ts";

Deno.test("parts photos: the R2 switch needs all R2 keys + FILE_LINK_SECRET + SUPABASE_URL", () => {
  const full: Record<string, string> = {
    R2_ACCOUNT_ID: "a",
    R2_ACCESS_KEY_ID: "b",
    R2_SECRET_ACCESS_KEY: "c",
    FILE_LINK_SECRET: "d",
    SUPABASE_URL: "https://x.supabase.co",
  };
  assert(isR2PrivateLinksEnabled((n) => full[n]));
  for (const missing of Object.keys(full)) {
    assertEquals(isR2PrivateLinksEnabled((n) => (n === missing ? "" : full[n])), false, missing);
  }
});

Deno.test("parts photos: limits are the same as the old Supabase bucket (8 MB, jpeg/png/webp)", () => {
  assertEquals(PARTS_PHOTO_MAX_BYTES, 8 * 1024 * 1024);
  assertEquals([...PARTS_PHOTO_MIMES].sort(), ["image/jpeg", "image/png", "image/webp"]);
});

Deno.test("parts photos: new keys are scoped to the caller's org", () => {
  const key = buildPartsPhotoR2Key("org-1", "jpg");
  assert(/^parts-requests\/org-1\/[0-9a-f-]{36}\.jpg$/.test(key), key);
  assert(isPartsPhotoKeyForOrg(key, "org-1"));
  assertEquals(isPartsPhotoKeyForOrg(key, "org-2"), false);
  // A sibling org whose id starts with the same characters is still another org.
  assertEquals(isPartsPhotoKeyForOrg(key.replace("org-1/", "org-10/"), "org-1"), false);
  assertEquals(buildPartsPhotoR2Key("org-1", ".PNG").endsWith(".png"), true);
  assertEquals(buildPartsPhotoR2Key("", "webp").startsWith("parts-requests/no-org/"), true);
  // A path-ish org can never escape its own folder.
  assertEquals(buildPartsPhotoR2Key("../evil/", "jpg").startsWith("parts-requests/evil_/"), true);
  assertEquals(isPartsPhotoKeyForOrg("parts-requests/org-1/../../org-2/x.jpg", "org-1"), false);
  assertEquals(safeOrgFolder(null), "no-org");
});

Deno.test("parts photos: the old path shape is unchanged (org/uuid-name)", () => {
  const id = "2f6b1c1e-0000-4000-8000-000000000001";
  assertEquals(
    buildLegacyPartsPhotoPath("org-1", "my part photo.jpg", id),
    `org-1/${id}-mypartphoto.jpg`,
  );
  assertEquals(buildLegacyPartsPhotoPath("org-1", "", id), `org-1/${id}-photo`);
  // Same sanitiser as before: only [a-zA-Z0-9._-] survive, 80 characters at most.
  assertEquals(buildLegacyPartsPhotoPath("org-1", "../../x.jpg", id), `org-1/${id}-....x.jpg`);
  assertEquals(buildLegacyPartsPhotoPath("org-1", "a".repeat(200) + ".jpg", id), `org-1/${id}-${"a".repeat(80)}`);
});

Deno.test("parts photos: both stored addresses parse (new file-link and old Supabase path)", async () => {
  const key = "parts-requests/org-1/2f6b1c1e-0000-4000-8000-000000000001.jpg";
  const link = await signFileLink({ key, secret: "s", supabaseUrl: "https://x.supabase.co" });
  assertEquals(parsePartsPhotoAddress(link), { bucket: R2_PRIVATE_BUCKET_ID, path: key });

  assertEquals(parsePartsPhotoAddress("org-1/abc-photo.jpg"), {
    bucket: PARTS_PHOTO_BUCKET,
    path: "org-1/abc-photo.jpg",
  });
  assertEquals(
    parsePartsPhotoAddress("https://x.supabase.co/storage/v1/object/sign/parts-request-photos/org-1/abc-photo.jpg?token=t"),
    { bucket: PARTS_PHOTO_BUCKET, path: "org-1/abc-photo.jpg" },
  );
  assertEquals(parsePartsPhotoAddress(""), null);
  assertEquals(parsePartsPhotoAddress(null), null);
});

Deno.test("parts photos: an org can never read another org's address", async () => {
  const mine = await signFileLink({
    key: "parts-requests/org-1/2f6b1c1e-0000-4000-8000-000000000001.jpg",
    secret: "s",
    supabaseUrl: "https://x.supabase.co",
  });
  assertEquals(isPartsPhotoAddressForOrg(mine, "org-1"), true);
  assertEquals(isPartsPhotoAddressForOrg(mine, "org-2"), false);
  assertEquals(isPartsPhotoAddressForOrg("org-1/abc-photo.jpg", "org-1"), true);
  assertEquals(isPartsPhotoAddressForOrg("org-2/abc-photo.jpg", "org-1"), false);
  assertEquals(isPartsPhotoAddressForOrg("garbage", ""), false);
});

Deno.test("parts photos: delete routes R2 keys to R2 and old paths to Supabase", async () => {
  const r2Calls: string[][] = [];
  const sbCalls: { bucket: string; paths: string[] }[] = [];
  const fakeSupabase = {
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => {
          sbCalls.push({ bucket, paths });
          return Promise.resolve({ error: null });
        },
      }),
    },
  };
  const r2Remove = (keys: string[]) => {
    r2Calls.push(keys);
    return Promise.resolve();
  };
  const key = "parts-requests/org-1/2f6b1c1e-0000-4000-8000-000000000001.jpg";
  const link = await signFileLink({ key, secret: "s", supabaseUrl: "https://x.supabase.co" });

  const res = await removePartsRequestPhotos(fakeSupabase, [link, "org-1/abc-photo.jpg"], { r2Remove });
  assertEquals(res, { removed: 2, refused: 0, errors: [] });
  assertEquals(r2Calls, [[key]]);
  assertEquals(sbCalls, [{ bucket: PARTS_PHOTO_BUCKET, paths: ["org-1/abc-photo.jpg"] }]);
});

Deno.test("parts photos: delete refuses another org's file and reports failures", async () => {
  const r2Calls: string[][] = [];
  const fakeSupabase = {
    storage: {
      from: () => ({
        remove: () => Promise.resolve({ error: { message: "storage says no" } }),
      }),
    },
  };
  const other = await signFileLink({
    key: "parts-requests/org-2/2f6b1c1e-0000-4000-8000-000000000002.jpg",
    secret: "s",
    supabaseUrl: "https://x.supabase.co",
  });

  const res = await removePartsRequestPhotos(fakeSupabase, [other, "org-2/abc-photo.jpg", ""], {
    orgId: "org-1",
    r2Remove: (keys) => {
      r2Calls.push(keys);
      return Promise.resolve();
    },
  });
  assertEquals(res.removed, 0);
  assertEquals(res.refused, 3);
  assertEquals(r2Calls, []);

  const failed = await removePartsRequestPhotos(fakeSupabase, ["org-1/abc-photo.jpg"], { orgId: "org-1" });
  assertEquals(failed.errors, ["storage says no"]);
  assertEquals(failed.removed, 0);
});
