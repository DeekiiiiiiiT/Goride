/**
 * Parts import source files on Cloudflare R2 (docs/cloudflare-r2-storage-migration-audit.md §0, slice 2).
 * deno test --no-config --no-lock --no-check --allow-env --allow-read <this file>
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildPartsImportR2Key,
  isPartsImportR2Key,
  isR2PrivateLinksEnabled,
  legacyPartsImportPath,
  PARTS_IMPORT_BUCKET,
  PARTS_IMPORT_CACHE,
  PARTS_IMPORT_CONTENT_TYPE,
  PARTS_IMPORT_MAX_BYTES,
  parsePartsImportAddress,
  putPartsImportSource,
  readPartsImportSource,
  removePartsImportSources,
} from "./parts_import_storage.ts";

const KEY = "parts-imports/platform/2f6b1c1e-0000-4000-8000-000000000001/source.csv";

function fakeSupabase(opts: { download?: () => Promise<unknown>; remove?: () => Promise<unknown> } = {}) {
  const calls: { op: string; bucket: string; arg?: string }[] = [];
  return {
    calls,
    storage: {
      from: (bucket: string) => ({
        download: async (path: string) => {
          calls.push({ op: "download", bucket, arg: path });
          return (opts.download ?? (async () => ({ data: null, error: { message: "not found" } })))();
        },
        remove: async (paths: string[]) => {
          calls.push({ op: "remove", bucket, arg: paths.join(",") });
          return (opts.remove ?? (async () => ({ error: null })))();
        },
      }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

Deno.test("parts imports: the R2 switch is the same one the evidence slice uses", () => {
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

Deno.test("parts imports: 5 MB cap matches the old bucket (5242880 bytes)", () => {
  assertEquals(PARTS_IMPORT_MAX_BYTES, 5 * 1024 * 1024);
  assertEquals(PARTS_IMPORT_MAX_BYTES, 5242880);
});

Deno.test("parts imports: batch keys are platform-scoped and the old path is unchanged", () => {
  assertEquals(buildPartsImportR2Key("2f6b1c1e-0000-4000-8000-000000000001"), KEY);
  // A batch id can never escape its own folder.
  assertEquals(buildPartsImportR2Key("/../evil"), "parts-imports/platform/evil/source.csv");
  let threw = false;
  try {
    buildPartsImportR2Key("");
  } catch {
    threw = true;
  }
  assertEquals(threw, true);

  assertEquals(legacyPartsImportPath("batch-1"), "batch-1/source.csv");
  assertEquals(isPartsImportR2Key(KEY), true);
  assertEquals(isPartsImportR2Key("batch-1/source.csv"), false);
  assertEquals(isPartsImportR2Key(null), false);
  assertEquals(isPartsImportR2Key(""), false);
});

Deno.test("parts imports: both stored addresses parse (new R2 key and old Supabase path)", () => {
  assertEquals(parsePartsImportAddress(KEY), { bucket: "r2:private", path: KEY });
  assertEquals(parsePartsImportAddress("batch-1/source.csv"), {
    bucket: PARTS_IMPORT_BUCKET,
    path: "batch-1/source.csv",
  });
  assertEquals(
    parsePartsImportAddress("https://x.supabase.co/storage/v1/object/sign/parts-imports/batch-1/source.csv?token=t"),
    { bucket: PARTS_IMPORT_BUCKET, path: "batch-1/source.csv" },
  );
  assertEquals(parsePartsImportAddress(""), null);
  assertEquals(parsePartsImportAddress(null), null);
  // An unsafe key is refused rather than handed to the client.
  assertEquals(parsePartsImportAddress("parts-imports/platform/../evil/source.csv"), null);
});

Deno.test("parts imports: the check job reads R2 only — an old Supabase path is not read (M6)", async () => {
  const r2Calls: string[] = [];
  const r2Read = (key: string) => {
    r2Calls.push(key);
    return Promise.resolve(new TextEncoder().encode("vehicle,part_type\n…"));
  };

  const bytes = await readPartsImportSource(fakeSupabase(), KEY, r2Read);
  assertEquals(r2Calls, [KEY]);
  assertEquals(new TextDecoder().decode(bytes!), "vehicle,part_type\n…");

  // Old form (bare/URL) has no bytes any more: the readers show "Upload the CSV first" and the
  // Supabase bucket is never touched.
  const oldSupabase = fakeSupabase({
    download: async () => ({
      data: { arrayBuffer: async () => new TextEncoder().encode("old,csv").buffer },
      error: null,
    }),
  });
  assertEquals(await readPartsImportSource(oldSupabase, "batch-1/source.csv", r2Read), null);
  assertEquals(
    await readPartsImportSource(
      oldSupabase,
      "https://x.supabase.co/storage/v1/object/sign/parts-imports/batch-1/source.csv?token=t",
      r2Read,
    ),
    null,
  );
  assertEquals(r2Calls, [KEY]); // still only the one R2 read above
  assertEquals(oldSupabase.calls, []); // no Supabase download attempted
});

Deno.test("parts imports: a missing or unreadable file is null, not a thrown error", async () => {
  // Old address: no Supabase fallback, answered as "not there".
  assertEquals(await readPartsImportSource(fakeSupabase(), "batch-1/source.csv"), null);
  // R2 read fails (network / bad key): the caller still answers "Upload the CSV first".
  assertEquals(
    await readPartsImportSource(fakeSupabase(), KEY, () => Promise.reject(new Error("R2 GET 500"))),
    null,
  );
  assertEquals(await readPartsImportSource(fakeSupabase(), ""), null);
  assertEquals(await readPartsImportSource(fakeSupabase(), null), null);
});

Deno.test("parts imports: storing a source file writes the platform key as CSV and returns it", async () => {
  const puts: Array<{ bucket: string; key: string; type: string; cache: string; size: number }> = [];
  const bytes = new TextEncoder().encode("vehicle,part_type\nA,B");
  const key = await putPartsImportSource("2f6b1c1e-0000-4000-8000-000000000001", bytes, async (bucket, k, data, type, cache) => {
    puts.push({ bucket, key: k, type, cache, size: data.byteLength });
  });
  assertEquals(key, KEY);
  assertEquals(puts, [{
    bucket: "private",
    key: KEY,
    type: PARTS_IMPORT_CONTENT_TYPE,
    cache: PARTS_IMPORT_CACHE,
    size: bytes.byteLength,
  }]);
});

Deno.test("parts imports: delete routes R2 keys to R2 and old paths to Supabase", async () => {
  const r2Calls: string[][] = [];
  const supabase = fakeSupabase();
  const res = await removePartsImportSources(supabase, [KEY, "batch-1/source.csv", ""], (keys) => {
    r2Calls.push(keys);
    return Promise.resolve();
  });
  assertEquals(res, { removed: 2, errors: [], skipped: 1 });
  assertEquals(r2Calls, [[KEY]]);
  assertEquals(supabase.calls, [{ op: "remove", bucket: PARTS_IMPORT_BUCKET, arg: "batch-1/source.csv" }]);
});

Deno.test("parts imports: a failed delete is reported, not thrown", async () => {
  const supabase = fakeSupabase({ remove: async () => ({ error: { message: "storage says no" } }) });
  const res = await removePartsImportSources(supabase, ["batch-1/source.csv"]);
  assertEquals(res.errors, ["storage says no"]);
  assertEquals(res.removed, 0);

  const r2Fail = await removePartsImportSources(fakeSupabase(), [KEY], () => Promise.reject(new Error("R2 DELETE 500")));
  assertEquals(r2Fail.errors, ["R2 DELETE 500"]);
  assertEquals(r2Fail.removed, 0);
});
