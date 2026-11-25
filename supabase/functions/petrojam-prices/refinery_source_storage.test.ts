/**
 * Refinery source documents on Cloudflare R2 (docs/cloudflare-r2-storage-migration-audit.md §0, slice 8).
 * deno test --no-config --no-lock --no-check --allow-env --allow-read <this file>
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildRefinerySourceKey,
  isR2RefinerySourcesEnabled,
  isRefinerySourceOnR2,
  legacyRefinerySourcePath,
  putRefinerySource,
  REFINERY_SOURCE_BUCKET,
  refinerySourceContentType,
  removeRefinerySources,
} from "./refinery_source_storage.ts";

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

Deno.test("refinery sources: switch is the shared R2 switch", () => {
  assert(isR2RefinerySourcesEnabled(envOf(SHARED_ON)));
  for (const missing of Object.keys(SHARED_ON)) {
    assertEquals(isR2RefinerySourcesEnabled(envOf({ ...SHARED_ON, [missing]: "" })), false, missing);
  }
});

Deno.test("refinery sources: the key mirrors the old path, platform-scoped, and stays deterministic", () => {
  const key = buildRefinerySourceKey("petrojam", "2026-11-24", "prices (Nov).pdf");
  assertEquals(key, "refinery-sources/platform/petrojam/2026-11-24/prices_Nov_.pdf");
  // Same name + date → same object (the old upsert behaviour), different date → new object.
  assertEquals(buildRefinerySourceKey("petrojam", "2026-11-24", "prices (Nov).pdf"), key);
  assert(buildRefinerySourceKey("petrojam", "2026-12-01", "prices (Nov).pdf") !== key);
  // Nothing escapes the platform folder.
  assert(buildRefinerySourceKey("../../x", "2026-11-24", "a.pdf").startsWith("refinery-sources/platform/x/"));
  assert(buildRefinerySourceKey("petrojam", "../../2026", "a.pdf").startsWith("refinery-sources/platform/petrojam/2026/"));
  assert(buildRefinerySourceKey(null, null, "").startsWith("refinery-sources/platform/no-refinery/no-date/"));

  // The old Supabase path is unchanged (still used when the switch is off).
  assertEquals(
    legacyRefinerySourcePath("petrojam", "2026-11-24", "prices (Nov).pdf"),
    "petrojam/2026-11-24/prices_Nov_.pdf",
  );
});

Deno.test("refinery sources: new keys and old paths are told apart; content type follows the name", () => {
  assertEquals(isRefinerySourceOnR2("refinery-sources/platform/petrojam/2026-11-24/a.pdf"), true);
  assertEquals(isRefinerySourceOnR2("petrojam/2026-11-24/a.pdf"), false);
  assertEquals(isRefinerySourceOnR2(null), false);

  assertEquals(refinerySourceContentType("a.PDF"), "application/pdf");
  assertEquals(refinerySourceContentType("a.xlsx"), "application/octet-stream");
});

Deno.test("refinery sources: writing is private with the no-store cache header", async () => {
  const puts: Array<{ bucket: string; key: string; type: string; cache: string }> = [];
  await putRefinerySource("refinery-sources/platform/petrojam/2026-11-24/a.pdf", new Uint8Array([1]), "application/pdf", async (bucket, key, _b, type, cache) => {
    puts.push({ bucket, key, type, cache });
  });
  assertEquals(puts, [{
    bucket: "private",
    key: "refinery-sources/platform/petrojam/2026-11-24/a.pdf",
    type: "application/pdf",
    cache: "private, no-store",
  }]);
});

Deno.test("refinery sources: delete routes new keys to R2 and old paths to the bucket", async () => {
  const r2Calls: Array<{ keys: string[]; bucket?: string }> = [];
  const supabase = fakeSupabase();
  const res = await removeRefinerySources(
    supabase,
    ["refinery-sources/platform/petrojam/2026-11-24/a.pdf", "petrojam/2026-10-01/b.pdf"],
    (keys, bucket) => {
      r2Calls.push({ keys, bucket });
      return Promise.resolve();
    },
  );
  assertEquals(res, { removed: 2, errors: [] });
  assertEquals(r2Calls, [{ keys: ["refinery-sources/platform/petrojam/2026-11-24/a.pdf"], bucket: "private" }]);
  assertEquals(supabase.calls, [{ bucket: REFINERY_SOURCE_BUCKET, paths: ["petrojam/2026-10-01/b.pdf"] }]);
});

Deno.test("refinery sources: a failed delete is reported, never thrown", async () => {
  const res = await removeRefinerySources(
    fakeSupabase(),
    ["refinery-sources/platform/petrojam/2026-11-24/a.pdf"],
    () => Promise.reject(new Error("R2 DELETE 500")),
  );
  assertEquals(res, { removed: 0, errors: ["R2 DELETE 500"] });
});
