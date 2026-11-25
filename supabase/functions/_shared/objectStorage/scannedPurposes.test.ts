/**
 * The three virus-scanned purposes (courier docs, driver docs, merchant KYC)
 * docs/cloudflare-r2-storage-migration-audit.md §0, slice 7.
 * deno test --no-config --no-lock --no-check --allow-env --allow-read <this file>
 */
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { keyFromFileLink } from "./fileLink.ts";
import { UPLOAD_PURPOSES } from "./purposes.ts";
import {
  buildScannedDocKey,
  isScannedDocOnR2,
  isScannedPurpose,
  isScannedR2Enabled,
  putScannedDoc,
  removeScannedDoc,
  R2_PRIVATE_BUCKET_ID,
  SCANNED_DOC_CACHE,
  SCANNED_DOC_LINK_SECONDS,
  SCANNED_PURPOSE_LEGACY_BUCKET,
  SCANNED_PURPOSES,
  scannedDocAddress,
  scannedPurposeFolder,
  signScannedDocUrl,
} from "./scannedPurposes.ts";

/** The five secrets the shared R2 switch needs (all set in production). */
const SHARED_SWITCH_ON: Record<string, string> = {
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  FILE_LINK_SECRET: "link-secret",
  SUPABASE_URL: "https://x.supabase.co",
};

const envOf = (vars: Record<string, string | undefined>) => (name: string) => vars[name];

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

Deno.test("scanned purposes: shared R2 switch ON but no MALWARE_SCAN_API_KEY → old path", () => {
  // This is the production case today: R2 is on for everything else, the scan key is not set.
  assertEquals(isScannedR2Enabled(envOf(SHARED_SWITCH_ON)), false);
  // `MALWARE_SCAN_FAIL_OPEN=1` must not count as "scanned".
  assertEquals(isScannedR2Enabled(envOf({ ...SHARED_SWITCH_ON, MALWARE_SCAN_FAIL_OPEN: "1" })), false);
  // An empty value does not count either.
  assertEquals(isScannedR2Enabled(envOf({ ...SHARED_SWITCH_ON, MALWARE_SCAN_API_KEY: "  " })), false);

  // And with the key it does switch on.
  assert(isScannedR2Enabled(envOf({ ...SHARED_SWITCH_ON, MALWARE_SCAN_API_KEY: "scan-key" })));
});

Deno.test("scanned purposes: the scan key alone is not enough — the shared R2 switch must be on", () => {
  const full = { ...SHARED_SWITCH_ON, MALWARE_SCAN_API_KEY: "scan-key" };
  for (const missing of Object.keys(SHARED_SWITCH_ON)) {
    assertEquals(isScannedR2Enabled(envOf({ ...full, [missing]: "" })), false, missing);
  }
});

Deno.test("scanned purposes: the three rows really scan, and keep their old bucket names", () => {
  assertEquals([...SCANNED_PURPOSES].sort(), ["courier-docs", "driver-docs", "merchant-kyc"]);
  for (const purpose of SCANNED_PURPOSES) {
    assertEquals(UPLOAD_PURPOSES[purpose].scan, true, purpose);
    assertEquals(UPLOAD_PURPOSES[purpose].bucket, "private", purpose);
    assertEquals(SCANNED_PURPOSE_LEGACY_BUCKET[purpose], UPLOAD_PURPOSES[purpose].replaces, purpose);
    assert(isScannedPurpose(purpose));
  }
  assertEquals(isScannedPurpose("evidence"), false);
  assertEquals(isScannedPurpose(null), false);
  assertEquals(SCANNED_DOC_CACHE, "private, no-store");
  assertEquals(SCANNED_DOC_LINK_SECONDS, 3600);
});

Deno.test("scanned purposes: keys are scoped to the owner and never escape their folder", () => {
  const uuid = "2f6b1c1e-0000-4000-8000-000000000001";
  assertEquals(
    buildScannedDocKey({ purpose: "merchant-kyc", scopeId: "m-1", ext: "pdf", label: "id_front", uuid }),
    `merchant-kyc/m-1/id_front-${uuid}.pdf`,
  );
  assertEquals(
    buildScannedDocKey({ purpose: "courier-docs", scopeId: "u-1", ext: "jpg", uuid }),
    `courier-docs/u-1/${uuid}.jpg`,
  );
  assertEquals(
    buildScannedDocKey({ purpose: "driver-docs", scopeId: "u-2", ext: "PNG", uuid }),
    `driver-docs/u-2/${uuid}.png`,
  );
  // Another owner never shares a folder; a path-ish owner can't climb out.
  assert(buildScannedDocKey({ purpose: "merchant-kyc", scopeId: "m-2", ext: "pdf" }).startsWith("merchant-kyc/m-2/"));
  assert(buildScannedDocKey({ purpose: "merchant-kyc", scopeId: "../../x", ext: "pdf" }).startsWith("merchant-kyc/x/"));
  assert(buildScannedDocKey({ purpose: "courier-docs", scopeId: null, ext: "jpg" }).startsWith("courier-docs/no-owner/"));
  // Labels are sanitised, never a caller file name.
  assert(buildScannedDocKey({ purpose: "merchant-kyc", scopeId: "m-1", ext: "pdf", label: "../../etc" }).startsWith("merchant-kyc/m-1/etc-"));
  assertEquals(scannedPurposeFolder("merchant-kyc"), "merchant-kyc");
});

Deno.test("scanned purposes: new keys and old stored paths are told apart", () => {
  assertEquals(isScannedDocOnR2("merchant-kyc", "merchant-kyc/m-1/id_front-x.pdf"), true);
  assertEquals(isScannedDocOnR2("merchant-kyc", "m-1/id_front-1699999999999.pdf"), false);
  assertEquals(isScannedDocOnR2("courier-docs", "courier-docs/u-1/x.jpg"), true);
  assertEquals(isScannedDocOnR2("courier-docs", "u-1/docs/abc.jpg"), false);
  assertEquals(isScannedDocOnR2("driver-docs", "driver-docs/u-1/license.jpg"), true);
  assertEquals(isScannedDocOnR2("driver-docs", "u-1/license.jpg"), false);
  assertEquals(isScannedDocOnR2("driver-docs", null), false);
});

Deno.test("scanned purposes: the stored address is a signed file-link; the staff link is short-lived", async () => {
  const key = "merchant-kyc/m-1/id_front-x.pdf";
  const address = await scannedDocAddress(
    key,
    envOf({ FILE_LINK_SECRET: "link-secret", SUPABASE_URL: "https://x.supabase.co" }),
  );
  assert(address.includes("/functions/v1/file-link?b=private&"), address);
  assertEquals(keyFromFileLink(address), key);

  const calls: Array<{ key: string; seconds: number }> = [];
  const url = await signScannedDocUrl(key, 3600, (k, seconds) => {
    calls.push({ key: k, seconds });
    return Promise.resolve(`https://r2.test/${k}?sig=1`);
  });
  assertEquals(url, "https://r2.test/merchant-kyc/m-1/id_front-x.pdf?sig=1");
  assertEquals(calls, [{ key, seconds: 3600 }]);
});

Deno.test("scanned purposes: writing goes to roam-private with a private cache header", async () => {
  const puts: Array<{ bucket: string; key: string; type: string; cache: string }> = [];
  await putScannedDoc("merchant-kyc/m-1/id_front-x.pdf", new Uint8Array([1]), "application/pdf", async (bucket, key, _b, type, cache) => {
    puts.push({ bucket, key, type, cache });
  });
  assertEquals(puts, [{
    bucket: "private",
    key: "merchant-kyc/m-1/id_front-x.pdf",
    type: "application/pdf",
    cache: SCANNED_DOC_CACHE,
  }]);
});

Deno.test("scanned purposes: delete routes new keys to R2 and old paths to their old bucket", async () => {
  const r2Calls: Array<{ keys: string[]; bucket?: string }> = [];
  const r2Remove = (keys: string[], bucket?: string) => {
    r2Calls.push({ keys, bucket });
    return Promise.resolve();
  };
  const supabase = fakeSupabase();

  assertEquals(
    await removeScannedDoc(supabase, "merchant-kyc", "merchant-kyc/m-1/id_front-x.pdf", r2Remove),
    { removed: 1, errors: [] },
  );
  assertEquals(
    await removeScannedDoc(supabase, "merchant-kyc", "m-1/id_front-1699999999999.pdf", r2Remove),
    { removed: 1, errors: [] },
  );
  assertEquals(
    await removeScannedDoc(supabase, "courier-docs", "u-1/docs/abc.pdf", r2Remove),
    { removed: 1, errors: [] },
  );
  assertEquals(
    await removeScannedDoc(supabase, "driver-docs", "u-1/license.pdf", r2Remove),
    { removed: 1, errors: [] },
  );

  assertEquals(r2Calls, [{ keys: ["merchant-kyc/m-1/id_front-x.pdf"], bucket: "private" }]);
  assertEquals(supabase.calls, [
    { bucket: "merchant-documents", paths: ["m-1/id_front-1699999999999.pdf"] },
    { bucket: "courier-documents", paths: ["u-1/docs/abc.pdf"] },
    { bucket: "driver-documents", paths: ["u-1/license.pdf"] },
  ]);
});

Deno.test("scanned purposes: a failed delete is reported, never thrown", async () => {
  const res = await removeScannedDoc(fakeSupabase(), "merchant-kyc", "merchant-kyc/m-1/x.pdf", () =>
    Promise.reject(new Error("R2 DELETE 500")));
  assertEquals(res, { removed: 0, errors: ["R2 DELETE 500"] });

  const badSupabase = {
    storage: { from: () => ({ remove: async () => ({ error: { message: "storage says no" } }) }) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const old = await removeScannedDoc(badSupabase, "courier-docs", "u-1/docs/abc.pdf");
  assertEquals(old.errors, ["storage says no"]);
});

Deno.test("scanned purposes: R2 bucket id is the private marker and keys always get an id", () => {
  assertEquals(R2_PRIVATE_BUCKET_ID, "r2:private");
  // An empty id is replaced, never accepted as a malformed key.
  assert(/^merchant-kyc\/m-1\/id_front-[0-9a-f-]{36}\.pdf$/.test(
    buildScannedDocKey({ purpose: "merchant-kyc", scopeId: "m-1", ext: "pdf", label: "id_front", uuid: "" }),
  ));
});
