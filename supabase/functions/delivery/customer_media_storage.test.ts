/**
 * Customer avatars + issue photos on Cloudflare R2
 * (docs/cloudflare-r2-storage-migration-audit.md §0, slice 5).
 * deno test --no-config --no-lock --no-check --allow-env --allow-read <this file>
 */
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { R2_PRIVATE_BUCKET_ID, R2_PUBLIC_BUCKET_ID } from "./customer_media_storage.ts";
import {
  AVATAR_BUCKET,
  AVATAR_CACHE,
  avatarAddress,
  buildAvatarKey,
  buildIssuePhotoKey,
  CUSTOMER_PHOTO_MAX_BYTES,
  CUSTOMER_PHOTO_MIMES,
  isOwnAvatar,
  isOwnIssuePhoto,
  ISSUE_PHOTO_BUCKET,
  ISSUE_PHOTO_CACHE,
  issuePhotoAddress,
  legacyAvatarPath,
  legacyIssuePhotoPath,
  parseAvatarAddress,
  parseIssuePhotoAddress,
  putAvatar,
  putIssuePhoto,
  removeAvatars,
  removeIssuePhotos,
} from "./customer_media_storage.ts";

const BASE = "https://media.test";
const ENV: Record<string, string> = {
  FILE_LINK_SECRET: "secret-1",
  SUPABASE_URL: "https://x.supabase.co",
  R2_PUBLIC_BASE_URL: BASE,
};
const env = (n: string) => ENV[n];
const bytesOf = (text: string) => new TextEncoder().encode(text);

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

Deno.test("customer photos: limits are the old buckets' (2 MB, jpeg/png/webp)", () => {
  assertEquals(CUSTOMER_PHOTO_MAX_BYTES, 2 * 1024 * 1024);
  assertEquals(CUSTOMER_PHOTO_MAX_BYTES, 2097152);
  assertEquals([...CUSTOMER_PHOTO_MIMES].sort(), ["image/jpeg", "image/png", "image/webp"]);
  assertEquals(AVATAR_CACHE, "public, max-age=31536000, immutable");
  assertEquals(ISSUE_PHOTO_CACHE, "private, no-store");
});

Deno.test("customer photos: keys are scoped to the signed-in user with a content hash", async () => {
  const avatar = await buildAvatarKey("user-1", bytesOf("one"), "image/png");
  const issue = await buildIssuePhotoKey("user-1", bytesOf("one"), "image/png");

  assert(/^avatars\/user-1\/[0-9a-f]{16}\.png$/.test(avatar), avatar);
  assert(/^customer-issues\/user-1\/[0-9a-f]{16}\.png$/.test(issue), issue);

  // Same picture → same key; changed picture → new key (and a new public address).
  assertEquals(await buildAvatarKey("user-1", bytesOf("one"), "image/png"), avatar);
  assert((await buildAvatarKey("user-1", bytesOf("two"), "image/png")) !== avatar);
  // Another customer never shares a folder.
  assert((await buildAvatarKey("user-2", bytesOf("one"), "image/png")).startsWith("avatars/user-2/"));
  // Nothing can escape the folder.
  assert((await buildAvatarKey("../../x", bytesOf("one"), "image/jpeg")).startsWith("avatars/x/"));

  const id = "2f6b1c1e-0000-4000-8000-000000000001";
  assertEquals(legacyAvatarPath("user-1", "webp", id), `user-1/avatars/${id}.webp`);
  assertEquals(legacyIssuePhotoPath("user-1", "jpg", id), `user-1/issues/${id}.jpg`);
});

Deno.test("customer photos: addresses are the media URL (avatar) and a signed file-link (issue)", async () => {
  const avatar = await buildAvatarKey("user-1", bytesOf("one"), "image/png");
  assertEquals(avatarAddress(avatar, env), `${BASE}/${avatar}`);
  assertThrows(() => avatarAddress(avatar, () => undefined), Error, "R2_PUBLIC_BASE_URL not set");

  const issue = await buildIssuePhotoKey("user-1", bytesOf("one"), "image/png");
  const link = await issuePhotoAddress(issue, env);
  assert(link.includes("/functions/v1/file-link?b=private&"), link);
  assertEquals(parseIssuePhotoAddress(link), { storage: "r2", bucket: R2_PRIVATE_BUCKET_ID, path: issue });
});

Deno.test("customer photos: old avatars and old issue photos still parse", () => {
  const avatarKey = "avatars/user-1/2f6b1c1e2f6b1c1e.png";
  assertEquals(parseAvatarAddress(`${BASE}/${avatarKey}`, env), {
    storage: "r2",
    bucket: R2_PUBLIC_BUCKET_ID,
    path: avatarKey,
  });
  assertEquals(
    parseAvatarAddress("https://x.supabase.co/storage/v1/object/public/customer-avatars/user-1/avatars/abc.png"),
    { storage: "supabase", bucket: AVATAR_BUCKET, path: "user-1/avatars/abc.png" },
  );
  assertEquals(parseAvatarAddress("user-1/avatars/abc.png"), {
    storage: "supabase",
    bucket: AVATAR_BUCKET,
    path: "user-1/avatars/abc.png",
  });

  assertEquals(parseIssuePhotoAddress("user-1/issues/abc.png"), {
    storage: "supabase",
    bucket: ISSUE_PHOTO_BUCKET,
    path: "user-1/issues/abc.png",
  });
  assertEquals(
    parseIssuePhotoAddress("https://x.supabase.co/storage/v1/object/sign/customer-issue-photos/user-1/issues/a.png?token=t"),
    { storage: "supabase", bucket: ISSUE_PHOTO_BUCKET, path: "user-1/issues/a.png" },
  );

  assertEquals(parseAvatarAddress(""), null);
  assertEquals(parseAvatarAddress(null), null);
  assertEquals(parseAvatarAddress(`${BASE}/avatars/../x.png`, env), null);
  assertEquals(parseIssuePhotoAddress(""), null);

  // A bare key (what customers.avatar_path / issue addresses hold after the switch) resolves to R2.
  assertEquals(parseAvatarAddress(avatarKey, env), { storage: "r2", bucket: R2_PUBLIC_BUCKET_ID, path: avatarKey });
  assertEquals(parseIssuePhotoAddress("customer-issues/user-1/abc.png"), {
    storage: "r2",
    bucket: R2_PRIVATE_BUCKET_ID,
    path: "customer-issues/user-1/abc.png",
  });
});

Deno.test("customer photos: one customer can never delete or claim another's file", async () => {
  const mine = await buildAvatarKey("user-1", bytesOf("one"), "image/png");
  const theirs = await buildAvatarKey("user-2", bytesOf("one"), "image/png");
  assertEquals(isOwnAvatar(`${BASE}/${mine}`, "user-1", env), true);
  assertEquals(isOwnAvatar(`${BASE}/${theirs}`, "user-1", env), false);
  assertEquals(isOwnAvatar("user-1/avatars/abc.png", "user-1"), true);
  assertEquals(isOwnAvatar("user-2/avatars/abc.png", "user-1"), false);
  assertEquals(isOwnAvatar(null, "user-1"), false);

  const myIssue = await buildIssuePhotoKey("user-1", bytesOf("one"), "image/png");
  const theirIssue = await buildIssuePhotoKey("user-2", bytesOf("one"), "image/png");
  assertEquals(isOwnIssuePhoto(await issuePhotoAddress(myIssue, env), "user-1"), true);
  assertEquals(isOwnIssuePhoto(await issuePhotoAddress(theirIssue, env), "user-1"), false);
  assertEquals(isOwnIssuePhoto("user-1/issues/a.png", "user-1"), true);
  assertEquals(isOwnIssuePhoto("user-2/issues/a.png", "user-1"), false);
});

Deno.test("customer photos: avatar writes are public + immutable, issue photos private", async () => {
  const puts: Array<{ bucket: string; key: string; cache: string }> = [];
  await putAvatar("avatars/u/a.png", bytesOf("x"), "image/png", async (bucket, key, _b, _t, cache) => {
    puts.push({ bucket, key, cache });
  });
  await putIssuePhoto("customer-issues/u/a.png", bytesOf("x"), "image/png", async (bucket, key, _b, _t, cache) => {
    puts.push({ bucket, key, cache });
  });
  assertEquals(puts, [
    { bucket: "public", key: "avatars/u/a.png", cache: AVATAR_CACHE },
    { bucket: "private", key: "customer-issues/u/a.png", cache: ISSUE_PHOTO_CACHE },
  ]);
});

Deno.test("customer photos: avatar delete routes R2 to roam-public and old paths to Supabase", async () => {
  const r2Calls: Array<{ keys: string[]; bucket?: string }> = [];
  const supabase = fakeSupabase();
  const key = await buildAvatarKey("user-1", bytesOf("one"), "image/png");
  const res = await removeAvatars(supabase, [`${BASE}/${key}`, "user-1/avatars/old.png", ""], {
    userId: "user-1",
    env,
    r2Remove: (keys, bucket) => {
      r2Calls.push({ keys, bucket });
      return Promise.resolve();
    },
  });

  assertEquals(res, { removed: 2, errors: [], refused: 1 });
  assertEquals(r2Calls, [{ keys: [key], bucket: "public" }]);
  assertEquals(supabase.calls, [{ bucket: AVATAR_BUCKET, paths: ["user-1/avatars/old.png"] }]);
});

Deno.test("customer photos: delete refuses another user's avatar and reports failures", async () => {
  const r2Calls: string[][] = [];
  const supabase = fakeSupabase();
  const theirs = await buildAvatarKey("user-2", bytesOf("one"), "image/png");

  const res = await removeAvatars(supabase, [`${BASE}/${theirs}`, "user-2/avatars/x.png"], {
    userId: "user-1",
    env,
    r2Remove: (keys) => {
      r2Calls.push(keys);
      return Promise.resolve();
    },
  });
  assertEquals(res, { removed: 0, errors: [], refused: 2 });
  assertEquals(r2Calls, []);
  assertEquals(supabase.calls, []);

  const failed = await removeAvatars(fakeSupabase(), [`${BASE}/${theirs}`], {
    env,
    r2Remove: () => Promise.reject(new Error("R2 DELETE 500")),
  });
  assertEquals(failed.removed, 0);
  assertEquals(failed.errors, ["R2 DELETE 500"]);
});

Deno.test("customer photos: issue-photo delete routes R2 to roam-private and old paths to Supabase", async () => {
  const r2Calls: Array<{ keys: string[]; bucket?: string }> = [];
  const supabase = fakeSupabase();
  const key = await buildIssuePhotoKey("user-1", bytesOf("one"), "image/png");
  const address = await issuePhotoAddress(key, env);

  const res = await removeIssuePhotos(supabase, [address, "user-1/issues/old.png"], {
    userId: "user-1",
    r2Remove: (keys, bucket) => {
      r2Calls.push({ keys, bucket });
      return Promise.resolve();
    },
  });
  assertEquals(res, { removed: 2, errors: [], refused: 0 });
  assertEquals(r2Calls, [{ keys: [key], bucket: "private" }]);
  assertEquals(supabase.calls, [{ bucket: ISSUE_PHOTO_BUCKET, paths: ["user-1/issues/old.png"] }]);

  const refused = await removeIssuePhotos(fakeSupabase(), [address], { userId: "user-2" });
  assertEquals(refused, { removed: 0, errors: [], refused: 1 });
});

Deno.test("customer media: the issue form accepts the customer's own new link and refuses someone else's", async () => {
  const { isOwnIssuePhoto } = await import("./customer_media_storage.ts");
  const { signFileLink } = await import("../_shared/objectStorage/fileLink.ts");
  const own = await signFileLink({ key: "customer-issues/user-a/abc123.jpg", secret: "s", supabaseUrl: "https://x.supabase.co" });
  const other = await signFileLink({ key: "customer-issues/user-b/abc123.jpg", secret: "s", supabaseUrl: "https://x.supabase.co" });
  const wrongFolder = await signFileLink({ key: "evidence/user-a/fuel_receipt/x.jpg", secret: "s", supabaseUrl: "https://x.supabase.co" });
  if (!isOwnIssuePhoto(own, "user-a")) throw new Error("own link refused");
  if (isOwnIssuePhoto(other, "user-a")) throw new Error("other customer's link accepted");
  if (isOwnIssuePhoto(wrongFolder, "user-a")) throw new Error("non-issue key accepted");
  if (!isOwnIssuePhoto("user-a/issues/x.jpg", "user-a")) throw new Error("old path refused");
});
