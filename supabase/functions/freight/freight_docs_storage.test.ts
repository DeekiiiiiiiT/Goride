/**
 * Freight org documents on Cloudflare R2 (docs/cloudflare-r2-storage-migration-audit.md §0, slice 6).
 * deno test --no-config --no-lock --no-check --allow-env --allow-read <this file>
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildFreightDocR2Key,
  FREIGHT_DOCS_BUCKET,
  FREIGHT_DOCS_CACHE,
  FREIGHT_DOCS_FOLDER,
  FREIGHT_DOCS_LINK_SECONDS,
  FREIGHT_DOCS_MAX_BYTES,
  FREIGHT_DOCS_MIMES,
  isFreightDocOnR2,
  isR2FreightDocsEnabled,
  legacyFreightDocPath,
  putFreightDoc,
  R2_PRIVATE_BUCKET_ID,
  removeFreightDoc,
  signFreightDocUrl,
} from "./freight_docs_storage.ts";

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

Deno.test("freight docs: the R2 switch is the same one the evidence slice uses", () => {
  const full: Record<string, string> = {
    R2_ACCOUNT_ID: "a",
    R2_ACCESS_KEY_ID: "b",
    R2_SECRET_ACCESS_KEY: "c",
    FILE_LINK_SECRET: "d",
    SUPABASE_URL: "https://x.supabase.co",
  };
  assert(isR2FreightDocsEnabled((n) => full[n]));
  for (const missing of Object.keys(full)) {
    assertEquals(isR2FreightDocsEnabled((n) => (n === missing ? "" : full[n])), false, missing);
  }
});

Deno.test("freight docs: limits are the old bucket's (20 MB, PDF or image)", () => {
  assertEquals(FREIGHT_DOCS_MAX_BYTES, 20 * 1024 * 1024);
  assertEquals(FREIGHT_DOCS_MAX_BYTES, 20971520);
  assertEquals(
    [...FREIGHT_DOCS_MIMES].sort(),
    ["application/pdf", "image/heic", "image/jpeg", "image/png", "image/webp"],
  );
  assertEquals(FREIGHT_DOCS_CACHE, "private, no-store");
  assertEquals(FREIGHT_DOCS_LINK_SECONDS, 3600);
  assertEquals(FREIGHT_DOCS_FOLDER, "freight-docs");
  assertEquals(FREIGHT_DOCS_BUCKET, "enterprise-freight-docs");
});

Deno.test("freight docs: keys are scoped by organization and kind; the old path is unchanged", () => {
  const key = buildFreightDocR2Key("org-1", "invoice", "pdf");
  assert(/^freight-docs\/org-1\/invoice\/[0-9a-f-]{36}\.pdf$/.test(key), key);

  // Another organization never shares a folder.
  assert(buildFreightDocR2Key("org-2", "invoice", "pdf").startsWith("freight-docs/org-2/"));
  // A path-ish org or kind can never escape its own folder.
  assertEquals(buildFreightDocR2Key("../../evil", "pod", "jpg").startsWith("freight-docs/evil/pod/"), true);
  assert(buildFreightDocR2Key("org-1", "../etc", "jpg").startsWith("freight-docs/org-1/etc/"));
  assert(buildFreightDocR2Key(null, null, ".PNG").startsWith("freight-docs/no-org/other/"));
  assertEquals(buildFreightDocR2Key(null, null, ".PNG").endsWith(".png"), true);

  const id = "2f6b1c1e-0000-4000-8000-000000000001";
  assertEquals(legacyFreightDocPath("org-1", "invoice", "pdf", id), `org-1/invoice/${id}.pdf`);
  assertEquals(legacyFreightDocPath("org-1", "pod", "jpg", id), `org-1/pod/${id}.jpg`);
});

Deno.test("freight docs: new and old rows are told apart by bucket_id or folder", () => {
  assertEquals(isFreightDocOnR2(R2_PRIVATE_BUCKET_ID, "freight-docs/org-1/invoice/x.pdf"), true);
  // A row written without the marker is still recognised by its folder.
  assertEquals(isFreightDocOnR2(FREIGHT_DOCS_BUCKET, "freight-docs/org-1/invoice/x.pdf"), true);
  assertEquals(isFreightDocOnR2(FREIGHT_DOCS_BUCKET, "org-1/invoice/x.pdf"), false);
  assertEquals(isFreightDocOnR2(null, "org-1/invoice/x.pdf"), false);
  assertEquals(isFreightDocOnR2(null, null), false);
});

Deno.test("freight docs: writing goes to roam-private, private cache", async () => {
  const puts: Array<{ bucket: string; key: string; type: string; cache: string }> = [];
  await putFreightDoc("freight-docs/org-1/invoice/x.pdf", new Uint8Array([1]), "application/pdf", async (bucket, key, _b, type, cache) => {
    puts.push({ bucket, key, type, cache });
  });
  assertEquals(puts, [{
    bucket: "private",
    key: "freight-docs/org-1/invoice/x.pdf",
    type: "application/pdf",
    cache: FREIGHT_DOCS_CACHE,
  }]);
});

Deno.test("freight docs: the read link is a short-lived R2 link for new rows", async () => {
  const calls: Array<{ key: string; seconds: number }> = [];
  const url = await signFreightDocUrl("freight-docs/org-1/invoice/x.pdf", 900, (key, seconds) => {
    calls.push({ key, seconds });
    return Promise.resolve(`https://r2.test/${key}?sig=1`);
  });
  assertEquals(url, "https://r2.test/freight-docs/org-1/invoice/x.pdf?sig=1");
  assertEquals(calls, [{ key: "freight-docs/org-1/invoice/x.pdf", seconds: 900 }]);

  // Default lifetime matches the Supabase signed URL this replaces.
  let defaultSeconds = 0;
  await signFreightDocUrl("freight-docs/org-1/invoice/x.pdf", undefined, (_k, seconds) => {
    defaultSeconds = seconds;
    return Promise.resolve("u");
  });
  assertEquals(defaultSeconds, 3600);
});

Deno.test("freight docs: delete routes new rows to R2 and old rows to the old bucket", async () => {
  const r2Calls: Array<{ keys: string[]; bucket?: string }> = [];
  const supabase = fakeSupabase();
  const r2Remove = (keys: string[], bucket?: string) => {
    r2Calls.push({ keys, bucket });
    return Promise.resolve();
  };

  const newRow = await removeFreightDoc(supabase, R2_PRIVATE_BUCKET_ID, "freight-docs/org-1/invoice/x.pdf", r2Remove);
  assertEquals(newRow, { removed: 1, errors: [] });

  const oldRow = await removeFreightDoc(supabase, FREIGHT_DOCS_BUCKET, "org-1/invoice/y.pdf", r2Remove);
  assertEquals(oldRow, { removed: 1, errors: [] });

  // A row missing bucket_id still deletes from the old bucket.
  const noBucket = await removeFreightDoc(supabase, null, "org-1/invoice/z.pdf", r2Remove);
  assertEquals(noBucket, { removed: 1, errors: [] });

  assertEquals(r2Calls, [{ keys: ["freight-docs/org-1/invoice/x.pdf"], bucket: "private" }]);
  assertEquals(supabase.calls, [
    { bucket: FREIGHT_DOCS_BUCKET, paths: ["org-1/invoice/y.pdf"] },
    { bucket: FREIGHT_DOCS_BUCKET, paths: ["org-1/invoice/z.pdf"] },
  ]);
});

Deno.test("freight docs: a failed R2 delete is reported, never thrown", async () => {
  const res = await removeFreightDoc(fakeSupabase(), R2_PRIVATE_BUCKET_ID, "freight-docs/org-1/invoice/x.pdf", () =>
    Promise.reject(new Error("R2 DELETE 500")));
  assertEquals(res, { removed: 0, errors: ["R2 DELETE 500"] });

  const badSupabase = {
    storage: { from: () => ({ remove: async () => ({ error: { message: "storage says no" } }) }) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const old = await removeFreightDoc(badSupabase, FREIGHT_DOCS_BUCKET, "org-1/invoice/y.pdf");
  assertEquals(old.errors, ["storage says no"]);
});
